import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { itemFootprint, itemFront, itemRight, pointInPolygon } from '../../lib/geometry';
import type { Design, Item } from '../../lib/types';
import { matte } from '../../materials/library';
import { mulberry32 } from '../../materials/noise';
import { merge } from '../geom';
import { lathe, P, tube, type ItemProps } from './common';

/** Things a plant can sit on (their tops are surfaces vines can trail across and spill over). */
const SUPPORTS = ['vanity', 'linen', 'shelf'];

/** Outline of whatever the plant sits on, in the plant's local plan coordinates (x = right, y = front). */
function supportOutline(item: Item, design: Design): THREE.Vector2[] | null {
  if (item.z < 1) return null;
  const r = itemRight(item.rot);
  const f = itemFront(item.rot);
  for (const o of design.items) {
    if (o.id === item.id || !SUPPORTS.includes(o.type)) continue;
    if (Math.abs(o.z + o.h - item.z) > 1.5) continue;
    const fp = itemFootprint(o);
    if (!pointInPolygon({ x: item.x, y: item.y }, fp)) continue;
    return fp.map((c) => {
      const dx = c.x - item.x;
      const dy = c.y - item.y;
      return new THREE.Vector2(dx * r.x + dy * r.y, dx * f.x + dy * f.y);
    });
  }
  return null;
}

/** Distance from p along unit direction dir to the outline's edge (Infinity if it never leaves). */
function distToEdge(p: THREE.Vector2, dir: THREE.Vector2, poly: THREE.Vector2[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const e = b.clone().sub(a);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-6) continue;
    const ap = a.clone().sub(p);
    const t = (ap.x * e.y - ap.y * e.x) / den;
    const s = (ap.x * dir.y - ap.y * dir.x) / den;
    if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
}

function leafShape(len: number, wid: number, heart = false) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  if (heart) {
    s.bezierCurveTo(wid, -len * 0.15, wid * 0.9, len * 0.7, 0, len);
    s.bezierCurveTo(-wid * 0.9, len * 0.7, -wid, -len * 0.15, 0, 0);
  } else {
    s.quadraticCurveTo(wid / 2, len * 0.45, 0, len);
    s.quadraticCurveTo(-wid / 2, len * 0.45, 0, 0);
  }
  const g = new THREE.ShapeGeometry(s, 4);
  // Cup the leaf slightly so it catches light
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.pow(pos.getX(i) / (wid / 2), 2) * wid * 0.15);
  g.computeVertexNormals();
  return g;
}

/** Monstera leaf: a broad heart split into rounded lobes by deep slits, with a few holes. */
function monsteraLeaf(len: number, wid: number) {
  const n = 5;
  const hw = (t: number) => wid * 0.5 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.75);
  // Right side: from the base, each lobe bulges out to the margin and returns to a slit near the midrib
  const right: [number, number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const tm = (t0 + t1) / 2;
    const ctrl: [number, number] = [hw(tm) * 1.3, len * tm - len * 0.02];
    const end: [number, number] = k < n - 1 ? [hw(t1) * 0.32, len * t1 - len * 0.03] : [0, len];
    right.push([ctrl[0], ctrl[1], end[0], end[1]]);
  }
  const s = new THREE.Shape();
  s.moveTo(0, len * 0.02);
  s.lineTo(wid * 0.06, -len * 0.06);
  for (const [cx, cy, ex, ey] of right) s.quadraticCurveTo(cx, cy, ex, ey);
  // Left side, mirrored, walking back down to the base
  for (let k = n - 1; k >= 0; k--) {
    const [cx, cy] = right[k];
    const [ex, ey] = k > 0 ? [right[k - 1][2], right[k - 1][3]] : [wid * 0.06, -len * 0.06];
    s.quadraticCurveTo(-cx, cy, -ex, ey);
  }
  s.lineTo(0, len * 0.02);
  for (const [hx, hy, r] of [
    [wid * 0.1, len * 0.55, wid * 0.03],
    [-wid * 0.11, len * 0.42, wid * 0.028],
    [wid * 0.09, len * 0.3, wid * 0.022],
  ]) {
    const hole = new THREE.Path();
    hole.absellipse(hx, hy, r, r * 1.8, 0, Math.PI * 2, true, 0);
    s.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(s, 10);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.pow(pos.getX(i) / (wid / 2), 2) * wid * 0.1 - Math.pow(pos.getY(i) / len, 2) * len * 0.12);
  g.computeVertexNormals();
  return g;
}

