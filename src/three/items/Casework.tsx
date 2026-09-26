import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { IN } from '../../lib/units';
import type { Design } from '../../lib/types';
import { lampColor, metalMaterial, porcelain, stoneMaterial, woodMaterial, worldUV, matte } from '../../materials/library';
import { box, merge, roundedBox, roundedRectShape } from '../geom';
import { frontGeometry, lathe, P, pullGeometry, subtract, tube, type FrontStyle, type ItemProps, type PullStyle } from './common';

const REVEAL = 0.125;

function useGeo(make: () => THREE.BufferGeometry, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

/** Faucet in local space: base at origin, spout reaching +z. */
function faucetGeometry(kind: string, tall: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const lift = tall ? 6 : 0;
  if (kind === 'delta-modern') {
    // Delta 567LF (from product photo): square base plate, square column, flat blade spout
    // off the top, and a blade lever on a square block, all crisp brushed stainless.
    const y = lift;
    const plate = box(-0.95, 0.95, y, y + 0.25, -0.95, 0.95);
    const col = box(-0.7, 0.7, y + 0.25, y + 4.9, -0.7, 0.7);
    const spout = box(-0.62, 0.62, y + 4.35, y + 4.9, -0.2, 6.0);
    const outlet = new THREE.CylinderGeometry(0.33, 0.33, 0.1, 24);
    outlet.translate(0, y + 4.3, 5.35);
    const collar = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 32);
    collar.translate(0, y + 4.96, 0);
    const block = box(-0.62, 0.62, y + 5.02, y + 6.875, -0.62, 0.62);
    const blade = box(-0.62, 0.62, y + 6.6, y + 6.875, 0.62, 4.6);
    parts.push(plate, col, spout, outlet, collar, block, blade);
    return merge(parts);
  }
  if (kind === 'wall') {
    const plate = new THREE.CylinderGeometry(1.1, 1.1, 0.35, 32);
    plate.rotateX(Math.PI / 2);
    plate.translate(0, 0, 0.18);
    const spout = tube(
      [
        [0, 0, 0],
        [0, 0, 4],
        [0, -0.1, 7.2],
        [0, -0.9, 8],
      ],
      0.36,
    );
    parts.push(plate, spout);
    for (const s of [-4, 4]) {
      const p = new THREE.CylinderGeometry(0.9, 0.9, 0.3, 28);
      p.rotateX(Math.PI / 2);
      p.translate(s, 0, 0.15);
      const h = new THREE.CylinderGeometry(0.34, 0.3, 1.8, 20);
      h.rotateX(Math.PI / 2);
      h.translate(s, 0, 1.2);
      parts.push(p, h);
    }
    return merge(parts);
  }
  const base = new THREE.CylinderGeometry(0.95, 1.05, 0.35, 32);
  base.translate(0, 0.17, 0);
  parts.push(base);
  const spout = tube(
    [
      [0, 0, 0],
      [0, 6 + lift, 0],
      [0, 9.6 + lift, 0.8],
      [0, 10.7 + lift, 3],
      [0, 10.1 + lift, 5.4],
      [0, 8.5 + lift, 6.4],
    ],
    0.42,
  );
  parts.push(spout);
  const aer = new THREE.CylinderGeometry(0.44, 0.44, 0.5, 20);
  aer.translate(0, 8.35 + lift, 6.45);
  parts.push(aer);
  if (kind === 'widespread') {
    for (const s of [-4, 4]) {
      const b = new THREE.CylinderGeometry(0.85, 0.95, 0.3, 28);
      b.translate(s, 0.15, 0);
      const stem = new THREE.CylinderGeometry(0.42, 0.48, 2, 24);
      stem.translate(s, 1.2, 0);
      const lever = new THREE.CapsuleGeometry(0.2, 2.6, 6, 12);
      lever.rotateX(Math.PI / 2);
      lever.translate(s, 2.1, 1.1);
      parts.push(b, stem, lever);
    }
  } else {
    const side = new THREE.CylinderGeometry(0.38, 0.38, 1.4, 20);
    side.rotateZ(Math.PI / 2);
    side.translate(0.9, 3.4 + lift * 0.5, 0);
    const lever = new THREE.CapsuleGeometry(0.16, 2.2, 6, 12);
    lever.rotateX(Math.PI / 2.4);
    lever.translate(1.5, 4.1 + lift * 0.5, 0.7);
    parts.push(side, lever);
  }
  return merge(parts);
}

