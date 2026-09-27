import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, DoorOpen, Plus, RectangleHorizontal, SquareDashed, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { CATALOG_BY_TYPE } from '../lib/catalog';
import { add, bounds, dot, findSurface, getSurfaces, getWalls, itemFootprint, mul, partitionCorners, projectOnSurface, rotForNormal, surfaceKey, surfacePoint, WALL_NAMES } from '../lib/geometry';
import type { Design, Opening, Partition, TileZone, Vec2 } from '../lib/types';
import { formatFtIn, snap, uid } from '../lib/units';
import { useDesign, useStore } from '../store';
import { Field, LengthInput, PanelShell, Section, Seg, Select, Slider, spring, staggerItem, Toggle } from './primitives';

/** Move corners and keep wall-mounted items at the same spot along their walls. */
function reshape(d: Design, corners: Vec2[]) {
  const keep = d.items
    .filter((it) => it.surface)
    .map((it) => {
      const s = findSurface(d.room, it.surface);
      return { it, u: s ? projectOnSurface(s, it).u : 0 };
    });
  d.room.corners = corners;
  for (const { it, u } of keep) {
    const s = findSurface(d.room, it.surface);
    if (!s) continue;
    const p = surfacePoint(s, Math.min(Math.max(u, 0), s.width));
    it.x = p.x;
    it.y = p.y;
    it.rot = rotForNormal(s.n);
  }
}

/** Change one wall's length, carrying the corners after it until the wall that runs back the other way. */
function setWallLength(d: Design, i: number, L: number) {
  const walls = getWalls(d.room);
  const w = walls[i];
  const delta = mul(w.dir, L - w.length);
  const n = d.room.corners.length;
  const next = d.room.corners.map((c) => ({ ...c }));
  for (let k = 1; k < n; k++) {
    const ci = (i + k) % n;
    next[ci] = add(next[ci], delta);
    const outgoing = walls[ci];
    if (dot(outgoing.dir, w.dir) < -0.9) break;
  }
  reshape(d, next);
}

