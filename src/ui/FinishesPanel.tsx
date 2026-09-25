import { motion } from 'motion/react';
import { Copy, ImagePlus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PAINT_SWATCHES } from '../lib/tiles';
import type { Design, MetalFinish, TilePattern, TileSpec, TileSurface } from '../lib/types';
import { formatIn, uid } from '../lib/units';
import { METAL_LABELS, METAL_SWATCH, tilePreview } from '../materials/library';
import { useDesign, useStore } from '../store';
import { ColorWell, Field, LengthInput, PanelShell, Section, Seg, Select, Slider, staggerItem } from './primitives';

export function TileThumb({ spec, size = 160 }: { spec: TileSpec; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    tilePreview(spec, size).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [spec, size]);
  return (
    <motion.div
      className={`tile-thumb ${src ? '' : 'shimmer'}`}
      style={src ? { backgroundImage: `url(${src})` } : undefined}
      initial={false}
      animate={{ opacity: 1 }}
    />
  );
}

const tileMeta = (t: TileSpec) => `${formatIn(t.width)} × ${formatIn(t.height)} · ${PATTERN_LABEL[t.pattern]}`;

const PATTERN_LABEL: Record<TilePattern, string> = {
  grid: 'Stacked',
  running: 'Running bond',
  third: '⅓ offset',
  vertical: 'Vertical stack',
  herringbone: 'Herringbone',
  basketweave: 'Basketweave',
  hex: 'Hex',
};

const SURFACES: { value: TileSurface; label: string }[] = [
  { value: 'flat', label: 'Smooth porcelain' },
  { value: 'handmade', label: 'Handmade glaze' },
  { value: 'zellige', label: 'Zellige (wavy)' },
  { value: 'marble', label: 'Marble / veined' },
  { value: 'concrete', label: 'Limestone / concrete' },
  { value: 'terrazzo', label: 'Terrazzo' },
  { value: 'travertine', label: 'Travertine' },
  { value: 'quartz', label: 'Quartz' },
];

/** Tile id most used by the room's tile zones. */
function wallTileId(d: Design) {
  const counts = new Map<string, number>();
  for (const z of d.room.tileZones) counts.set(z.tile, (counts.get(z.tile) ?? 0) + (z.u1 - z.u0) * (z.v1 - z.v0));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function useDebounced<T>(fn: (v: T) => void, ms = 220) {
  const t = useRef<number | undefined>(undefined);
  return (v: T) => {
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(v), ms);
  };
}