export function Vanity({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const tt = P(item, 'topThickness', 1.5);
  const ch = h - tt;
  const sinks = Math.max(1, Math.min(2, P(item, 'sinks', 2)));
  const sinkStyle = P(item, 'sinkStyle', 'undermount');
  const faucet = P(item, 'faucet', 'single');
  const front = P(item, 'front', 'slab') as FrontStyle;
  const cols = Math.max(1, Math.round(P(item, 'columns', 3)));
  const rows = Math.max(1, Math.round(P(item, 'rows', 2)));
  const pulls = P(item, 'pulls', 'edge') as PullStyle;
  const gap = P(item, 'reveal', REVEAL);
  const wood = woodMaterial(P(item, 'wood', 'white-oak'), P(item, 'paint', '#5b6b5d'));
  const metal = metalMaterial(design.finishes.metal);
  const stone = stoneMaterial(P(item, 'top', 'white-quartz'));
  const frontT = 0.75;
  const frontZ = d - 0.5 - frontT;
  const sinkXs = sinks === 2 ? [-w / 4, w / 4] : [0];
  const bowl = { iw: Math.min(16, w / sinks - 6), id: Math.min(11.5, d - 8.5), depth: 6 };
  const sinkZ = d / 2 + 0.75;

  const carcass = useGeo(() => {
    let shell = box(-w / 2, w / 2, 0, ch, 0, frontZ, 'horizontal');
    if (sinkStyle !== 'vessel') {
      // Hollow out room for each basin so the bowl isn't buried in the cabinet.
      const cutters = sinkXs.map((sx) => {
        const c = box(sx - bowl.iw / 2 - 1, sx + bowl.iw / 2 + 1, ch - bowl.depth - 1.5, ch + 1, sinkZ - bowl.id / 2 - 1, sinkZ + bowl.id / 2 + 1);
        return c;
      });
      shell = subtract(shell, cutters);
    }
    const parts = [shell];
    // Fronts
    const colW = w / cols;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x0 = -w / 2 + c * colW + REVEAL / 2;
        const x1 = -w / 2 + (c + 1) * colW - REVEAL / 2;
        const rowH = ch / rows;
        // Finger-pull grooves read as a deeper reveal above each drawer
        const y0 = r * rowH + (r === 0 ? REVEAL / 2 : gap / 2);
        const y1 = (r + 1) * rowH - gap / 2;
        parts.push(...frontGeometry(front, x0, x1, y0, y1, frontZ, frontT));
      }
    }
    return worldUV(merge(parts), 'horizontal');
  }, [w, d, h, ch, cols, rows, front, frontZ, sinkStyle, sinks, gap]);

  const hardware = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const colW = w / cols;
    const rowH = ch / rows;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const cx = -w / 2 + (c + 0.5) * colW;
        const top = (r + 1) * rowH - REVEAL / 2;
        const len = pulls === 'profile' ? colW - 2 : Math.min(10, colW * 0.45);
        parts.push(...pullGeometry(pulls, cx, pulls === 'edge' || pulls === 'profile' ? top : top - 1.6, frontZ + frontT, 'h', len));
      }
    // Faucets
    for (const sx of sinkXs) {
      const f = faucetGeometry(faucet, sinkStyle === 'vessel');
      if (faucet === 'wall') f.translate(sx, h + (sinkStyle === 'vessel' ? 13 : 8), 0);
      else f.translate(sx, h, sinkZ - bowl.id / 2 - (faucet === 'delta-modern' ? 1.3 : 1.7));
      parts.push(f);
      // Drain
      const drain = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 24);
      drain.translate(sx, sinkStyle === 'vessel' ? h + 0.55 : ch - bowl.depth + 0.4, sinkZ);
      parts.push(drain);
    }
    return merge(parts);
  }, [w, d, h, ch, cols, rows, pulls, frontZ, faucet, sinkStyle, sinks]);

  const top = useGeo(() => {
    const slab = box(-w / 2, w / 2, ch, h, 0, d);
    if (sinkStyle === 'vessel') return worldUV(slab, 'horizontal');
    const cutters = sinkXs.map((sx) => {
      const c = new THREE.ExtrudeGeometry(roundedRectShape(bowl.iw, bowl.id, 1.6), { depth: tt + 2, bevelEnabled: false, curveSegments: 10 });
      c.rotateX(-Math.PI / 2);
      c.translate(sx, ch - 1, sinkZ);
      return c;
    });
    return worldUV(subtract(slab, cutters), 'horizontal');
  }, [w, d, h, ch, tt, sinkStyle, sinks]);

  const basins = useGeo(() => {
    if (sinkStyle === 'vessel') {
      const R = Math.min(8, w / sinks / 2 - 3);
      return merge(
        sinkXs.map((sx) => {
          const g = lathe([
            [0, 0],
            [R * 0.55, 0],
            [R * 0.85, 0.8],
            [R, 3.2],
            [R, 5],
            [R - 0.35, 5.1],
            [R - 0.4, 4.9],
            [R * 0.82, 1.2],
            [R * 0.5, 0.55],
            [0, 0.5],
          ]);
          g.translate(sx, h, sinkZ);
          return g;
        }),
      );
    }
    return merge(
      sinkXs.map((sx) => {
        const outer = roundedBox(bowl.iw + 1.2, bowl.depth + 1, bowl.id + 1.2, 1.2, 3);
        outer.translate(0, -(bowl.depth + 1) / 2, 0);
        const inner = roundedBox(bowl.iw, bowl.depth * 2, bowl.id, 1.8, 4);
        inner.translate(0, bowl.depth * 1 - bowl.depth, 0);
        const g = subtract(outer, [inner]);
        g.translate(sx, ch, sinkZ);
        return g;
      }),
    );
  }, [w, h, ch, sinkStyle, sinks]);

  return (
    <group>
      <mesh geometry={carcass} material={wood} castShadow receiveShadow />
      <mesh geometry={top} material={stone} castShadow receiveShadow />
      <mesh geometry={basins} material={sinkStyle === 'integrated' ? stone : porcelain()} castShadow receiveShadow />
      <mesh geometry={hardware} material={metal} castShadow />
      <UnderLight design={design} w={w} d={d} />
    </group>
  );
}

