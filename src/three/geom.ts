import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Surface } from '../lib/geometry';
import { worldUV } from '../materials/library';

/** Axis-aligned box from min/max corners, with inch-scale planar UVs. */
export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, grain: 'vertical' | 'horizontal' = 'vertical') {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return worldUV(g, grain);
}

export function merge(geos: THREE.BufferGeometry[]) {
  const valid = geos.filter(Boolean);
  if (!valid.length) return new THREE.BufferGeometry();
  const m = mergeGeometries(
    valid.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  );
  valid.forEach((g) => g.dispose());
  return m ?? new THREE.BufferGeometry();
}

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Split a rectangle into sub-rectangles that avoid every hole. */
export function rectMinusHoles(r: Rect, holes: Rect[]): Rect[] {
  const clipped = holes
    .map((h) => ({ u0: Math.max(r.u0, h.u0), u1: Math.min(r.u1, h.u1), v0: Math.max(r.v0, h.v0), v1: Math.min(r.v1, h.v1) }))
    .filter((h) => h.u1 - h.u0 > 1e-3 && h.v1 - h.v0 > 1e-3);
  if (!clipped.length) return [r];
  const us = [...new Set([r.u0, r.u1, ...clipped.flatMap((h) => [h.u0, h.u1])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i];
    const b = us[i + 1];
    if (b - a < 1e-3) continue;
    const mid = (a + b) / 2;
    const cover = clipped.filter((h) => h.u0 <= mid && h.u1 >= mid).sort((p, q) => p.v0 - q.v0);
    let v = r.v0;
    for (const h of cover) {
      if (h.v0 > v + 1e-3) out.push({ u0: a, u1: b, v0: v, v1: h.v0 });
      v = Math.max(v, h.v1);
    }
    if (r.v1 > v + 1e-3) out.push({ u0: a, u1: b, v0: v, v1: r.v1 });
  }
  // Merge vertically-identical neighbours to keep triangle counts low.
  out.sort((p, q) => p.v0 - q.v0 || p.v1 - q.v1 || p.u0 - q.u0);
  const merged: Rect[] = [];
  for (const q of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.v0 - q.v0) < 1e-3 && Math.abs(last.v1 - q.v1) < 1e-3 && Math.abs(last.u1 - q.u0) < 1e-3) last.u1 = q.u1;
    else merged.push({ ...q });
  }
  return merged;
}

/** Surface-local → room (inch) space. X = along the surface, Y = up, Z = out of the surface into the room. */
export function surfaceMatrix(s: Surface) {
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(s.u.x, 0, s.u.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.n.x, 0, s.n.y));
  m.setPosition(s.origin.x, 0, s.origin.y);
  return m;
}

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Rounded box (all edges), good for porcelain, cushions and soft-edged casework. */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 4) {
  if (r <= 0) return new THREE.BoxGeometry(w, h, d);
  // Extrude a rounded rect and let the bevel round the front/back edges too.
  const s = roundedRectShape(w - 2 * r, h - 2 * r, Math.max(0.0001, r * 0.2));
  const e = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.0001, d - 2 * r),
    bevelEnabled: true,
    bevelSegments: seg,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: seg * 2,
  });
  e.translate(0, 0, -(d - 2 * r) / 2);
  e.computeVertexNormals();
  return e;
}

let skyTex: THREE.CanvasTexture | null = null;
/** Soft outdoor view: sky, distant tree line, garden. Used behind windows. */
export function skyTexture() {
  if (skyTex) return skyTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#7fa6d4');
  g.addColorStop(0.45, '#c9dcea');
  g.addColorStop(0.6, '#e9eef0');
  g.addColorStop(0.62, '#9aa98c');
  g.addColorStop(1, '#6f7d5f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // Tree line
  ctx.filter = 'blur(6px)';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512;
    const r = 20 + Math.random() * 45;
    ctx.fillStyle = `rgba(${70 + Math.random() * 30},${90 + Math.random() * 30},${60 + Math.random() * 20},0.85)`;
    ctx.beginPath();
    ctx.arc(x, 318 - Math.random() * 40, r, 0, Math.PI * 2);
    ctx.fill();
  }
  skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  return skyTex;
}
