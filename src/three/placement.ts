import * as THREE from 'three';
import { CATALOG_BY_TYPE } from '../lib/catalog';
import {
  getSurfaces,
  itemFootprint,
  pointInPolygon,
  projectOnSurface,
  rotForNormal,
  surfaceKey,
  surfacePoint,
  type Surface,
  type Vec2,
} from '../lib/geometry';
import type { Design, Item } from '../lib/types';
import { IN, snap } from '../lib/units';
import { registry } from './registry';

export interface SurfaceHit {
  s: Surface;
  u: number;
  v: number;
  t: number;
}

/** Ray (world space) → nearest room surface the person can see. Works in inches. */
export function hitSurfaces(ray: THREE.Ray, design: Design, opts: { skipLowered?: boolean } = {}): SurfaceHit | null {
  const ro = ray.origin.clone().divideScalar(IN);
  const rd = ray.direction;
  let best: SurfaceHit | null = null;
  for (const s of getSurfaces(design.room)) {
    if (opts.skipLowered !== false && s.ref.kind === 'wall' && registry.walls.get(s.ref.wall)?.lowered) continue;
    const n = new THREE.Vector3(s.n.x, 0, s.n.y);
    const den = rd.dot(n);
    if (den > -1e-4) continue; // facing away
    const o = new THREE.Vector3(s.origin.x, 0, s.origin.y);
    const t = o.clone().sub(ro).dot(n) / den;
    if (t <= 0) continue;
    const p = ro.clone().addScaledVector(rd, t);
    const { u } = projectOnSurface(s, { x: p.x, y: p.z });
    const v = p.y;
    if (u < -0.5 || u > s.width + 0.5 || v < 0 || v > s.height) continue;
    if (!best || t < best.t) best = { s, u, v, t };
  }
  return best;
}

export function hitPlane(ray: THREE.Ray, heightIn: number): Vec2 | null {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -heightIn * IN);
  const p = new THREE.Vector3();
  if (!ray.intersectPlane(plane, p)) return null;
  return { x: p.x / IN, y: p.z / IN };
}

/** Where an item's origin sits in surface coordinates. */
export function itemOnSurface(it: Item, s: Surface) {
  return projectOnSurface(s, { x: it.x, y: it.y }).u;
}

export interface Guide {
  kind: 'center' | 'align';
  label: string;
}

/** Place a wall item at a surface hit, with alignment snapping to its neighbours. */
export function placeOnWall(it: Item, hit: SurfaceHit, grab: { du: number; dv: number }, design: Design, snapping: boolean) {
  const s = hit.s;
  let u = hit.u - grab.du;
  let z = hit.v - grab.dv;
  const half = it.w / 2;
  if (s.width > it.w) u = Math.min(Math.max(u, half), s.width - half);
  z = Math.min(Math.max(z, 0), Math.max(0, s.height - it.h));
  const guides: Guide[] = [];
  if (snapping) {
    u = snap(u, 0.25);
    z = snap(z, 0.25);
    if (Math.abs(u - s.width / 2) < 1.5) {
      u = s.width / 2;
      guides.push({ kind: 'center', label: 'Centered on wall' });
    }
    const key = surfaceKey(s.ref);
    for (const other of design.items) {
      if (other.id === it.id) continue;
      const onSame = other.surface ? surfaceKey(other.surface) === key : false;
      const ou = projectOnSurface(s, { x: other.x, y: other.y });
      // Align with anything mounted on this wall, or anything standing against it (sinks under mirrors)
      if (!onSame && Math.abs(ou.dist) > 30) continue;
      if (Math.abs(ou.u - s.width) > s.width + 10) continue;
      if (Math.abs(u - ou.u) < 1.2) {
        u = ou.u;
        guides.push({ kind: 'align', label: `Centered on ${CATALOG_BY_TYPE[other.type]?.label.toLowerCase() ?? 'item'}` });
      }
      if (onSame && Math.abs(z - other.z) < 1) z = other.z;
      if (onSame && Math.abs(z + it.h - (other.z + other.h)) < 1) z = other.z + other.h - it.h;
    }
    // Sinks: if this is a mirror, prefer lining up over a vanity's sink centers.
    if (it.type === 'mirror' || it.type === 'sconce') {
      for (const v of design.items.filter((o) => o.type === 'vanity')) {
        const vu = projectOnSurface(s, { x: v.x, y: v.y });
        if (Math.abs(vu.dist) > 2) continue;
        const sinks = Number(v.params.sinks ?? 2);
        const xs = sinks === 2 ? [-v.w / 4, v.w / 4] : [0];
        for (const sx of xs) {
          // an item facing out of a wall has its local +x along the wall's +u
          const su = vu.u + sx;
          if (Math.abs(u - su) < 1.5) {
            u = su;
            guides.push({ kind: 'align', label: 'Centered over sink' });
          }
        }
      }
    }
  }
  const p = surfacePoint(s, u);
  return { patch: { x: p.x, y: p.y, z, rot: rotForNormal(s.n), surface: s.ref }, guides };
}