/** LED tape under a floating cabinet: a glowing strip plus a downward area light washing the floor. */
function UnderLight({ design, w, d }: { design: Design; w: number; d: number }) {
  const L = design.lighting;
  if (!L.underCabinet) return null;
  const color = lampColor(L.kelvin);
  const lumensPerFoot = 120;
  const lm = (lumensPerFoot * (w - 3)) / 12;
  const areaM2 = (w - 3) * IN * (1.2 * IN);
  const nits = (lm / (Math.PI * areaM2)) * L.dimmer;
  return (
    <group position={[0, -0.05, d - 2.2]}>
      <mesh rotation-x={Math.PI / 2}>
        <planeGeometry args={[w - 3, 0.5]} />
        <meshStandardMaterial color="#000000" emissive={color} emissiveIntensity={Math.min(nits, 4000)} />
      </mesh>
      <rectAreaLight width={(w - 3) * IN} height={1.2 * IN} intensity={nits} color={color} rotation-x={-Math.PI / 2} />
    </group>
  );
}

export function Linen({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const front = P(item, 'front', 'slab') as FrontStyle;
  const pulls = P(item, 'pulls', 'edge') as PullStyle;
  const doors = Math.max(1, Math.round(P(item, 'doors', 1)));
  const hinge = P(item, 'hinge', 'left');
  const wood = woodMaterial(P(item, 'wood', 'white-oak'), P(item, 'paint', '#5b6b5d'));
  const metal = metalMaterial(design.finishes.metal);
  const frontT = 0.75;
  const frontZ = d - frontT;
  const gap = P(item, 'reveal', REVEAL);
  const doorH = (h - REVEAL * 2 - gap * (doors - 1)) / doors;

  const body = useGeo(() => {
    const parts = [box(-w / 2, w / 2, 0, h, 0, frontZ)];
    for (let i = 0; i < doors; i++) {
      const y0 = REVEAL + i * (doorH + gap);
      parts.push(...frontGeometry(front, -w / 2 + REVEAL / 2, w / 2 - REVEAL / 2, y0, y0 + doorH, frontZ, frontT));
    }
    return worldUV(merge(parts), 'vertical');
  }, [w, d, h, front, doors, gap]);

  const hw = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const sx = hinge === 'left' ? 1 : -1;
    for (let i = 0; i < doors; i++) {
      const y0 = REVEAL + i * (doorH + gap);
      // The pull sits on the latch edge, near the middle of a comfortable reach.
      const cy = Math.min(y0 + doorH - 4, Math.max(y0 + 4, i === 0 && doors > 1 ? y0 + doorH - 5 : y0 + doorH * 0.5));
      if (pulls === 'edge' || pulls === 'profile') parts.push(...pullGeometry(pulls === 'profile' ? 'profile' : 'edge', sx * (w / 2 - REVEAL / 2), cy, frontZ + frontT, 'v', doorH * 0.35));
      else parts.push(...pullGeometry(pulls, sx * (w / 2 - 1.6), cy, frontZ + frontT, 'v', Math.min(10, doorH * 0.3)));
    }
    return merge(parts);
  }, [w, h, d, doors, hinge, pulls]);

  return (
    <group>
      <mesh geometry={body} material={wood} castShadow receiveShadow />
      {hw.attributes.position && <mesh geometry={hw} material={metal} castShadow />}
      <UnderLight design={design} w={w} d={d} />
    </group>
  );
}

