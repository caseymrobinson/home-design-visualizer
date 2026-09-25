import type { Item, Opening, Partition, Room, SurfaceRef, Vec2 } from './types';

export type { Vec2 };

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

export function signedArea(pts: Vec2[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Keep polygons counter-clockwise so every wall's (u, up, normal) basis is right handed. */
export function normalizeCorners(pts: Vec2[]) {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

export interface WallInfo {
  index: number;
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  n: Vec2; // inward normal
  length: number;
  convexStart: boolean;
  convexEnd: boolean;
}

export function getWalls(room: Room): WallInfo[] {
  const c = room.corners;
  const walls: WallInfo[] = c.map((a, i) => {
    const b = c[(i + 1) % c.length];
    const d = sub(b, a);
    const dir = norm(d);
    return { index: i, a, b, dir, n: { x: -dir.y, y: dir.x }, length: len(d), convexStart: true, convexEnd: true };
  });
  walls.forEach((w, i) => {
    const next = walls[(i + 1) % walls.length];
    const convex = cross(w.dir, next.dir) > 0; // left turn in a CCW polygon
    w.convexEnd = convex;
    next.convexStart = convex;
  });
  return walls;
}

/** A flat, vertical, tile-able face in the room: a wall, or one side of a partition. */
export interface Surface {
  key: string;
  ref: SurfaceRef;
  label: string;
  origin: Vec2; // plan position of u = 0
  u: Vec2; // unit direction of +u along the floor
  n: Vec2; // outward (into the room) normal
  width: number;
  height: number;
}

const uFromNormal = (n: Vec2): Vec2 => ({ x: n.y, y: -n.x });

export function surfaceKey(ref: SurfaceRef) {
  return ref.kind === 'wall' ? `w${ref.wall}` : `p${ref.id}-${ref.face}`;
}

export const WALL_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function partitionCorners(room: Room, p: Partition) {
  const w = getWalls(room)[p.wall];
  if (!w) return null;
  const p0 = add(w.a, mul(w.dir, p.offset));
  const p1 = add(w.a, mul(w.dir, p.offset + p.thickness));
  const p2 = add(p1, mul(w.n, p.length));
  const p3 = add(p0, mul(w.n, p.length));
  return { wall: w, p0, p1, p2, p3 };
}

export function getSurfaces(room: Room): Surface[] {
  const out: Surface[] = [];
  const walls = getWalls(room);
  for (const w of walls) {
    out.push({
      key: `w${w.index}`,
      ref: { kind: 'wall', wall: w.index },
      label: `Wall ${WALL_NAMES[w.index] ?? w.index + 1}`,
      origin: w.a,
      u: w.dir,
      n: w.n,
      width: w.length,
      height: room.ceiling,
    });
  }
  for (const p of room.partitions) {
    const c = partitionCorners(room, p);
    if (!c) continue;
    const h = p.height || room.ceiling;
    const back = mul(c.wall.dir, -1);
    out.push({
      key: `p${p.id}-a`,
      ref: { kind: 'partition', id: p.id, face: 'a' },
      label: `${p.name} · side 1`,
      origin: c.p0,
      u: uFromNormal(back),
      n: back,
      width: p.length,
      height: h,
    });
    out.push({
      key: `p${p.id}-b`,
      ref: { kind: 'partition', id: p.id, face: 'b' },
      label: `${p.name} · side 2`,
      origin: c.p2,
      u: uFromNormal(c.wall.dir),
      n: c.wall.dir,
      width: p.length,
      height: h,
    });
    out.push({
      key: `p${p.id}-end`,
      ref: { kind: 'partition', id: p.id, face: 'end' },
      label: `${p.name} · end`,
      origin: c.p3,
      u: uFromNormal(c.wall.n),
      n: c.wall.n,
      width: p.thickness,
      height: h,
    });
  }
  return out;
}

export function findSurface(room: Room, ref: SurfaceRef | undefined) {
  if (!ref) return undefined;
  const key = surfaceKey(ref);
  return getSurfaces(room).find((s) => s.key === key);
}

export const surfacePoint = (s: Surface, u: number): Vec2 => add(s.origin, mul(s.u, u));
export const rotForNormal = (n: Vec2) => Math.atan2(n.x, n.y);
/** Local +x of an item in plan space. */
export const itemRight = (rot: number): Vec2 => ({ x: Math.cos(rot), y: -Math.sin(rot) });
/** Local +z (front) of an item in plan space. */
export const itemFront = (rot: number): Vec2 => ({ x: Math.sin(rot), y: Math.cos(rot) });

export function itemFootprint(it: Pick<Item, 'x' | 'y' | 'rot' | 'w' | 'd'>): Vec2[] {
  const r = itemRight(it.rot);
  const f = itemFront(it.rot);
  const o = { x: it.x, y: it.y };
  const hw = it.w / 2;
  return [
    add(o, mul(r, -hw)),
    add(o, mul(r, hw)),
    add(add(o, mul(r, hw)), mul(f, it.d)),
    add(add(o, mul(r, -hw)), mul(f, it.d)),
  ];
}

/** Line segments that bound movement in plan: interior wall faces and exposed partition faces. */
export interface Seg {
  a: Vec2;
  b: Vec2;
}

export function planSegments(room: Room): Seg[] {
  const segs: Seg[] = getWalls(room).map((w) => ({ a: w.a, b: w.b }));
  for (const p of room.partitions) {
    const c = partitionCorners(room, p);
    if (!c) continue;
    segs.push({ a: c.p0, b: c.p3 }, { a: c.p3, b: c.p2 }, { a: c.p2, b: c.p1 });
  }
  return segs;
}

/** Distance along a ray to the nearest segment, or Infinity. */
export function rayCast(p: Vec2, d: Vec2, segs: Seg[]) {
  let best = Infinity;
  for (const s of segs) {
    const e = sub(s.b, s.a);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-9) continue;
    const w = sub(s.a, p);
    const t = cross(w, e) / den;
    const u = cross(w, d) / den;
    if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function bounds(pts: Vec2[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function openingSpan(o: Opening) {
  return { l: o.offset - o.width / 2, r: o.offset + o.width / 2 };
}

export function projectOnSurface(s: Surface, p: Vec2) {
  const rel = sub(p, s.origin);
  return { u: dot(rel, s.u), dist: dot(rel, s.n) };
}