function TileEditor({ spec }: { spec: TileSpec }) {
  const [draft, setDraft] = useState(spec);
  useEffect(() => setDraft(spec), [spec]);
  const commit = (next: TileSpec) => useStore.getState().update((d) => void (d.tiles[next.id] = next));
  const commitLater = useDebounced(commit, 260);
  const edit = (patch: Partial<TileSpec>, immediate = false) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (immediate) commit(next);
    else commitLater(next);
  };
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="row-card" style={{ background: 'rgba(255,255,255,0.7)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ width: 64 }}>
          <TileThumb spec={spec} size={120} />
        </div>
        <div style={{ flex: 1 }}>
          <input className="input" value={draft.name} onChange={(e) => edit({ name: e.currentTarget.value })} />
          <div className="tile-meta" style={{ marginTop: 5 }}>
            Changes apply everywhere this tile is used
          </div>
        </div>
      </div>
      <div className="grid-3">
        <div className="mini-field">
          <label>Width</label>
          <LengthInput value={draft.width} min={0.5} max={96} inchesOnly onChange={(v) => edit({ width: v }, true)} />
        </div>
        <div className="mini-field">
          <label>Height</label>
          <LengthInput value={draft.height} min={0.5} max={96} inchesOnly onChange={(v) => edit({ height: v }, true)} />
        </div>
        <div className="mini-field">
          <label>Grout joint</label>
          <LengthInput value={draft.groutWidth} min={0.01} max={1} inchesOnly onChange={(v) => edit({ groutWidth: v }, true)} />
        </div>
      </div>
      <div style={{ height: 8 }} />
      <Field label="Pattern">
        <Select value={draft.pattern} options={Object.entries(PATTERN_LABEL).map(([value, label]) => ({ value: value as TilePattern, label }))} onChange={(v) => edit({ pattern: v }, true)} />
      </Field>
      <Field label="Surface">
        <Select value={draft.surface} options={SURFACES} onChange={(v) => edit({ surface: v }, true)} />
      </Field>
      <Field label="Edge">
        <Select
          value={draft.edge}
          options={[
            { value: 'square', label: 'Rectified (sharp)' },
            { value: 'eased', label: 'Eased' },
            { value: 'pillowed', label: 'Pillowed (soft)' },
          ]}
          onChange={(v) => edit({ edge: v }, true)}
        />
      </Field>
      <div style={{ padding: '6px 0' }}>
        <Seg
          value={draft.finish}
          options={[
            { value: 'matte', label: 'Matte' },
            { value: 'satin', label: 'Satin' },
            { value: 'gloss', label: 'Gloss' },
          ]}
          onChange={(v) => edit({ finish: v }, true)}
        />
      </div>
      <Field label="Glaze colors" hint="Tiles pick randomly">
        <div className="color-row">
          {draft.colors.map((c, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <ColorWell value={c} onChange={(v) => edit({ colors: draft.colors.map((x, j) => (j === i ? v : x)) })} />
              {draft.colors.length > 1 && (
                <button
                  className="icon-btn"
                  style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, background: '#fff', boxShadow: 'var(--shadow-sm)', borderRadius: 8 }}
                  onClick={() => edit({ colors: draft.colors.filter((_, j) => j !== i) }, true)}
                  aria-label="Remove color"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          {draft.colors.length < 5 && (
            <button className="icon-btn" onClick={() => edit({ colors: [...draft.colors, draft.colors[draft.colors.length - 1]] }, true)} aria-label="Add color">
              <Plus size={15} />
            </button>
          )}
        </div>
      </Field>
      <Slider label="Tone variation" value={draft.variation} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => edit({ variation: v })} />
      <Field label="Grout color">
        <ColorWell value={draft.groutColor} onChange={(v) => edit({ groutColor: v })} />
      </Field>
      {(draft.surface === 'marble' || draft.surface === 'quartz') && (
        <Field label="Vein color">
          <ColorWell value={draft.vein ?? '#8a8580'} onChange={(v) => edit({ vein: v })} />
        </Field>
      )}
      <div style={{ height: 8 }} />
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          const url = await downscale(f, 768);
          edit({ image: url }, true);
          useStore.getState().notify('Photo applied to every tile face');
        }}
      />
      {draft.image ? (
        <div className="btn-row">
          <button className="chip" onClick={() => file.current?.click()}>
            <ImagePlus size={14} /> Replace photo
          </button>
          <button className="chip" onClick={() => edit({ image: undefined }, true)}>
            <X size={14} /> Use generated glaze
          </button>
        </div>
      ) : (
        <button className="upload" style={{ width: '100%' }} onClick={() => file.current?.click()}>
          <ImagePlus size={16} /> Upload a photo of the tile face
        </button>
      )}
    </div>
  );
}

async function downscale(file: File, max: number) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.88);
}