function PlanSVG() {
  const design = useDesign();
  const room = design.room;
  const b = bounds(room.corners);
  const pad = room.wallThickness + 22;
  const vb = { x: b.minX - pad, y: b.minY - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  const walls = getWalls(room);
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const t = room.wallThickness;

  const toPlan = (e: PointerEvent | React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
  };

  const dragCorner = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    useStore.getState().checkpoint();
    const move = (ev: PointerEvent) => {
      const p = toPlan(ev);
      useStore.getState().update((d) => {
        const next = d.room.corners.map((c) => ({ ...c }));
        next[i] = { x: snap(p.x, 0.5), y: snap(p.y, 0.5) };
        // Keep square corners square: snap to neighbours' x / y when close
        for (const j of [(i + 1) % next.length, (i - 1 + next.length) % next.length]) {
          if (Math.abs(next[j].x - next[i].x) < 3) next[i].x = next[j].x;
          if (Math.abs(next[j].y - next[i].y) < 3) next[i].y = next[j].y;
        }
        reshape(d, next);
      }, false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const poly = (pts: Vec2[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="plan-wrap">
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
        <defs>
          <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(30,26,22,0.08)" strokeWidth="1.2" />
          </pattern>
        </defs>
        <polygon points={poly(room.corners)} fill="#fbf8f4" />
        <polygon points={poly(room.corners)} fill="url(#hatch)" />
        {/* items */}
        {design.items
          .filter((it) => !['ceiling-light', 'sconce', 'robe-hook', 'tp-holder', 'towel-ring', 'art', 'vanity-decor', 'shower-trim'].includes(it.type))
          .map((it) => {
            const fp = itemFootprint(it);
            return (
              <polygon
                key={it.id}
                points={poly(fp)}
                fill={it.type === 'rug' ? 'rgba(184,97,47,0.06)' : 'rgba(255,255,255,0.9)'}
                stroke="rgba(30,26,22,0.35)"
                strokeWidth={0.6}
                onClick={() => useStore.getState().select(it.id)}
                style={{ cursor: 'pointer' }}
              >
                <title>{CATALOG_BY_TYPE[it.type]?.label}</title>
              </polygon>
            );
          })}
        {/* walls */}
        {walls.map((w) => {
          const o = mul(w.n, -t);
          const pts = [w.a, w.b, add(w.b, o), add(w.a, o)];
          return (
            <polygon
              key={w.index}
              points={poly(pts)}
              fill={hover === w.index ? 'var(--accent)' : 'var(--ink)'}
              style={{ transition: 'fill .2s' }}
              onPointerEnter={() => setHover(w.index)}
              onPointerLeave={() => setHover(null)}
            />
          );
        })}
        {room.partitions.map((p) => {
          const c = partitionCorners(room, p);
          return c ? <polygon key={p.id} points={poly([c.p0, c.p1, c.p2, c.p3])} fill="var(--ink)" /> : null;
        })}
        {/* openings */}
        {room.openings.map((o) => {
          const w = walls[o.wall];
          if (!w) return null;
          const a = add(w.a, mul(w.dir, o.offset - o.width / 2));
          const bb = add(w.a, mul(w.dir, o.offset + o.width / 2));
          const out = mul(w.n, -t);
          if (o.kind === 'window')
            return (
              <g key={o.id}>
                <polygon points={poly([a, bb, add(bb, out), add(a, out)])} fill="#fbf8f4" stroke="var(--ink)" strokeWidth={0.6} />
                <line x1={a.x + out.x / 2} y1={a.y + out.y / 2} x2={bb.x + out.x / 2} y2={bb.y + out.y / 2} stroke="var(--ink)" strokeWidth={0.6} />
              </g>
            );
          const hinge = o.hinge === 'start' ? a : bb;
          const free = o.hinge === 'start' ? bb : a;
          const leafEnd = add(hinge, mul(w.n, o.width));
          const sweep = o.hinge === 'start' ? 1 : 0;
          return (
            <g key={o.id}>
              <polygon points={poly([a, bb, add(bb, out), add(a, out)])} fill="#fbf8f4" />
              <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke="var(--ink)" strokeWidth={0.9} />
              <path d={`M ${leafEnd.x} ${leafEnd.y} A ${o.width} ${o.width} 0 0 ${sweep} ${free.x} ${free.y}`} fill="none" stroke="rgba(30,26,22,0.4)" strokeWidth={0.5} strokeDasharray="2 1.5" />
            </g>
          );
        })}
        {/* dimensions & labels */}
        {walls.map((w) => {
          const mid = add(w.a, mul(w.dir, w.length / 2));
          const outer = add(mid, mul(w.n, -(t + 9)));
          const inner = add(mid, mul(w.n, 7));
          const ang = (Math.atan2(w.dir.y, w.dir.x) * 180) / Math.PI;
          const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
          return (
            <g key={w.index}>
              <text x={outer.x} y={outer.y} className="plan-dim" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${upright} ${outer.x} ${outer.y})`}>
                {formatFtIn(w.length)}
              </text>
              <circle cx={inner.x} cy={inner.y} r={5} fill={hover === w.index ? 'var(--accent)' : '#fff'} stroke="rgba(30,26,22,0.2)" strokeWidth={0.5} />
              <text x={inner.x} y={inner.y + 0.3} className="plan-label" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 6, fill: hover === w.index ? '#fff' : undefined }}>
                {WALL_NAMES[w.index]}
              </text>
            </g>
          );
        })}
        {room.corners.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={3.5} className="plan-corner" onPointerDown={dragCorner(i)} />
        ))}
        {/* north */}
        <g transform={`translate(${vb.x + vb.w - 10} ${vb.y + 10}) rotate(${design.lighting.northAngle})`}>
          <path d="M0 -6 L3 3 L0 1.5 L-3 3 Z" fill="var(--accent)" />
          <text y={-8} textAnchor="middle" className="plan-label" style={{ fontSize: 5 }}>
            N
          </text>
        </g>
      </svg>
    </div>
  );
}

function Row({ title, meta, children, onDelete, defaultOpen }: { title: ReactNode; meta?: ReactNode; children: ReactNode; onDelete?: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="row-card">
      <div className="row-card-head" onClick={() => setOpen(!open)}>
        <div className="row-card-title">{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="row-card-meta">{meta}</span>
          {onDelete && (
            <button
              className="icon-btn danger"
              style={{ width: 26, height: 26 }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete"
            >
              <Trash2 size={13} />
            </button>
          )}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} style={{ display: 'grid' }}>
            <ChevronDown size={15} color="var(--muted)" />
          </motion.span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
            <div className="row-card-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const wallOptions = (d: Design) => getWalls(d.room).map((w) => ({ value: String(w.index), label: `Wall ${WALL_NAMES[w.index]} · ${formatFtIn(w.length)}` }));

function OpeningRow({ o, design }: { o: Opening; design: Design }) {
  const upd = (patch: Partial<Opening>) => useStore.getState().update((d) => void Object.assign(d.room.openings.find((x) => x.id === o.id)!, patch));
  const w = getWalls(design.room)[o.wall];
  return (
    <Row
      title={
        <>
          {o.kind === 'door' ? <DoorOpen size={15} /> : <RectangleHorizontal size={15} />} {o.kind === 'door' ? 'Door' : 'Window'}
        </>
      }
      meta={`Wall ${WALL_NAMES[o.wall]} · ${formatFtIn(o.width)} wide`}
      onDelete={() => useStore.getState().update((d) => void (d.room.openings = d.room.openings.filter((x) => x.id !== o.id)))}
    >
      <Field label="Wall">
        <Select value={String(o.wall)} options={wallOptions(design)} onChange={(v) => upd({ wall: Number(v), offset: Math.min(o.offset, getWalls(design.room)[Number(v)].length - o.width / 2) })} />
      </Field>
      <Field label="Center from corner" hint={`Measured from ${WALL_NAMES[o.wall]}'s start`}>
        <LengthInput value={o.offset} min={o.width / 2} max={(w?.length ?? 500) - o.width / 2} onChange={(v) => upd({ offset: v })} />
      </Field>
      <div className="grid-3">
        <div className="mini-field">
          <label>Width</label>
          <LengthInput value={o.width} min={12} max={120} inchesOnly onChange={(v) => upd({ width: v })} />
        </div>
        <div className="mini-field">
          <label>Height</label>
          <LengthInput value={o.height} min={12} max={design.room.ceiling} inchesOnly onChange={(v) => upd({ height: v })} />
        </div>
        {o.kind === 'window' && (
          <div className="mini-field">
            <label>Sill</label>
            <LengthInput value={o.sill} min={0} max={design.room.ceiling - o.height} inchesOnly onChange={(v) => upd({ sill: v })} />
          </div>
        )}
      </div>
      {o.kind === 'door' ? (
        <>
          <Field label="Hinge side">
            <Seg
              value={o.hinge}
              options={[
                { value: 'start', label: 'Left' },
                { value: 'end', label: 'Right' },
              ]}
              onChange={(v) => upd({ hinge: v })}
            />
          </Field>
          <Slider label="Open" value={o.openAngle} min={0} max={105} step={1} format={(v) => `${v}°`} onChange={(v) => upd({ openAngle: v })} />
        </>
      ) : (
        <Field label="Glass">
          <Seg
            value={o.glass}
            options={[
              { value: 'frosted', label: 'Frosted' },
              { value: 'clear', label: 'Clear' },
            ]}
            onChange={(v) => upd({ glass: v })}
          />
        </Field>
      )}
    </Row>
  );
}

function PartitionRow({ p, design }: { p: Partition; design: Design }) {
  const upd = (patch: Partial<Partition>) => useStore.getState().update((d) => void Object.assign(d.room.partitions.find((x) => x.id === p.id)!, patch));
  return (
    <Row
      title={
        <>
          <SquareDashed size={15} /> {p.name}
        </>
      }
      meta={`${formatFtIn(p.length)} × ${formatFtIn(p.thickness)}`}
      onDelete={() =>
        useStore.getState().update((d) => {
          d.room.partitions = d.room.partitions.filter((x) => x.id !== p.id);
          d.room.tileZones = d.room.tileZones.filter((z) => !(z.surface.kind === 'partition' && z.surface.id === p.id));
        })
      }
    >
      <Field label="Off wall">
        <Select value={String(p.wall)} options={wallOptions(design)} onChange={(v) => upd({ wall: Number(v) })} />
      </Field>
      <Field label="Starts at" hint={`From ${WALL_NAMES[p.wall]}'s start corner`}>
        <LengthInput value={p.offset} min={0} max={getWalls(design.room)[p.wall]?.length ?? 500} onChange={(v) => upd({ offset: v })} />
      </Field>
      <div className="grid-2">
        <div className="mini-field">
          <label>Juts out</label>
          <LengthInput value={p.length} min={2} max={200} inchesOnly onChange={(v) => upd({ length: v })} />
        </div>
        <div className="mini-field">
          <label>Thickness</label>
          <LengthInput value={p.thickness} min={1} max={24} inchesOnly onChange={(v) => upd({ thickness: v })} />
        </div>
      </div>
      <Field label="Full height">
        <Toggle on={p.height === 0} onChange={(v) => upd({ height: v ? 0 : Math.min(48, design.room.ceiling) })} />
      </Field>
      {p.height > 0 && (
        <Field label="Height">
          <LengthInput value={p.height} min={6} max={design.room.ceiling} onChange={(v) => upd({ height: v })} />
        </Field>
      )}
    </Row>
  );
}

function TileZoneRow({ z, design }: { z: TileZone; design: Design }) {
  const upd = (patch: Partial<TileZone>) => useStore.getState().update((d) => void Object.assign(d.room.tileZones.find((x) => x.id === z.id)!, patch));
  const surfaces = getSurfaces(design.room);
  const s = surfaces.find((q) => q.key === surfaceKey(z.surface));
  return (
    <Row
      title={z.name}
      meta={s ? s.label : '—'}
      onDelete={() => useStore.getState().update((d) => void (d.room.tileZones = d.room.tileZones.filter((x) => x.id !== z.id)))}
    >
      <Field label="Surface">
        <Select
          value={s?.key ?? ''}
          options={surfaces.map((q) => ({ value: q.key, label: q.label }))}
          onChange={(key) => {
            const q = surfaces.find((x) => x.key === key)!;
            upd({ surface: q.ref, u0: 0, u1: q.width, v0: 0, v1: q.height });
          }}
        />
      </Field>
      <div className="grid-2">
        <div className="mini-field">
          <label>From (along wall)</label>
          <LengthInput value={z.u0} min={0} max={s?.width ?? 999} onChange={(v) => upd({ u0: v })} />
        </div>
        <div className="mini-field">
          <label>To</label>
          <LengthInput value={z.u1} min={0} max={s?.width ?? 999} onChange={(v) => upd({ u1: v })} />
        </div>
        <div className="mini-field">
          <label>Bottom</label>
          <LengthInput value={z.v0} min={0} max={design.room.ceiling} onChange={(v) => upd({ v0: v })} />
        </div>
        <div className="mini-field">
          <label>Top</label>
          <LengthInput value={z.v1} min={0} max={design.room.ceiling} onChange={(v) => upd({ v1: v })} />
        </div>
      </div>
      <Field label="Tile">
        <Select value={z.tile} options={Object.values(design.tiles).map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => upd({ tile: v })} />
      </Field>
    </Row>
  );
}

export function RoomPanel() {
  const design = useDesign();
  const room = design.room;
  const walls = getWalls(room);
  const upd = (fn: (d: Design) => void) => useStore.getState().update(fn);
  return (
    <PanelShell title="Room" sub="Drag the orange corners, or type exact lengths. Everything stays in feet and inches." onClose={() => useStore.getState().setPanel(null)}>
      <motion.div {...staggerItem}>
        <Section>
          <PlanSVG />
        </Section>
      </motion.div>
      <motion.div {...staggerItem}>
        <Section title="Walls">
          {walls.map((w) => (
            <Field key={w.index} label={`Wall ${WALL_NAMES[w.index]}`}>
              <LengthInput value={w.length} min={12} max={1200} onChange={(v) => upd((d) => setWallLength(d, w.index, v))} />
            </Field>
          ))}
          <Field label="Ceiling height">
            <LengthInput value={room.ceiling} min={60} max={240} onChange={(v) => upd((d) => void (d.room.ceiling = v))} />
          </Field>
          <Field label="Baseboard">
            <LengthInput value={room.baseboard} min={0} max={12} inchesOnly onChange={(v) => upd((d) => void (d.room.baseboard = v))} />
          </Field>
        </Section>
      </motion.div>
      <motion.div {...staggerItem}>
        <Section
          title="Doors & windows"
          action={
            <span style={{ display: 'flex', gap: 10 }}>
              {(['door', 'window'] as const).map((k) => (
                <button
                  key={k}
                  className="link"
                  onClick={() =>
                    upd((d) => {
                      const w = getWalls(d.room)[0];
                      d.room.openings.push({
                        id: uid(k),
                        kind: k,
                        wall: 0,
                        offset: w.length / 2,
                        width: k === 'door' ? 30 : 30,
                        height: k === 'door' ? 80 : 36,
                        sill: k === 'door' ? 0 : 42,
                        hinge: 'start',
                        openAngle: 0,
                        glass: 'frosted',
                      });
                    })
                  }
                >
                  <Plus size={12} /> {k === 'door' ? 'Door' : 'Window'}
                </button>
              ))}
            </span>
          }
        >
          {room.openings.map((o) => (
            <OpeningRow key={o.id} o={o} design={design} />
          ))}
          {room.openings.length === 0 && <div className="empty">No doors or windows yet.</div>}
        </Section>
      </motion.div>
      <motion.div {...staggerItem}>
        <Section
          title="Half walls & partitions"
          action={
            <button
              className="link"
              onClick={() => upd((d) => void d.room.partitions.push({ id: uid('part'), name: 'Partition', wall: 0, offset: 24, length: 30, thickness: 4, height: 0 }))}
            >
              <Plus size={12} /> Add
            </button>
          }
        >
          {room.partitions.map((p) => (
            <PartitionRow key={p.id} p={p} design={design} />
          ))}
          {room.partitions.length === 0 && <div className="empty">None.</div>}
        </Section>
      </motion.div>
      <motion.div {...staggerItem}>
        <Section
          title="Tiled areas"
          action={
            <button
              className="link"
              onClick={() =>
                upd((d) => {
                  const s = getSurfaces(d.room)[0];
                  const tile = d.room.tileZones[0]?.tile ?? Object.keys(d.tiles)[0];
                  d.room.tileZones.push({ id: uid('tz'), name: `Tile · ${s.label}`, surface: s.ref, u0: 0, u1: s.width, v0: 0, v1: Math.min(48, s.height), tile });
                })
              }
            >
              <Plus size={12} /> Add
            </button>
          }
        >
          {room.tileZones.map((z) => (
            <TileZoneRow key={z.id} z={z} design={design} />
          ))}
          <div className="note" style={{ marginTop: 6 }}>
            Tile runs over any wall area — full-height shower surrounds, a wainscot, or a backsplash. Windows are cut out automatically.
          </div>
        </Section>
      </motion.div>
    </PanelShell>
  );
}