export function Shelf({ item }: ItemProps) {
  const { w, d, h } = item;
  const wood = woodMaterial(P(item, 'wood', 'white-oak'));
  const decor = P(item, 'decor', true);
  const slab = useGeo(() => worldUV(box(-w / 2, w / 2, 0, h, 0, d), 'horizontal'), [w, d, h]);
  const vase = useGeo(
    () =>
      lathe([
        [0, 0],
        [1.3, 0],
        [1.9, 1.2],
        [2.1, 3],
        [1.4, 5.2],
        [0.7, 6.2],
        [0.75, 7.2],
        [0.6, 7.25],
        [0, 7.25],
      ]),
    [],
  );
  const jar = useGeo(
    () =>
      lathe([
        [0, 0],
        [1.8, 0],
        [1.85, 3.2],
        [1.3, 3.5],
        [1.3, 3.9],
        [0, 3.9],
      ]),
    [],
  );
  const stems = useGeo(
    () =>
      merge(
        [0, 1, 2, 3, 4].map((i) => {
          const a = (i - 2) * 0.28;
          return tube(
            [
              [0, 6, 0],
              [Math.sin(a) * 2, 11, Math.cos(a) * 0.5],
              [Math.sin(a) * 4.5, 15 + (i % 2) * 2, Math.cos(a) * 1],
            ],
            0.06,
            16,
          );
        }),
      ),
    [],
  );
  const books = useMemo(
    () => [
      { c: '#c9b8a0', t: 1.1, hh: 9 },
      { c: '#6f7a6a', t: 0.8, hh: 8.4 },
      { c: '#e8e1d5', t: 1.3, hh: 9.6 },
    ],
    [],
  );
  return (
    <group>
      <mesh geometry={slab} material={wood} castShadow receiveShadow />
      {decor && (
        <group position={[0, h, d / 2]}>
          <mesh geometry={vase} position={[-w / 2 + 5, 0, 0]} material={matte('#d9cfc0', 0.6)} castShadow />
          <mesh geometry={stems} position={[-w / 2 + 5, 0, 0]} material={matte('#6d6a4e', 0.8)} castShadow />
          {books.map((b, i) => (
            <mesh key={i} position={[w / 2 - 7 + i * 0.1, (b.t / 2) * 0 + books.slice(0, i).reduce((s, q) => s + q.t, 0) + b.t / 2, 0]} castShadow>
              <boxGeometry args={[b.hh, b.t, Math.min(d - 1, 6.2)]} />
              <meshStandardMaterial color={b.c} roughness={0.8} />
            </mesh>
          ))}
          <mesh geometry={jar} position={[w / 2 - 7, 3.2, 0]} material={matte('#b9a78f', 0.35)} castShadow />
        </group>
      )}
    </group>
  );
}