const LEAF_COLOR: Record<string, string> = {
  olive: '#6f7d5b',
  fern: '#5f7f45',
  pothos: '#4f7a3a',
  pearls: '#7f9d58',
  snake: '#3f5a36',
  monstera: '#2f5a2c',
};

const TRAILING = ['pothos', 'pearls'];

export function Plant({ item, design }: ItemProps) {
  const { h } = item;
  const kind = P(item, 'kind', 'olive');
  const potColor = P(item, 'pot', '#cbbba5');
  const potStyle = P(item, 'potStyle', 'tapered');
  const trail = P(item, 'trail', 30);
  const trailing = TRAILING.includes(kind);
  const potH = trailing ? 5.5 : kind === 'olive' || kind === 'monstera' ? Math.min(13, h * 0.32) : Math.min(10, h * 0.4);
  const potR = trailing ? 3.6 : kind === 'olive' || kind === 'monstera' ? 5.8 : 4.6;
  const outline = supportOutline(item, design);
  const outlineKey = outline ? outline.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(';') : 'floor';
  // Room left for vines to fall before they would reach the floor.
  const maxDrop = Math.max(2, item.z - 1);

  const pot = useGeo(() => {
    const profile: [number, number][] =
      potStyle === 'cylinder'
        ? [
            [0, 0],
            [potR, 0],
            [potR, potH],
            [potR - 0.35, potH],
            [potR - 0.35, potH - 1],
            [0, potH - 1],
          ]
        : potStyle === 'bowl'
          ? [
              [0, 0],
              [potR * 0.55, 0],
              [potR * 0.9, potH * 0.35],
              [potR, potH * 0.7],
              [potR * 0.96, potH],
              [potR * 0.86, potH],
              [potR * 0.85, potH - 1],
              [0, potH - 1],
            ]
          : [
              [0, 0],
              [potR * 0.72, 0],
              [potR * 0.78, 0.3],
              [potR, potH - 0.6],
              [potR + 0.25, potH - 0.3],
              [potR + 0.25, potH],
              [potR - 0.4, potH],
              [potR - 0.5, potH - 1],
              [0, potH - 1],
            ];
    return lathe(profile);
  }, [potH, potR, potStyle]);

  const { leaves, stems, beads } = useMemo(() => {
    const rnd = mulberry32(kind.length * 99 + Math.round(h) + Math.round(trail) * 7);
    const leafParts: THREE.BufferGeometry[] = [];
    const stemParts: THREE.BufferGeometry[] = [];
    const beadParts: THREE.BufferGeometry[] = [];
    const place = (g: THREE.BufferGeometry, at: THREE.Vector3, dir: THREE.Vector3, roll: number) => {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      const m = new THREE.Matrix4().compose(at, q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll)), new THREE.Vector3(1, 1, 1));
      const c = g.clone();
      c.applyMatrix4(m);
      leafParts.push(c);
    };

    if (kind === 'olive') {
      const leaf = leafShape(2.3, 0.5);
      const top = h;
      stemParts.push(
        tube(
          [
            [0, potH - 1, 0],
            [0.4, potH + (top - potH) * 0.3, 0.2],
            [-0.3, potH + (top - potH) * 0.55, -0.1],
            [0.2, top * 0.72, 0],
          ],
          0.45,
          24,
        ),
      );
      const crown = new THREE.Vector3(0, top * 0.8, 0);
      for (let b = 0; b < 9; b++) {
        const a = (b / 9) * Math.PI * 2 + rnd();
        const end = new THREE.Vector3(Math.cos(a) * (4 + rnd() * 4), crown.y + (rnd() - 0.3) * (top - crown.y) * 1.2, Math.sin(a) * (4 + rnd() * 4));
        const mid = crown.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.5, 0));
        stemParts.push(tube([[0, top * 0.7, 0], [mid.x, mid.y, mid.z], [end.x, end.y, end.z]], 0.12, 12));
        for (let k = 0; k < 42; k++) {
          const t = 0.3 + rnd() * 0.7;
          const p = new THREE.Vector3(0, top * 0.7, 0).lerp(mid, Math.min(1, t * 2)).lerp(end, Math.max(0, t * 2 - 1));
          p.add(new THREE.Vector3((rnd() - 0.5) * 2.5, (rnd() - 0.5) * 2.5, (rnd() - 0.5) * 2.5));
          const dir = new THREE.Vector3(rnd() - 0.5, rnd() * 0.6 + 0.1, rnd() - 0.5);
          place(leaf, p, dir, rnd() * Math.PI * 2);
        }
      }
    } else if (kind === 'fern') {
      const leaflet = leafShape(1.4, 0.45);
      for (let f = 0; f < 22; f++) {
        const a = (f / 22) * Math.PI * 2 + rnd() * 0.3;
        const len = (h - potH) * (0.7 + rnd() * 0.5);
        const up = 0.55 + rnd() * 0.5;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          pts.push(new THREE.Vector3(Math.cos(a) * len * t, potH + Math.sin(t * Math.PI * 0.8) * len * up * 0.6 - t * t * len * 0.3, Math.sin(a) * len * t));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        stemParts.push(new THREE.TubeGeometry(curve, 16, 0.06, 5));
        for (let i = 1; i < 26; i++) {
          const t = i / 26;
          const p = curve.getPoint(t);
          const tan = curve.getTangent(t);
          const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
          const s = 1 - t * 0.7;
          for (const sgn of [-1, 1]) {
            const g = leaflet.clone();
            g.scale(s, s, s);
            place(g, p, side.clone().multiplyScalar(sgn).add(new THREE.Vector3(0, 0.3, 0)).add(tan.clone().multiplyScalar(0.4)), 0);
          }
        }
      }
    } else if (kind === 'snake') {
      // Sansevieria: upright, slightly twisting sword leaves from the soil
      const n = 11;
      for (let i = 0; i < n; i++) {
        const len = (h - potH) * (0.55 + rnd() * 0.5);
        const wid = 1.6 + rnd() * 1.1;
        const leaf = leafShape(len, wid);
        const pos = leaf.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          // Twist along the length
          const y = pos.getY(k);
          const tw = (y / len) * (rnd() - 0.5) * 1.2;
          const x = pos.getX(k);
          const z = pos.getZ(k);
          pos.setX(k, x * Math.cos(tw) - z * Math.sin(tw));
          pos.setZ(k, x * Math.sin(tw) + z * Math.cos(tw));
        }
        leaf.computeVertexNormals();
        const a = rnd() * Math.PI * 2;
        const r = rnd() * (potR - 1.6);
        const lean = 0.08 + rnd() * 0.2;
        place(leaf, new THREE.Vector3(Math.cos(a) * r, potH - 1.1, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean), rnd() * Math.PI * 2);
      }
    } else if (kind === 'monstera') {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
        const reach = 5 + rnd() * 6;
        const tip = new THREE.Vector3(Math.cos(a) * reach, potH + (h - potH) * (0.45 + rnd() * 0.5), Math.sin(a) * reach);
        const mid = new THREE.Vector3(Math.cos(a) * reach * 0.35, (potH + tip.y) * 0.6 + 2, Math.sin(a) * reach * 0.35);
        const base = new THREE.Vector3(Math.cos(a) * 0.6, potH - 1, Math.sin(a) * 0.6);
        stemParts.push(tube([[base.x, base.y, base.z], [mid.x, mid.y, mid.z], [tip.x, tip.y, tip.z]], 0.22, 16));
        const len = 8 + rnd() * 5;
        const leaf = monsteraLeaf(len, len * 0.9);
        // Leaves tip outward and droop, facing up and out
        const dir = new THREE.Vector3(Math.cos(a), -0.25 - rnd() * 0.3, Math.sin(a));
        place(leaf, tip, dir, Math.PI / 2 + (rnd() - 0.5) * 0.5);
      }
    } else {
      // Trailing vines (pothos / string of pearls): a low crown, then strands that run across
      // whatever the pot sits on and spill over its edges.
      const heart = leafShape(2.2, 1.9, true);
      const bead = new THREE.SphereGeometry(0.2, 7, 5);
      const center = new THREE.Vector2(0, potR + 0.5); // pot center in local plan (x, front)
      const vines = kind === 'pearls' ? 14 : 10;
      // Aim the strands at the nearest edges so they actually drape
      const dirs: number[] = [];
      if (outline) {
        const scored = Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return { a, d: distToEdge(center, new THREE.Vector2(Math.cos(a), Math.sin(a)), outline) };
        }).sort((p, q) => p.d - q.d);
        // (All of them, so none wander across the counter into a basin.)
        for (let v = 0; v < vines; v++) dirs.push(scored[Math.floor(rnd() * 10)].a + (rnd() - 0.5) * 0.3);
      } else for (let v = 0; v < vines; v++) dirs.push((v / vines) * Math.PI * 2 + rnd() * 0.4);

      for (let v = 0; v < vines; v++) {
        const a = dirs[v];
        const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
        const L = trail * (0.45 + rnd() * 0.75);
        const at = (d: number, y: number) => new THREE.Vector3(center.x + dir.x * d, y, center.y + dir.y * d);
        const pts: THREE.Vector3[] = [
          at(potR * 0.4, potH + 1.5 + rnd()),
          at(potR + 0.4, potH + 0.6),
          at(potR + 1.1, potH - 1.5),
        ];
        let used = potH + 1;
        const edge = outline ? distToEdge(center, dir, outline) : Infinity;
        const onTop = Math.max(potR + 1.6, Math.min(edge, potR + 1.6 + (L - used)));
        pts.push(at(potR + 1.5, 0.6));
        if (edge < Infinity && L - used > edge - potR) {
          // Across the top to the edge, over the lip, then hang
          if (edge > potR + 2.2) pts.push(at((potR + 1.5 + edge) / 2, 0.35));
          pts.push(at(edge - 0.3, 0.35), at(edge + 0.5, -0.6));
          used += edge - potR;
          const hang = Math.min(maxDrop, L - used);
          const sway = (rnd() - 0.5) * 2;
          const steps = Math.max(2, Math.round(hang / 5));
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(Math.sin(t * Math.PI) * sway);
            const p = at(edge + 0.9 + t * 0.8, -0.6 - hang * t);
            p.x += side.x;
            p.z += side.y;
            pts.push(p);
          }
        } else {
          // Stays on the surface (or the floor): trail out and curl
          const run = outline ? Math.min(onTop, edge - 0.8) : Math.min(potR + 1.6 + (L - used) * 0.6, potR + 16);
          const curl = new THREE.Vector2(-dir.y, dir.x).multiplyScalar((rnd() - 0.5) * 4);
          const end = at(run, 0.3);
          end.x += curl.x;
          end.z += curl.y;
          pts.push(at((potR + 1.5 + run) / 2, 0.3), end);
        }
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const length = curve.getLength();
        stemParts.push(new THREE.TubeGeometry(curve, Math.max(16, Math.round(length * 2)), kind === 'pearls' ? 0.04 : 0.07, 5));
        if (kind === 'pearls') {
          const n = Math.round(length / 0.55);
          for (let i = 2; i < n; i++) {
            const p = curve.getPointAt(i / n);
            const b = bead.clone();
            const s = 0.8 + rnd() * 0.4;
            b.scale(s, s, s);
            b.translate(p.x + (rnd() - 0.5) * 0.25, p.y + (rnd() - 0.5) * 0.25, p.z + (rnd() - 0.5) * 0.25);
            beadParts.push(b);
          }
        } else {
          const n = Math.round(length / 1.6);
          for (let i = 1; i < n; i++) {
            const t = i / n;
            const p = curve.getPointAt(t);
            const tan = curve.getTangentAt(t);
            const out = new THREE.Vector3(dir.x, 0, dir.y);
            // Hanging leaves turn their faces out and droop; leaves on top lie out and up
            const hangingPart = p.y < 0;
            const leafDir = hangingPart
              ? out.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, -0.6, 0)).add(new THREE.Vector3((rnd() - 0.5) * 0.8, 0, (rnd() - 0.5) * 0.8))
              : new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).multiplyScalar(i % 2 ? 1 : -1).add(new THREE.Vector3(0, 0.7, 0));
            const g = heart.clone();
            const s = (0.6 + rnd() * 0.5) * (1 - t * 0.35);
            g.scale(s, s, s);
            place(g, p, leafDir, rnd() * Math.PI * 2);
          }
        }
      }
      // A full, low crown so the pot doesn't look bald
      for (let i = 0; i < (kind === 'pearls' ? 0 : 16); i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * potR * 0.8;
        const g = heart.clone();
        const s = 0.8 + rnd() * 0.5;
        g.scale(s, s, s);
        place(g, new THREE.Vector3(center.x + Math.cos(a) * r, potH + 0.5 + rnd() * 3, center.y + Math.sin(a) * r), new THREE.Vector3(Math.cos(a), 0.9 + rnd(), Math.sin(a)), rnd() * 6);
      }
      if (kind === 'pearls') {
        for (let i = 0; i < 90; i++) {
          const a = rnd() * Math.PI * 2;
          const r = rnd() * potR * 0.85;
          const b = bead.clone();
          b.translate(center.x + Math.cos(a) * r, potH - 0.6 + rnd() * 1.2, center.y + Math.sin(a) * r);
          beadParts.push(b);
        }
      }
      heart.dispose();
      bead.dispose();
    }
    const empty = () => new THREE.BufferGeometry();
    return {
      leaves: leafParts.length ? merge(leafParts) : empty(),
      stems: stemParts.length ? merge(stemParts) : empty(),
      beads: beadParts.length ? merge(beadParts) : empty(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, h, potH, potR, trail, outlineKey, maxDrop]);
  useEffect(
    () => () => {
      leaves.dispose();
      stems.dispose();
      beads.dispose();
    },
    [leaves, stems, beads],
  );
  const leafMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: LEAF_COLOR[kind] ?? LEAF_COLOR.pothos,
        roughness: kind === 'olive' ? 0.75 : kind === 'snake' ? 0.45 : 0.5,
        side: THREE.DoubleSide,
        sheen: kind === 'olive' ? 0.6 : 0,
        sheenColor: new THREE.Color('#c9d0bd'),
      }),
    [kind],
  );
  useEffect(() => () => leafMat.dispose(), [leafMat]);
  // Trailing plants' geometry is authored around the pot center; others around the pot at origin.
  const potZ = potR + 0.5;
  return (
    <group>
      <group position={[0, 0, potZ]}>
        <mesh geometry={pot} castShadow receiveShadow>
          <meshPhysicalMaterial color={potColor} roughness={0.85} />
        </mesh>
        <mesh position={[0, potH - 1.05, 0]} rotation-x={-Math.PI / 2} material={matte('#3d3129', 1)}>
          <circleGeometry args={[(potStyle === 'bowl' ? potR * 0.85 : potR - 0.45) - 0.05, 32]} />
        </mesh>
      </group>
      <group position={trailing ? [0, 0, 0] : [0, 0, potZ]}>
        <mesh geometry={stems} material={matte(kind === 'olive' ? '#6b5c4a' : '#4f6b3a', 0.9)} castShadow />
        <mesh geometry={leaves} material={leafMat} castShadow receiveShadow />
        {kind === 'pearls' && <mesh geometry={beads} material={leafMat} castShadow />}
      </group>
    </group>
  );
}

function useGeo(make: () => THREE.BufferGeometry, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}
