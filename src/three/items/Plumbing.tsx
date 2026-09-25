import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fabricMaterial, glass, metalMaterial, porcelain } from '../../materials/library';
import { merge, roundedBox } from '../geom';
import { P, subtract, tube, type ItemProps } from './common';

function useGeo(make: () => THREE.BufferGeometry, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

export function Tub({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const drain = P(item, 'drain', 'left');
  const enamel = porcelain(P(item, 'color', '#f4f2ee'));
  const metal = metalMaterial(design.finishes.metal);
  const shell = useGeo(() => {
    const outer = roundedBox(w, h, d, 0.6, 3);
    outer.translate(0, h / 2, d / 2);
    const iw = w - 7;
    const idp = d - 7.5;
    const inner = roundedBox(iw, h * 2, idp, 3.2, 6);
    inner.translate(0, h + 2.2, d / 2 + 0.25);
    return subtract(outer, [inner]);
  }, [w, d, h]);
  const fittings = useGeo(() => {
    const sx = drain === 'left' ? -(w / 2 - 3.5 - 3) : w / 2 - 3.5 - 3;
    const endX = drain === 'left' ? -(w - 7) / 2 : (w - 7) / 2;
    const plate = new THREE.CylinderGeometry(1.5, 1.5, 0.25, 32);
    plate.rotateZ(Math.PI / 2);
    plate.translate(endX + (drain === 'left' ? 0.35 : -0.35), h - 5, d / 2);
    const dr = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 32);
    dr.translate(sx, 2.3, d / 2);
    return merge([plate, dr]);
  }, [w, d, h, drain]);
  return (
    <group>
      <mesh geometry={shell} material={enamel} castShadow receiveShadow />
      <mesh geometry={fittings} material={metal} castShadow />
    </group>
  );
}

/** Elongated bowl outline in plan (x across, z forward), starting at zBack. */
function bowlShape(halfW: number, zBack: number, zFront: number, inset = 0) {
  const s = new THREE.Shape();
  const hw = halfW - inset;
  const zb = zBack + inset;
  const zf = zFront - inset;
  const cz = zb + (zf - zb) * 0.42;
  const rz = zf - cz;
  // Shape space: (x, −z) so rotating −90° about X maps it to the floor plane.
  s.moveTo(-hw * 0.82, -zb);
  s.lineTo(hw * 0.82, -zb);
  s.quadraticCurveTo(hw, -zb, hw, -(zb + (cz - zb) * 0.6));
  s.lineTo(hw, -cz);
  s.absellipse(0, -cz, hw, rz, 0, -Math.PI, true, 0);
  s.lineTo(-hw, -(zb + (cz - zb) * 0.6));
  s.quadraticCurveTo(-hw, -zb, -hw * 0.82, -zb);
  return s;
}

function extrudeUp(shape: THREE.Shape, y0: number, height: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 5,
    curveSegments: 40,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  g.computeVertexNormals();
  return g;
}

export function Toilet({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const style = P(item, 'style', 'one-piece');
  const china = porcelain(P(item, 'color', '#f6f5f2'));
  const metal = metalMaterial(design.finishes.metal);
  const rim = 15;
  const tankD = 7.5;
  const body = useGeo(() => {
    const hw = Math.min(w, 15) / 2;
    const parts: THREE.BufferGeometry[] = [];
    // Skirted base, slightly narrower at the floor
    const base = extrudeUp(bowlShape(hw - 0.4, tankD - 1, d - 1.2), 0, rim - 2.2, 0.6);
    const upper = extrudeUp(bowlShape(hw, tankD - 1.2, d - 0.3), rim - 2.8, 2.8, 0.9);
    parts.push(base, upper);
    // Tank
    const tankH = h - rim + (style === 'two-piece' ? 0 : 0.5);
    const tank = roundedBox(w, tankH, tankD, style === 'two-piece' ? 0.8 : 1.4, 4);
    tank.translate(0, rim + tankH / 2 - (style === 'two-piece' ? -0.6 : 0.5), tankD / 2 + 0.4);
    parts.push(tank);
    if (style === 'two-piece') {
      const lid = roundedBox(w + 0.5, 1, tankD + 0.6, 0.45, 3);
      lid.translate(0, h + 0.1, tankD / 2 + 0.4);
      parts.push(lid);
    }
    return merge(parts);
  }, [w, d, h, style]);
  const seat = useGeo(() => {
    const hw = Math.min(w, 15) / 2;
    const ring = bowlShape(hw + 0.1, tankD + 0.6, d - 0.1);
    ring.holes.push(bowlShape(hw - 2.3, tankD + 2.8, d - 2.3) as unknown as THREE.Path);
    const s = extrudeUp(ring, rim, 1, 0.35);
    const lid = extrudeUp(bowlShape(hw + 0.1, tankD + 1.4, d), rim + 1.1, 1, 0.45);
    return merge([s, lid]);
  }, [w, d]);
  const button = useGeo(() => {
    if (style === 'two-piece') {
      const lever = new THREE.BoxGeometry(2.6, 0.5, 0.35);
      lever.translate(-w / 2 + 2, h - 2.5, tankD + 0.6);
      const hub = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 20);
      hub.rotateX(Math.PI / 2);
      hub.translate(-w / 2 + 1.2, h - 2.5, tankD + 0.6);
      return merge([lever, hub]);
    }
    const b = new THREE.CylinderGeometry(0.9, 0.9, 0.25, 32);
    b.translate(0, h + 0.1, tankD / 2 + 0.6);
    return b;
  }, [w, h, style]);
  return (
    <group>
      <mesh geometry={body} material={china} castShadow receiveShadow />
      <mesh geometry={seat} material={china} castShadow receiveShadow />
      <mesh geometry={button} material={metal} castShadow />
    </group>
  );
}

export function ShowerTrim({ item, design }: ItemProps) {
  const { h } = item;
  const metal = metalMaterial(design.finishes.metal);
  const head = P(item, 'head', 'round');
  const size = P(item, 'headSize', 8);
  const geo = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    // Tub spout
    const flange = new THREE.CylinderGeometry(1.2, 1.2, 0.4, 28);
    flange.rotateX(Math.PI / 2);
    flange.translate(0, 2, 0.2);
    const spout = roundedBox(1.9, 1.7, 6.5, 0.8, 3);
    spout.translate(0, 2, 3.4);
    parts.push(flange, spout);
    // Valve trim
    const valveY = 26;
    const esc = new THREE.CylinderGeometry(3.4, 3.4, 0.35, 48);
    esc.rotateX(Math.PI / 2);
    esc.translate(0, valveY, 0.18);
    const hub = new THREE.CylinderGeometry(0.9, 1.1, 1.8, 32);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, valveY, 1.2);
    const lever = new THREE.CapsuleGeometry(0.28, 3.6, 6, 12);
    lever.rotateZ(Math.PI / 2);
    lever.translate(1.8, valveY, 2);
    parts.push(esc, hub, lever);
    // Shower arm & head
    const armY = h - 2;
    const fl = new THREE.CylinderGeometry(1.1, 1.1, 0.4, 28);
    fl.rotateX(Math.PI / 2);
    fl.translate(0, armY, 0.2);
    const arm = tube(
      [
        [0, armY, 0],
        [0, armY + 0.2, 4],
        [0, armY - 0.2, 7.2],
        [0, armY - 1.4, 8.6],
      ],
      0.42,
    );
    parts.push(fl, arm);
    const r = size / 2;
    const hd = head === 'square' ? new THREE.BoxGeometry(size, 0.45, size) : new THREE.CylinderGeometry(r, r, 0.45, 64);
    hd.rotateX(0.12);
    hd.translate(0, armY - 1.8, 8.6 + (head === 'square' ? 0 : 0));
    parts.push(hd);
    return merge(parts);
  }, [h, head, size]);
  const face = useGeo(() => {
    const r = size / 2 - 0.35;
    const g = head === 'square' ? new THREE.BoxGeometry(size - 0.6, 0.05, size - 0.6) : new THREE.CylinderGeometry(r, r, 0.05, 64);
    g.rotateX(0.12);
    g.translate(0, h - 2 - 2.05, 8.6);
    return g;
  }, [h, head, size]);
  return (
    <group>
      <mesh geometry={geo} material={metal} castShadow />
      <mesh geometry={face} castShadow>
        <meshStandardMaterial color="#2b2b2b" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function GlassPanel({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const tint = P(item, 'tint', 'clear') as 'clear' | 'smoke' | 'fluted';
  const hardware = P(item, 'hardware', true);
  const metal = metalMaterial(design.finishes.metal);
  const clamps = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const y of [h * 0.2, h * 0.8]) {
      const c = new THREE.BoxGeometry(1.4, 2.2, 1.9);
      c.translate(0, y, 0.95);
      parts.push(c);
    }
    // Stabiliser bar back to the wall
    return merge(parts);
  }, [h]);
  return (
    <group>
      <mesh position={[0, h / 2, d / 2 + 0.2]} material={glass(tint)} castShadow={false}>
        <boxGeometry args={[Math.max(0.3, w), h, d - 0.4]} />
      </mesh>
      {hardware && <mesh geometry={clamps} material={metal} castShadow />}
    </group>
  );
}