/** Floor placement with wall-hugging, corner snapping and counter-top stacking. */
export function placeOnFloor(it: Item, xy: Vec2, design: Design, snapping: boolean) {
  const entry = CATALOG_BY_TYPE[it.type];
  let { x, y } = xy;
  let rot = it.rot;
  const guides: Guide[] = [];
  if (snapping) {
    x = snap(x, 0.25);
    y = snap(y, 0.25);
    const surfaces = getSurfaces(design.room);
    // 1) Back against the nearest wall
    let best: { s: Surface; dist: number } | null = null;
    for (const s of surfaces) {
      const pr = projectOnSurface(s, { x, y });
      const reach = entry?.wallSnap ? 14 : 5;
      if (Math.abs(pr.dist) > reach || pr.u < -it.w / 2 || pr.u > s.width + it.w / 2) continue;
      if (!best || Math.abs(pr.dist) < Math.abs(best.dist)) best = { s, dist: pr.dist };
    }
    if (best && entry?.wallSnap) {
      rot = rotForNormal(best.s.n);
      const pr = projectOnSurface(best.s, { x, y });
      const p = surfacePoint(best.s, pr.u);
      x = p.x;
      y = p.y;
      guides.push({ kind: 'align', label: `Against ${best.s.label.toLowerCase()}` });
    }
    // 2) Nudge sides / edges flush against any nearby wall
    const fp = itemFootprint({ x, y, rot, w: it.w, d: it.d });
    for (const s of surfaces) {
      if (best && entry?.wallSnap && s.key === best.s.key) continue;
      const pr = fp.map((c) => projectOnSurface(s, c));
      const inRange = pr.some((p) => p.u > -1 && p.u < s.width + 1);
      if (!inRange) continue;
      const m = Math.min(...pr.map((p) => p.dist));
      if (m > -0.01 && m < 4) {
        x -= s.n.x * m;
        y -= s.n.y * m;
      } else if (m < 0 && m > -3 && pr.every((p) => p.dist > -3)) {
        // slight overlap — push back out
        x -= s.n.x * m;
        y -= s.n.y * m;
      }
    }
    // 3) Center in an alcove / between walls when close
    if (entry?.wallSnap && best) {
      const s = best.s;
      const u = projectOnSurface(s, { x, y }).u;
      const right = { x: s.u.x, y: s.u.y };
      const segHits = [1, -1].map((sg) => {
        let d = Infinity;
        for (const o of surfaces) {
          if (o.key === s.key) continue;
          const po = projectOnSurface(o, { x: x + s.n.x * 6, y: y + s.n.y * 6 });
          const facing = o.n.x * right.x * sg + o.n.y * right.y * sg < -0.9;
          if (facing && po.dist > 0 && po.u >= -1 && po.u <= o.width + 1) d = Math.min(d, po.dist);
        }
        return d;
      });
      const [a, b] = segHits;
      if (isFinite(a) && isFinite(b) && Math.abs(a - b) < 3 && a + b < it.w + 30) {
        const shift = (a - b) / 2;
        x += right.x * shift;
        y += right.y * shift;
        guides.push({ kind: 'center', label: 'Centered in space' });
      }
      void u;
    }
  }
  // Stack small decor onto counters & shelves
  let z = it.z;
  if (it.type === 'vanity-decor' || it.type === 'plant') {
    z = 0;
    for (const o of design.items) {
      if (o.id === it.id || !['vanity', 'shelf', 'linen'].includes(o.type)) continue;
      if (pointInPolygon({ x, y }, itemFootprint(o))) z = Math.max(z, o.z + o.h);
    }
  }
  return { patch: { x, y, rot, z }, guides };
}
