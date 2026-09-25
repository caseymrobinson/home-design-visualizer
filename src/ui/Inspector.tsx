import { Copy, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { CATALOG_BY_TYPE, type Field as FieldDef } from '../lib/catalog';
import { findSurface, getSurfaces, rotForNormal, surfacePoint } from '../lib/geometry';
import type { Item } from '../lib/types';
import { deg } from '../lib/units';
import { useDesign, useStore } from '../store';
import { itemOnSurface } from '../three/placement';
import { ITEM_ICONS } from './icons';
import { ColorWell, Field, LengthInput, PanelShell, Section, Select, Stagger, Toggle } from './primitives';

function ParamField({ item, f }: { item: Item; f: FieldDef }) {
  const update = (v: string | number | boolean) => useStore.getState().updateItem(item.id, (it) => void (it.params[f.key] = v), true);
  const v = item.params[f.key];
  switch (f.kind) {
    case 'select':
      return (
        <Field label={f.label}>
          <Select value={String(v)} options={f.options} onChange={(x) => update(/^\d+$/.test(x) ? Number(x) : x)} />
        </Field>
      );
    case 'toggle':
      return (
        <Field label={f.label}>
          <Toggle on={v === true} onChange={update} />
        </Field>
      );
    case 'color':
      return (
        <Field label={f.label}>
          <ColorWell value={String(v)} onChange={update} />
        </Field>
      );
    case 'number':
      return (
        <Field label={f.label}>
          {f.unit === 'in' ? (
            <LengthInput value={Number(v)} min={f.min} max={f.max} inchesOnly onChange={update} />
          ) : (
            <input
              className="input"
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={Number(v)}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (isFinite(n)) update(Math.min(f.max, Math.max(f.min, n)));
              }}
              style={{ width: 150 }}
            />
          )}
        </Field>
      );
  }
}

export function Inspector() {
  const design = useDesign();
  const selectedId = useStore((s) => s.selectedId);
  const item = design.items.find((i) => i.id === selectedId);
  if (!item) return null;
  const entry = CATALOG_BY_TYPE[item.type];
  const Icon = ITEM_ICONS[item.type];
  const st = useStore.getState();
  const set = (patch: Partial<Item>) => st.updateItem(item.id, patch, true);
  const dimLabel = { w: 'Width', d: 'Depth', h: 'Height', z: 'Off floor' } as const;
  if (item.type === 'glass-panel') Object.assign(dimLabel, { d: 'Length' });
  const surface = findSurface(design.room, item.surface);
  const surfaces = getSurfaces(design.room);

  return (
    <PanelShell
      right
      title={
        <div className="insp-head">
          <div className="insp-icon">{Icon && <Icon size={20} strokeWidth={1.7} />}</div>
          <div>
            <div>{entry?.label ?? item.type}</div>
            <div className="panel-sub" style={{ fontFamily: 'var(--font)', marginTop: 3 }}>
              {entry?.blurb}
            </div>
          </div>
        </div>
      }
      onClose={() => st.select(null)}
    >
      <Stagger>
        <Section title="Size">
          <div className="dims-row">
            {entry?.dims.map((k) => (
              <div className="mini-field" key={k}>
                <label>{dimLabel[k]}</label>
                <LengthInput value={item[k]} min={k === 'z' ? 0 : 0.25} max={200} inchesOnly onChange={(v) => set({ [k]: v })} />
              </div>
            ))}
          </div>
          {entry?.dims.length === 0 && <div className="empty">Fixed size — just drag to place.</div>}
        </Section>
      </Stagger>

      <Stagger>
        <Section title="Placement">
          {entry?.mount === 'wall' ? (
            <>
              <Field label="Mounted on">
                <Select
                  value={surface?.key ?? ''}
                  options={surfaces.filter((s) => s.width >= Math.min(item.w, 12)).map((s) => ({ value: s.key, label: s.label }))}
                  onChange={(key) => {
                    const s = surfaces.find((q) => q.key === key)!;
                    const p = surfacePoint(s, s.width / 2);
                    set({ x: p.x, y: p.y, rot: rotForNormal(s.n), surface: s.ref });
                  }}
                />
              </Field>
              {surface && (
                <Field label="Center from left end">
                  <LengthInput
                    value={itemOnSurface(item, surface)}
                    min={0}
                    max={surface.width}
                    onChange={(u) => {
                      const p = surfacePoint(surface, u);
                      set({ x: p.x, y: p.y });
                    }}
                  />
                </Field>
              )}
            </>
          ) : (
            <Field label="Rotation" hint={`${Math.round(((deg(item.rot) % 360) + 360) % 360)}°`}>
              <div className="btn-row">
                <button className="chip" onClick={() => set({ rot: item.rot + Math.PI / 2 })}>
                  <RotateCcw size={14} /> 90°
                </button>
                <button className="chip" onClick={() => set({ rot: item.rot - Math.PI / 2 })}>
                  <RotateCw size={14} /> 90°
                </button>
              </div>
            </Field>
          )}
        </Section>
      </Stagger>

      {entry && entry.fields.length > 0 && (
        <Stagger>
          <Section title="Details">
            {entry.fields.map((f) => (
              <ParamField key={f.key} item={item} f={f} />
            ))}
          </Section>
        </Stagger>
      )}

      <Stagger>
        <Section>
          <div className="btn-row">
            <button className="chip" onClick={() => st.duplicateItem(item.id)}>
              <Copy size={14} /> Duplicate
            </button>
            <button className="chip" onClick={() => st.removeItem(item.id)} style={{ color: '#a3402a' }}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </Section>
      </Stagger>
    </PanelShell>
  );
}