export function Curtain({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const open = P(item, 'open', 0.35);
  const color = P(item, 'color', '#ece6db');
  const metal = metalMaterial(design.finishes.metal);
  const cloth = useGeo(() => {
    const spread = Math.max(6, w * (1 - open));
    const folds = Math.round(spread / 3.2);
    const segX = folds * 8;
    const g = new THREE.PlaneGeometry(1, h - 1, segX, 24);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5; // 0..1
      const y = pos.getY(i);
      const t = (y + (h - 1) / 2) / (h - 1); // 0 bottom .. 1 top
      const x = -w / 2 + u * spread;
      const amp = 1.1 + (1 - t) * 0.5;
      const z = Math.sin(u * folds * Math.PI * 2) * amp + Math.sin(u * 7.3 + y * 0.05) * 0.2;
      pos.setXYZ(i, x, y + (h - 1) / 2, d / 2 + z);
    }
    g.computeVertexNormals();
    return g;
  }, [w, d, h, open]);
  const mat = useMemo(() => {
    const m = fabricMaterial(color, false).clone();
    m.side = THREE.DoubleSide;
    return m;
  }, [color]);
  return (
    <group>
      <mesh position={[0, h, d / 2]} rotation-z={Math.PI / 2} material={metal} castShadow>
        <cylinderGeometry args={[0.5, 0.5, w, 20]} />
      </mesh>
      <mesh geometry={cloth} material={mat} castShadow receiveShadow />
    </group>
  );
}
