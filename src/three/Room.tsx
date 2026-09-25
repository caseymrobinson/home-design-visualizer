import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getSurfaces, getWalls, itemFootprint, projectOnSurface, surfaceKey, type Surface } from '../lib/geometry';
import type { Design, Opening } from '../lib/types';
import { IN } from '../lib/units';
import { glass, matte, metalMaterial, paintMaterial, tileMaterial } from '../materials/library';
import { useStore } from '../store';
import { box, merge, rectMinusHoles, skyTexture, surfaceMatrix, type Rect } from './geom';
import { skyNits } from './lightUnits';
import { markEnvDirty, registry } from './registry';

const CASING = 3.25;

/** Invisible, shadow-only stand-ins: lowered walls still shade the room like the real thing. */
const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

function ShadowProxy({ geometry }: { geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Mesh>(null!);
  useEffect(() => {
    const m = ref.current;
    registry.rasterOnly.add(m);
    return () => {
      registry.rasterOnly.delete(m);
    };
  }, []);
  return <mesh ref={ref} geometry={geometry} material={shadowOnly} castShadow />;
}
const TRIM_T = 0.75;

function offsetPolygon(pts: { x: number; y: number }[], d: number) {
  // Outward offset for a CCW polygon: shift each edge along its outward normal, intersect neighbours.
  const n = pts.length;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = dy / l;
    const ny = -dx / l; // outward for CCW
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, d: { x: dx / l, y: dy / l } };
  });
  return lines.map((L, i) => {
    const P = lines[(i - 1 + n) % n];
    const den = P.d.x * L.d.y - P.d.y * L.d.x;
    if (Math.abs(den) < 1e-9) return L.a;
    const t = ((L.a.x - P.a.x) * L.d.y - (L.a.y - P.a.y) * L.d.x) / den;
    return { x: P.a.x + P.d.x * t, y: P.a.y + P.d.y * t };
  });
}

