import { Html, Line } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { CATALOG_BY_TYPE } from '../lib/catalog';
import { add, findSurface, itemFootprint, itemFront, itemRight, mul, planSegments, rayCast, type Vec2 } from '../lib/geometry';
import type { Design } from '../lib/types';
import { formatIn } from '../lib/units';
import { useStore } from '../store';
import { surfaceMatrix } from './geom';
import { dragApi } from './Items';
import { itemOnSurface } from './placement';

const ACCENT = '#c2703d';

function Dim({ a, b, label, center }: { a: THREE.Vector3; b: THREE.Vector3; label: string; center?: boolean }) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const perp = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(1.2);
  return (
    <group>
      <Line points={[a, b]} color={ACCENT} lineWidth={1.6} transparent opacity={0.95} depthTest={false} renderOrder={10} />
      <Line points={[a.clone().add(perp), a.clone().sub(perp)]} color={ACCENT} lineWidth={1.6} depthTest={false} renderOrder={10} />
      <Line points={[b.clone().add(perp), b.clone().sub(perp)]} color={ACCENT} lineWidth={1.6} depthTest={false} renderOrder={10} />
      <Html position={mid} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className="dim-label">
          {center && <span className="dim-cl">℄</span>}
          {label}
        </div>
      </Html>
    </group>
  );
}

export function Dimensions({ design }: { design: Design }) {
  const selectedId = useStore((s) => s.selectedId);
  const show = useStore((s) => s.showDims && !s.render.active);
  const [guides, setGuides] = useState(dragApi.guides);
  useEffect(() => {
    const l = () => setGuides([...dragApi.guides]);
    dragApi.listeners.add(l);
    return () => {
      dragApi.listeners.delete(l);
    };
  }, []);
  const item = design.items.find((i) => i.id === selectedId);
  const segs = useMemo(() => planSegments(design.room), [design.room]);

  if (!show || !item) return null;
  const entry = CATALOG_BY_TYPE[item.type];
  const dims: { a: THREE.Vector3; b: THREE.Vector3; label: string; center?: boolean }[] = [];
  let ring: THREE.Vector3[] | null = null;

  if (entry?.mount === 'wall') {
    const s = findSurface(design.room, item.surface);
    if (s) {
      const m = surfaceMatrix(s);
      const u = itemOnSurface(item, s);
      const midV = item.z + item.h / 2;
      const off = 0.8;
      const P = (uu: number, vv: number) => new THREE.Vector3(uu, vv, off).applyMatrix4(m);
      const uL = u - item.w / 2;
      const uR = u + item.w / 2;
      if (uL > 0.25) dims.push({ a: P(0, midV), b: P(uL, midV), label: formatIn(uL) });
      if (s.width - uR > 0.25) dims.push({ a: P(uR, midV), b: P(s.width, midV), label: formatIn(s.width - uR) });
      if (item.z > 0.25) dims.push({ a: P(u, 0), b: P(u, item.z), label: `${formatIn(item.z)} AFF` });
      const top = item.z + item.h;
      ring = [P(uL, item.z), P(uR, item.z), P(uR, top), P(uL, top), P(uL, item.z)];
    }
  } else if (entry?.mount === 'floor' || entry?.mount === 'ceiling') {
    const y = entry.mount === 'ceiling' ? design.room.ceiling - 0.5 : Math.max(0.6, item.z > 1 ? 0.6 : 0.6);
    const V = (p: Vec2) => new THREE.Vector3(p.x, y, p.y);
    const fp = itemFootprint(item);
    ring = [...fp, fp[0]].map(V);
    const r = itemRight(item.rot);
    const f = itemFront(item.rot);
    const o = { x: item.x, y: item.y };
    const cast = (from: Vec2, dir: Vec2, center = false) => {
      const d = rayCast(from, dir, segs);
      if (isFinite(d) && d > 0.25 && d < 240) dims.push({ a: V(from), b: V(add(from, mul(dir, d))), label: formatIn(d), center });
    };
    const centerline = item.type === 'toilet';
    const mid = add(o, mul(f, item.d / 2));
    if (centerline) {
      const cl = add(o, mul(f, Math.min(item.d * 0.6, 14)));
      cast(cl, r, true);
      cast(cl, mul(r, -1), true);
    } else {
      cast(add(mid, mul(r, item.w / 2)), r);
      cast(add(mid, mul(r, -item.w / 2)), mul(r, -1));
    }
    cast(add(o, mul(f, item.d)), f);
    cast(o, mul(f, -1));
  }

  return (
    <group>
      {ring && <Line points={ring} color={ACCENT} lineWidth={1.2} dashed dashSize={1.2} gapSize={0.8} depthTest={false} renderOrder={9} />}
      {dims.map((d, i) => (
        <Dim key={i} {...d} />
      ))}
      {guides.length > 0 && ring && (
        <Html position={ring[0]} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div className="guide-chip">{guides[guides.length - 1].label}</div>
        </Html>
      )}
    </group>
  );
}