function TileGrid({ selected, onPick }: { selected?: string; onPick: (id: string) => void }) {
  const design = useDesign();
  return (
    <div className="tile-grid">
      {Object.values(design.tiles).map((t) => (
        <motion.button key={t.id} className={`tile-card ${selected === t.id ? 'selected' : ''}`} whileTap={{ scale: 0.96 }} onClick={() => onPick(t.id)}>
          <TileThumb spec={t} />
          <div>
            <div className="tile-name">{t.name}</div>
            <div className="tile-meta">{tileMeta(t)}</div>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

export function FinishesPanel() {
  const design = useDesign();
  const f = design.finishes;
  const [target, setTarget] = useState<'floor' | 'wall'>('floor');
  const wallTile = wallTileId(design);
  const selected = target === 'floor' ? f.floorTile : wallTile;
  const upd = (fn: (d: Design) => void) => useStore.getState().update(fn);
  const updLater = useDebounced((fn: (d: Design) => void) => useStore.getState().update(fn), 120);
  const spec = selected ? design.tiles[selected] : undefined;

  return (
    <PanelShell title="Finishes" sub="Tile is generated tile by tile — glaze, edges, grout and all — at true scale." onClose={() => useStore.getState().setPanel(null)}>
      <motion.div {...staggerItem}>
        <Section
          title="Tile"
          action={
            spec && (
              <button
                className="link"
                onClick={() => {
                  const id = uid('tile');
                  upd((d) => {
                    d.tiles[id] = { ...structuredClone(spec), id, name: `${spec.name} (copy)` };
                    if (target === 'floor') d.finishes.floorTile = id;
                    else d.room.tileZones.forEach((z) => z.tile === spec.id && (z.tile = id));
                  });
                }}
              >
                <Copy size={12} /> Duplicate
              </button>
            )
          }
        >
          <Seg
            value={target}
            options={[
              { value: 'floor', label: 'Floor' },
              { value: 'wall', label: `Shower walls (${design.room.tileZones.length})` },
            ]}
            onChange={setTarget}
          />
          <div style={{ height: 12 }} />
          <TileGrid
            selected={selected}
            onPick={(id) =>
              upd((d) => {
                if (target === 'floor') d.finishes.floorTile = id;
                else d.room.tileZones.forEach((z) => (z.tile = id));
              })
            }
          />
        </Section>
      </motion.div>

      {spec && (
        <motion.div {...staggerItem}>
          <Section title={`Edit “${spec.name}”`}>
            <TileEditor spec={spec} />
          </Section>
        </motion.div>
      )}

      <motion.div {...staggerItem}>
        <Section title="Wall paint">
          <div className="swatches">
            {PAINT_SWATCHES.map((p) => (
              <button
                key={p.hex}
                className={`swatch ${f.wallPaint.toLowerCase() === p.hex ? 'selected' : ''}`}
                style={{ background: p.hex }}
                data-tip={p.name}
                onClick={() => upd((d) => void (d.finishes.wallPaint = p.hex))}
              />
            ))}
          </div>
          <div style={{ height: 10 }} />
          <Field label="Custom color">
            <ColorWell value={f.wallPaint} onChange={(v) => updLater((d) => void (d.finishes.wallPaint = v))} />
          </Field>
          <div style={{ padding: '6px 0' }}>
            <Seg
              value={f.paintSheen}
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'eggshell', label: 'Eggshell' },
                { value: 'satin', label: 'Satin' },
                { value: 'semigloss', label: 'Semi-gloss' },
              ]}
              onChange={(v) => upd((d) => void (d.finishes.paintSheen = v))}
            />
          </div>
          <Field label="Ceiling">
            <ColorWell value={f.ceilingPaint} onChange={(v) => updLater((d) => void (d.finishes.ceilingPaint = v))} />
          </Field>
          <Field label="Trim & doors">
            <ColorWell value={f.trimPaint} onChange={(v) => updLater((d) => void (d.finishes.trimPaint = v))} />
          </Field>
        </Section>
      </motion.div>

      <motion.div {...staggerItem}>
        <Section title="Plumbing & hardware finish">
          <div className="grid-2">
            {(Object.keys(METAL_LABELS) as MetalFinish[]).map((m) => (
              <button
                key={m}
                className={`design-list-item ${f.metal === m ? 'active' : ''}`}
                style={{ padding: 8 }}
                onClick={() => upd((d) => void (d.finishes.metal = m))}
              >
                <span style={{ width: 26, height: 26, borderRadius: 8, background: METAL_SWATCH[m], boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
                <span style={{ fontSize: 12, fontWeight: 550 }}>{METAL_LABELS[m]}</span>
              </button>
            ))}
          </div>
        </Section>
      </motion.div>
    </PanelShell>
  );
}