/** Horizontal slab from a plan polygon, facing up or down, UVs in inches. */
function slab(pts: { x: number; y: number }[], y: number, faceUp: boolean) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, faceUp ? -p.y : p.y)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i);
    uv[i * 2 + 1] = pos.getZ(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Register an object that should only show when you're inside the room. */
function useInterior() {
  const mine = useRef(new Set<THREE.Object3D>());
  useEffect(() => {
    const set = mine.current;
    return () => set.forEach((o) => registry.interiorOnly.delete(o));
  }, []);
  return (o: THREE.Object3D | null) => {
    if (o && !mine.current.has(o)) {
      mine.current.add(o);
      registry.interiorOnly.add(o);
    }
  };
}

/** Shows interior-only objects in eye-level view and renders; hides them in the dollhouse & plan. */
export function InteriorVisibility() {
  useFrame(() => {
    const st = useStore.getState();
    const show = st.mode === 'walk';
    registry.interiorOnly.forEach((o) => (o.visible = show));
  });
  return null;
}

function openingHole(o: Opening): Rect {
  return o.kind === 'door'
    ? { u0: o.offset - o.width / 2, u1: o.offset + o.width / 2, v0: -1, v1: o.height }
    : { u0: o.offset - o.width / 2, u1: o.offset + o.width / 2, v0: o.sill, v1: o.sill + o.height };
}

/** Baseboard spans for a surface, skipping doors, tiled-to-floor zones and fixtures pushed against it. */
function baseboardSpans(design: Design, s: Surface, holes: Rect[]): Rect[] {
  const h = design.room.baseboard;
  if (h <= 0) return [];
  const skip: Rect[] = [...holes.filter((r) => r.v0 <= 0)];
  const key = surfaceKey(s.ref);
  for (const z of design.room.tileZones) if (surfaceKey(z.surface) === key && z.v0 < h) skip.push({ u0: z.u0 - 0.01, u1: z.u1 + 0.01, v0: -1, v1: h + 1 });
  for (const it of design.items) {
    if (it.type !== 'tub') continue;
    const fp = itemFootprint(it).map((p) => projectOnSurface(s, p));
    if (fp.some((p) => Math.abs(p.dist) < 1.5)) {
      const us = fp.map((p) => p.u);
      skip.push({ u0: Math.min(...us), u1: Math.max(...us), v0: -1, v1: h + 1 });
    }
  }
  return rectMinusHoles({ u0: 0, u1: s.width, v0: 0, v1: h }, skip);
}

function TileZones({ design, s }: { design: Design; s: Surface }) {
  const key = surfaceKey(s.ref);
  const zones = design.room.tileZones.filter((z) => surfaceKey(z.surface) === key);
  const holes = s.ref.kind === 'wall' ? design.room.openings.filter((o) => o.wall === (s.ref as { wall: number }).wall).map(openingHole) : [];
  return (
    <>
      {zones.map((z) => {
        const spec = design.tiles[z.tile];
        if (!spec) return null;
        return <TileZoneMesh key={z.id} rect={{ u0: z.u0, u1: z.u1, v0: z.v0, v1: Math.min(z.v1, s.height) }} holes={holes} spec={spec} />;
      })}
    </>
  );
}

function TileZoneMesh({ rect, holes, spec }: { rect: Rect; holes: Rect[]; spec: Design['tiles'][string] }) {
  const geo = useMemo(() => {
    const t = spec.thickness;
    return merge(rectMinusHoles(rect, holes).map((r) => box(r.u0 - 0.01, r.u1 + 0.01, r.v0 - 0.01, r.v1 + 0.01, 0, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rect), JSON.stringify(holes), spec.thickness]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={tileMaterial(spec)} castShadow receiveShadow />;
}

function Baseboards({ design, s, holes }: { design: Design; s: Surface; holes: Rect[] }) {
  const geo = useMemo(
    () => merge(baseboardSpans(design, s, holes).map((r) => box(r.u0, r.u1, 0, r.v1, 0, 0.625))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(s), JSON.stringify(holes), JSON.stringify(design.room.tileZones), design.room.baseboard, JSON.stringify(design.items.filter((i) => i.type === 'tub'))],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={paintMaterial(design.finishes.trimPaint, 'semigloss')} castShadow receiveShadow />;
}

function Door({ o, t, design }: { o: Opening; t: number; design: Design }) {
  const trim = paintMaterial(design.finishes.trimPaint, 'semigloss');
  const metal = metalMaterial(design.finishes.metal);
  const l = o.offset - o.width / 2;
  const r = o.offset + o.width / 2;
  const h = o.height;
  const casing = useMemo(
    () =>
      merge([
        // interior casing
        box(l - CASING, l, 0, h + CASING, 0, TRIM_T),
        box(r, r + CASING, 0, h + CASING, 0, TRIM_T),
        box(l - CASING - 0.25, r + CASING + 0.25, h, h + CASING + 0.4, 0, TRIM_T + 0.15),
        // exterior casing
        box(l - CASING, l, 0, h + CASING, -t - TRIM_T, -t),
        box(r, r + CASING, 0, h + CASING, -t - TRIM_T, -t),
        box(l - CASING, r + CASING, h, h + CASING, -t - TRIM_T, -t),
        // jambs + stops
        box(l, l + TRIM_T, 0, h, -t, 0),
        box(r - TRIM_T, r, 0, h, -t, 0),
        box(l, r, h - TRIM_T, h, -t, 0),
        box(l + TRIM_T, l + TRIM_T + 0.5, 0, h - TRIM_T, -t / 2 - 1.4, -t / 2 - 0.9),
        box(r - TRIM_T - 0.5, r - TRIM_T, 0, h - TRIM_T, -t / 2 - 1.4, -t / 2 - 0.9),
      ]),
    [l, r, h, t],
  );
  const slabW = o.width - 2 * TRIM_T - 0.25;
  const slabH = h - TRIM_T - 0.6;
  const hingeStart = o.hinge === 'start';
  const hingeU = hingeStart ? l + TRIM_T + 0.1 : r - TRIM_T - 0.1;
  const dir = hingeStart ? 1 : -1;
  const angle = (o.openAngle * Math.PI) / 180;
  const slab = useMemo(() => {
    const x0 = dir > 0 ? 0 : -slabW;
    const x1 = dir > 0 ? slabW : 0;
    // Two-panel shaker door: slab + applied rails/stiles on both faces
    const parts = [box(x0, x1, 0.5, 0.5 + slabH, -0.6875, 0.6875)];
    const rail = 4.5;
    const inset = 0.22;
    for (const zf of [0.6875, -0.6875 - inset]) {
      const z0 = zf;
      const z1 = zf + inset;
      parts.push(box(x0, x0 + rail, 0.5, 0.5 + slabH, z0, z1));
      parts.push(box(x1 - rail, x1, 0.5, 0.5 + slabH, z0, z1));
      parts.push(box(x0 + rail, x1 - rail, 0.5, 0.5 + 8, z0, z1));
      parts.push(box(x0 + rail, x1 - rail, 0.5 + slabH - rail, 0.5 + slabH, z0, z1));
      parts.push(box(x0 + rail, x1 - rail, 0.5 + slabH * 0.52, 0.5 + slabH * 0.52 + rail, z0, z1));
    }
    return merge(parts);
  }, [dir, slabW, slabH]);
  const leverX = dir * (slabW - 2.6);
  const hall = useInterior();
  return (
    <group>
      <mesh geometry={casing} material={trim} castShadow receiveShadow />
      <group position={[hingeU, 0, -t / 2 + 0.2]} rotation-y={-dir * angle}>
        <mesh geometry={slab} material={trim} castShadow receiveShadow />
        {[1, -1].map((side) => (
          <group key={side} position={[leverX, 36, side * 0.72]} scale-z={side}>
            <mesh material={metal} rotation-x={Math.PI / 2} position-z={0.35}>
              <cylinderGeometry args={[1.1, 1.1, 0.35, 32]} />
            </mesh>
            <mesh material={metal} rotation-x={Math.PI / 2} position-z={1.1}>
              <cylinderGeometry args={[0.3, 0.3, 1.4, 16]} />
            </mesh>
            <mesh material={metal} rotation-z={Math.PI / 2} position={[-dir * 2, 0, 1.8]}>
              <capsuleGeometry args={[0.28, 4, 6, 12]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* A soft hallway beyond the door */}
      <mesh ref={hall} position={[o.offset, 45, -t - 30]}>
        <boxGeometry args={[o.width + 40, 90, 60]} />
        <meshStandardMaterial color="#d6cec2" roughness={0.95} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function Window({ o, t, design }: { o: Opening; t: number; design: Design }) {
  const trim = paintMaterial(design.finishes.trimPaint, 'semigloss');
  const l = o.offset - o.width / 2;
  const r = o.offset + o.width / 2;
  const b = o.sill;
  const top = o.sill + o.height;
  const frameZ = -t + 1.2;
  const trimGeo = useMemo(
    () =>
      merge([
        box(l - CASING, l, b, top + CASING, 0, TRIM_T),
        box(r, r + CASING, b, top + CASING, 0, TRIM_T),
        box(l - CASING - 0.25, r + CASING + 0.25, top, top + CASING + 0.4, 0, TRIM_T + 0.15),
        // stool + apron
        box(l - CASING - 1, r + CASING + 1, b - 1, b, -t + 1, 1.5),
        box(l - CASING, r + CASING, b - 1 - 3, b - 1, 0, TRIM_T),
        // jamb extensions
        box(l, l + TRIM_T, b, top, -t + 1, 0),
        box(r - TRIM_T, r, b, top, -t + 1, 0),
        box(l, r, top - TRIM_T, top, -t + 1, 0),
      ]),
    [l, r, b, top, t],
  );
  const sash = useMemo(() => {
    const f = 1.75;
    const mid = (b + top) / 2;
    return merge([
      box(l + TRIM_T, l + TRIM_T + f, b, top - TRIM_T, frameZ - 1.5, frameZ),
      box(r - TRIM_T - f, r - TRIM_T, b, top - TRIM_T, frameZ - 1.5, frameZ),
      box(l + TRIM_T, r - TRIM_T, b, b + f + 0.6, frameZ - 1.5, frameZ),
      box(l + TRIM_T, r - TRIM_T, top - TRIM_T - f, top - TRIM_T, frameZ - 1.5, frameZ),
      box(l + TRIM_T, r - TRIM_T, mid - 0.9, mid + 0.9, frameZ - 2.2, frameZ + 0.2),
    ]);
  }, [l, r, b, top, frameZ]);
  const paneW = o.width - 2 * TRIM_T - 3.4;
  const paneH = o.height - TRIM_T - 3.6;
  return (
    <group>
      <mesh geometry={trimGeo} material={trim} castShadow receiveShadow />
      <mesh geometry={sash} material={matte('#f4f2ee', 0.45)} castShadow receiveShadow />
      <mesh position={[o.offset, (b + top) / 2, frameZ - 0.8]} material={glass(o.glass === 'frosted' ? 'frosted' : 'clear')}>
        <boxGeometry args={[paneW, paneH, 0.2]} />
      </mesh>
    </group>
  );
}

/**
 * One watertight wall: an outline with door notches cut from the bottom edge and window holes,
 * extruded through the wall thickness. No internal seams means no light leaks in the shadow map.
 */
function wallSolid(len: number, H: number, t: number, holes: Rect[]) {
  const clamp = (v: number) => Math.min(Math.max(v, 0.01), len - 0.01);
  const doors = holes
    .filter((h) => h.v0 <= 0)
    .map((h) => ({ l: clamp(h.u0), r: clamp(h.u1), top: Math.min(h.v1, H - 0.5) }))
    .filter((h) => h.r - h.l > 0.1)
    .sort((a, b) => a.l - b.l);
  const shape = new THREE.Shape();
  // Start a hair early so the joint with the previous wall can't open a see-through crack.
  const s0 = -0.15;
  shape.moveTo(s0, 0);
  for (const d of doors) {
    shape.lineTo(d.l, 0);
    shape.lineTo(d.l, d.top);
    shape.lineTo(d.r, d.top);
    shape.lineTo(d.r, 0);
  }
  shape.lineTo(len, 0);
  shape.lineTo(len, H);
  shape.lineTo(s0, H);
  shape.lineTo(s0, 0);
  for (const h of holes) {
    if (h.v0 <= 0) continue;
    const l = clamp(h.u0);
    const r = clamp(h.u1);
    const b = Math.max(h.v0, 0.25);
    const tp = Math.min(h.v1, H - 0.25);
    if (r - l < 0.1 || tp - b < 0.1) continue;
    const p = new THREE.Path();
    p.moveTo(l, b);
    p.lineTo(l, tp);
    p.lineTo(r, tp);
    p.lineTo(r, b);
    p.lineTo(l, b);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t);
  g.computeVertexNormals();
  return g;
}

function Wall({ design, s, t, index }: { design: Design; s: Surface; t: number; index: number }) {
  const outer = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const cap = useRef<THREE.Mesh>(null!);
  const walls = getWalls(design.room);
  const w = walls[index];
  const openings = design.room.openings.filter((o) => o.wall === index);
  const holes = openings.map(openingHole);
  const H = design.room.ceiling;
  const uEnd = s.width + (w.convexEnd ? t : 0);
  const mat = useMemo(() => surfaceMatrix(s), [s]);

  const geo = useMemo(
    () => wallSolid(uEnd, H, t, holes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uEnd, H, t, JSON.stringify(holes)],
  );
  // Shadow stand-in: thicker and running past both corners so no light slips through the joints.
  const proxyGeo = useMemo(() => {
    const pad = t + 8;
    const g = wallSolid(uEnd + pad * 2, H + 8, t + 8, holes.map((h) => ({ ...h, u0: h.u0 + pad, u1: h.u1 + pad })));
    g.translate(-pad, 0, 0);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uEnd, H, t, JSON.stringify(holes)]);
  useEffect(
    () => () => {
      geo.dispose();
      proxyGeo.dispose();
    },
    [geo, proxyGeo],
  );

  const state = useRef({ scale: 1, full: false });
  const { camera } = useThree();

  useEffect(() => {
    registry.walls.set(index, {
      group: body.current,
      lowered: false,
      setFull: (full) => {
        state.current.full = full;
        body.current.scale.y = full ? 1 : state.current.scale;
        body.current.visible = full || state.current.scale > 0.015;
      },
    });
    return () => {
      registry.walls.delete(index);
    };
  }, [index]);

  useFrame((_, dt) => {
    const mode = useStore.getState().mode;
    const cx = camera.position.x / IN - s.origin.x;
    const cz = camera.position.z / IN - s.origin.y;
    const behind = cx * s.n.x + cz * s.n.y < -2;
    const lowered = mode === 'orbit' && behind;
    const entry = registry.walls.get(index);
    if (entry) entry.lowered = lowered;
    const target = lowered ? 0.0 : 1;
    const st = state.current;
    st.scale = THREE.MathUtils.damp(st.scale, target, 7, dt);
    if (Math.abs(st.scale - target) < 0.002) st.scale = target;
    if (!st.full) {
      body.current.scale.y = Math.max(0.0001, st.scale);
      body.current.visible = st.scale > 0.015;
    }
    cap.current.position.y = H * st.scale + 0.15;
    cap.current.visible = st.scale < 0.98;
  });

  return (
    <group ref={outer} matrixAutoUpdate={false} matrix={mat}>
      <group ref={body}>
        <mesh geometry={geo} material={paintMaterial(design.finishes.wallPaint, design.finishes.paintSheen)} castShadow receiveShadow />
        <TileZones design={design} s={s} />
        <Baseboards design={design} s={s} holes={holes} />
        {openings.map((o) =>
          o.kind === 'door' ? <Door key={o.id} o={o} t={t} design={design} /> : <Window key={o.id} o={o} t={t} design={design} />,
        )}
      </group>
      <ShadowProxy geometry={proxyGeo} />
      <mesh ref={cap} position={[uEnd / 2, H, -t / 2]} material={matte('#3a3632', 0.9)}>
        <boxGeometry args={[uEnd, 0.3, t]} />
      </mesh>
    </group>
  );
}

function PartitionMesh({ design, id }: { design: Design; id: string }) {
  const p = design.room.partitions.find((q) => q.id === id)!;
  const surfaces = getSurfaces(design.room).filter((s) => s.ref.kind === 'partition' && s.ref.id === id);
  const faceA = surfaces.find((s) => s.ref.kind === 'partition' && s.ref.face === 'a');
  const H = p.height || design.room.ceiling;
  const mat = useMemo(() => (faceA ? surfaceMatrix(faceA) : new THREE.Matrix4()), [faceA]);
  const geo = useMemo(() => box(0, p.length, 0, H, -p.thickness, 0), [p.length, p.thickness, H]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!faceA) return null;
  // In face-A space: u runs out from the host wall, z goes into the partition.
  return (
    <>
      <group matrixAutoUpdate={false} matrix={mat}>
        <mesh geometry={geo} material={paintMaterial(design.finishes.wallPaint, design.finishes.paintSheen)} castShadow receiveShadow />
      </group>
      {surfaces.map((s) => (
        <group key={s.key} matrixAutoUpdate={false} matrix={surfaceMatrix(s)}>
          <TileZones design={design} s={s} />
          <Baseboards design={design} s={s} holes={[]} />
        </group>
      ))}
    </>
  );
}

function Ceiling({ design }: { design: Design }) {
  const ref = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();
  const geo = useMemo(() => slab(design.room.corners, design.room.ceiling, false), [design.room.corners, design.room.ceiling]);
  useEffect(() => {
    registry.ceiling = ref.current;
  }, []);
  useFrame(() => {
    const mode = useStore.getState().mode;
    ref.current.visible = mode === 'walk' || camera.position.y / IN < design.room.ceiling - 1;
  });
  return (
    <>
      <mesh ref={ref} geometry={geo} material={paintMaterial(design.finishes.ceilingPaint, 'flat')} receiveShadow />
      <ShadowProxy geometry={geo} />
    </>
  );
}

/** Soft outdoor backdrop seen (and lit) through every window. */
function WindowViews({ design }: { design: Design }) {
  const walls = getWalls(design.room);
  const L = design.lighting;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#000000', emissiveMap: skyTexture(), emissive: '#ffffff' }), []);
  mat.emissiveIntensity = skyNits(L);
  const track = useInterior();
  return (
    <>
      {design.room.openings
        .filter((o) => o.kind === 'window')
        .map((o) => {
          const w = walls[o.wall];
          if (!w) return null;
          const p = { x: w.a.x + w.dir.x * o.offset - w.n.x * 36, y: w.a.y + w.dir.y * o.offset - w.n.y * 36 };
          return (
            <mesh key={o.id} ref={track} position={[p.x, o.sill + o.height / 2, p.y]} rotation-y={Math.atan2(w.n.x, w.n.y)} material={mat}>
              <planeGeometry args={[o.width + 90, o.height + 70]} />
            </mesh>
          );
        })}
    </>
  );
}

export function Room({ design }: { design: Design }) {
  const room = design.room;
  const surfaces = useMemo(() => getSurfaces(room), [room]);
  const walls = surfaces.filter((s) => s.ref.kind === 'wall');
  const floorGeo = useMemo(() => slab(room.corners, 0, true), [room.corners]);
  const plinthGeo = useMemo(() => {
    const outer = offsetPolygon(room.corners, room.wallThickness + 0.5);
    const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, -p.y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -8.02, 0);
    return g;
  }, [room.corners, room.wallThickness]);
  const floorTile = design.tiles[design.finishes.floorTile];

  useEffect(() => {
    markEnvDirty();
  }, [design]);

  return (
    <group>
      <mesh geometry={floorGeo} material={floorTile ? tileMaterial(floorTile) : matte('#ddd')} receiveShadow />
      <mesh geometry={plinthGeo} material={matte('#e6e0d7', 0.9)} receiveShadow />
      <Ceiling design={design} />
      {walls.map((s, i) => (
        <Wall key={s.key + room.corners.length} design={design} s={s} t={room.wallThickness} index={i} />
      ))}
      {room.partitions.map((p) => (
        <PartitionMesh key={p.id} design={design} id={p.id} />
      ))}
      <WindowViews design={design} />
      <InteriorVisibility />
    </group>
  );
}
