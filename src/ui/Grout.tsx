import { motion } from 'motion/react';
import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { GROUT_FAMILIES, MAPEI_GROUTS, groutLabel, mapeiGrout, nearestMapei } from '../lib/grout';
import type { Design, TileSpec } from '../lib/types';
import { uid } from '../lib/units';
import { useDesign, useStore } from '../store';
import { TileThumb } from './TileThumb';
import { Seg, Section, staggerItem } from './primitives';

export type TileTarget = 'floor' | 'wall';

const MAX_COMPARE = 4;
const TARGET_LABEL: Record<TileTarget, string> = { floor: 'Floor', wall: 'Shower walls' };

/** Tile id most used by the room's tile zones. */
export function wallTileId(d: Design) {
  const counts = new Map<string, number>();
  for (const z of d.room.tileZones) counts.set(z.tile, (counts.get(z.tile) ?? 0) + (z.u1 - z.u0) * (z.v1 - z.v0));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function surfaceTileIds(d: Design, target: TileTarget) {
  if (target === 'floor') return d.finishes.floorTile ? [d.finishes.floorTile] : [];
  return [...new Set(d.room.tileZones.map((z) => z.tile))];
}

/** Sets the grout on one surface without touching the other, even when both use the same tile. */
function setGrout(d: Design, target: TileTarget, hex: string) {
  const other = new Set(surfaceTileIds(d, target === 'floor' ? 'wall' : 'floor'));
  for (const id of surfaceTileIds(d, target)) {
    const spec = d.tiles[id];
    if (!spec || spec.groutColor.toLowerCase() === hex) continue;
    if (!other.has(id)) {
      spec.groutColor = hex;
      continue;
    }
    // Floor and walls share this tile: give this surface its own copy.
    const nid = uid('tile');
    d.tiles[nid] = { ...structuredClone(spec), id: nid, name: `${spec.name} · ${target === 'floor' ? 'floor' : 'walls'}`, groutColor: hex };
    if (target === 'floor') d.finishes.floorTile = nid;
    else d.room.tileZones.forEach((z) => z.tile === id && (z.tile = nid));
  }
}

/** "5038 Avalanche", or "Custom · nearest MAPEI 5015 Bone". */
export function groutHint(hex: string) {
  const m = mapeiGrout(hex);
  return m ? `MAPEI ${groutLabel(m)}` : `Custom · nearest MAPEI ${groutLabel(nearestMapei(hex))}`;
}

/** Inches of field to show so a couple of tiles and their joints read clearly. */
const closeSpan = (t: TileSpec) => Math.min(16, Math.max(5, 2.2 * Math.min(t.width, t.height)));

function GroutChip({ hex }: { hex: string }) {
  return <span className="grout-dot" style={{ background: hex }} />;
}

export function GroutSection({ target, setTarget }: { target: TileTarget; setTarget: (t: TileTarget) => void }) {
  const design = useDesign();
  const floor = design.tiles[design.finishes.floorTile];
  const wallId = wallTileId(design);
  const wall = wallId ? design.tiles[wallId] : undefined;
  const specs: Record<TileTarget, TileSpec | undefined> = { floor, wall };
  const current = specs[target]?.groutColor.toLowerCase();
  const [mode, setMode] = useState<'try' | 'compare'>('try');
  const [compare, setCompare] = useState<string[]>([]);

  const apply = (t: TileTarget, hex: string) => useStore.getState().update((d) => setGrout(d, t, hex));
  const toggleCompare = (hex: string) =>
    setCompare((c) => {
      if (c.includes(hex)) return c.filter((x) => x !== hex);
      if (c.length >= MAX_COMPARE) {
        useStore.getState().notify(`Compare up to ${MAX_COMPARE} grouts at once`);
        return c;
      }
      return [...c, hex];
    });
  const pick = (hex: string) => (mode === 'try' ? apply(target, hex) : toggleCompare(hex));

  return (
    <motion.div {...staggerItem}>
      <Section title="Grout · MAPEI">
        <div className="grout-targets">
          {(['floor', 'wall'] as const).map((t) => {
            const spec = specs[t];
            if (!spec) return null;
            const m = mapeiGrout(spec.groutColor);
            return (
              <button key={t} className={`grout-target ${target === t ? 'active' : ''}`} onClick={() => setTarget(t)}>
                <span className="grout-target-label">{TARGET_LABEL[t]}</span>
                <span className="grout-target-value">
                  <GroutChip hex={spec.groutColor} />
                  {m ? groutLabel(m) : 'Custom'}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ height: 10 }} />
        <Seg
          value={mode}
          options={[
            { value: 'try', label: 'Try on room' },
            { value: 'compare', label: `Compare${compare.length ? ` (${compare.length})` : ''}` },
          ]}
          onChange={(m) => {
            setMode(m);
            if (m === 'compare' && !compare.length) {
              // Seed with what's installed so there's a baseline to compare against.
              setCompare([...new Set([floor?.groutColor, wall?.groutColor].filter((h): h is string => !!h).map((h) => h.toLowerCase()))]);
            }
          }}
        />
        <div className="field-hint" style={{ margin: '8px 0 10px' }}>
          {mode === 'try'
            ? `Click a color to grout the ${target === 'floor' ? 'floor' : 'shower walls'} with it.`
            : `Pick up to ${MAX_COMPARE} colors to see them side by side on both tiles.`}
        </div>

        {mode === 'compare' && compare.length > 0 && (
          <div className="grout-compare">
            {compare.map((hex) => {
              const m = mapeiGrout(hex);
              return (
                <motion.div key={hex} className="grout-card" layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="grout-card-head">
                    <GroutChip hex={hex} />
                    <span className="grout-card-name">{m ? groutLabel(m) : `Custom ${hex}`}</span>
                    <button className="icon-btn" onClick={() => toggleCompare(hex)} aria-label="Remove from comparison">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="grout-pair">
                    {(['floor', 'wall'] as const).map((t) => {
                      const spec = specs[t];
                      if (!spec) return null;
                      const on = spec.groutColor.toLowerCase() === hex;
                      return (
                        <div key={t} className="grout-pair-item">
                          <TileThumb spec={{ ...spec, groutColor: hex }} size={280} span={closeSpan(spec)} />
                          <button className={`chip ${on ? 'primary' : ''}`} onClick={() => apply(t, hex)} disabled={on}>
                            {on ? <Check size={13} /> : <Plus size={13} />}
                            {on ? `On ${t === 'floor' ? 'floor' : 'walls'}` : `Use on ${t === 'floor' ? 'floor' : 'walls'}`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {GROUT_FAMILIES.map((f) => (
          <div key={f.id} className="grout-family">
            <div className="grout-family-label">{f.label}</div>
            <div className="swatches grout-swatches">
              {MAPEI_GROUTS.filter((g) => g.family === f.id).map((g) => {
                const selected = mode === 'try' ? current === g.hex : compare.includes(g.hex);
                return (
                  <button
                    key={g.code}
                    className={`swatch grout-swatch ${selected ? 'selected' : ''}`}
                    style={{ background: g.hex }}
                    data-tip={groutLabel(g)}
                    aria-label={`MAPEI ${groutLabel(g)}`}
                    aria-pressed={selected}
                    onClick={() => pick(g.hex)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {current && !mapeiGrout(current) && mode === 'try' && (
          <div className="grout-custom">
            <span className="field-hint">{groutHint(current)}</span>
            <button className="link" onClick={() => apply(target, nearestMapei(current).hex)}>
              Use it
            </button>
          </div>
        )}
        <div className="field-hint" style={{ marginTop: 10 }}>
          Screen colors are approximate. Confirm your pick against a physical MAPEI grout sample.
        </div>
      </Section>
    </motion.div>
  );
}
