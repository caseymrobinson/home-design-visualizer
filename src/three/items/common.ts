import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { Design, Item } from '../../lib/types';
import { box } from '../geom';

export interface ItemProps {
  item: Item;
  design: Design;
}

export function P(it: Item, key: string, fallback: string): string;
export function P(it: Item, key: string, fallback: number): number;
export function P(it: Item, key: string, fallback: boolean): boolean;
export function P(it: Item, key: string, fallback: string | number | boolean) {
  const v = it.params[key];
  if (v === undefined) return fallback;
  if (typeof fallback === 'number') return Number(v);
  if (typeof fallback === 'boolean') return v === true || v === 'true';
  return String(v);
}

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'uv', 'normal'];
evaluator.useGroups = false;

function prep(g: THREE.BufferGeometry) {
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Boolean subtract a list of cutters (all already positioned in the same space). */
export function subtract(base: THREE.BufferGeometry, cutters: THREE.BufferGeometry[]) {
  let a = new Brush(prep(base));
  a.updateMatrixWorld();
  for (const c of cutters) {
    const b = new Brush(prep(c));
    b.updateMatrixWorld();
    a = evaluator.evaluate(a, b, SUBTRACTION);
  }
  return a.geometry;
}

export type FrontStyle = 'slab' | 'shaker' | 'fluted' | 'reeded';

/** One cabinet door / drawer front at [x0,x1]×[y0,y1], back face at z0. */
export function frontGeometry(style: FrontStyle, x0: number, x1: number, y0: number, y1: number, z0: number, t = 0.75) {
  const parts: THREE.BufferGeometry[] = [];
  const grain = 'vertical' as const;
  if (style === 'slab') {
    parts.push(box(x0, x1, y0, y1, z0, z0 + t, grain));
  } else if (style === 'shaker') {
    const s = Math.min(2.5, (x1 - x0) / 5, (y1 - y0) / 4);
    parts.push(box(x0, x1, y0, y1, z0, z0 + t - 0.25, grain));
    parts.push(box(x0, x0 + s, y0, y1, z0 + t - 0.25, z0 + t, grain));
    parts.push(box(x1 - s, x1, y0, y1, z0 + t - 0.25, z0 + t, grain));
    parts.push(box(x0 + s, x1 - s, y0, y0 + s, z0 + t - 0.25, z0 + t, 'horizontal'));
    parts.push(box(x0 + s, x1 - s, y1 - s, y1, z0 + t - 0.25, z0 + t, 'horizontal'));
  } else {
    const r = style === 'fluted' ? 0.42 : 0.22;
    const pitch = r * 2 + (style === 'fluted' ? 0.06 : 0.03);
    const depth = style === 'fluted' ? 0.32 : 0.18;
    parts.push(box(x0, x1, y0, y1, z0, z0 + t - depth, grain));
    const n = Math.floor((x1 - x0 - 0.1) / pitch);
    const start = (x0 + x1) / 2 - ((n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) {
      const c = new THREE.CylinderGeometry(r, r, y1 - y0, 10, 1, true, -Math.PI / 2, Math.PI);
      c.scale(1, 1, depth / r);
      c.translate(start + i * pitch, (y0 + y1) / 2, z0 + t - depth);
      parts.push(c);
    }
  }
  return parts;
}

export type PullStyle = 'edge' | 'bar' | 'knob' | 'none';

/** Hardware for a front. `at` = where the pull sits on the front. */
export function pullGeometry(style: PullStyle, cx: number, cy: number, zFront: number, orient: 'h' | 'v', length = 7) {
  const parts: THREE.BufferGeometry[] = [];
  if (style === 'none') return parts;
  if (style === 'edge') {
    // A slim tab that wraps the top edge of the front
    if (orient === 'h') {
      parts.push(box(cx - 3, cx + 3, cy - 0.9, cy, zFront, zFront + 0.07));
      parts.push(box(cx - 3, cx + 3, cy - 0.07, cy, zFront - 0.7, zFront + 0.07));
    } else {
      parts.push(box(cx - 0.07, cx, cy - 3, cy + 3, zFront - 0.7, zFront + 0.07));
      parts.push(box(cx - 0.9, cx, cy - 3, cy + 3, zFront, zFront + 0.07));
    }
  } else if (style === 'bar') {
    const L = length;
    const post = (px: number, py: number) => {
      const c = new THREE.CylinderGeometry(0.19, 0.19, 1.1, 16);
      c.rotateX(Math.PI / 2);
      c.translate(px, py, zFront + 0.55);
      parts.push(c);
    };
    const bar = new THREE.CylinderGeometry(0.25, 0.25, L + 0.6, 20);
    if (orient === 'h') {
      bar.rotateZ(Math.PI / 2);
      bar.translate(cx, cy, zFront + 1.1);
      post(cx - L / 2, cy);
      post(cx + L / 2, cy);
    } else {
      bar.translate(cx, cy, zFront + 1.1);
      post(cx, cy - L / 2);
      post(cx, cy + L / 2);
    }
    parts.push(bar);
  } else if (style === 'knob') {
    const stem = new THREE.CylinderGeometry(0.22, 0.3, 0.9, 16);
    stem.rotateX(Math.PI / 2);
    stem.translate(cx, cy, zFront + 0.45);
    const head = new THREE.SphereGeometry(0.6, 20, 14);
    head.scale(1, 1, 0.7);
    head.translate(cx, cy, zFront + 1.1);
    parts.push(stem, head);
  }
  return parts;
}

/** Tube along a smooth path — faucets, spouts, arms. */
export function tube(points: [number, number, number][], radius: number, seg = 48) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, seg, radius, 20, false);
}

/** Closed lathe from an (r, y) profile — bowls, vases, pots. */
export function lathe(profile: [number, number][], seg = 64) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
  g.computeVertexNormals();
  return g;
}
