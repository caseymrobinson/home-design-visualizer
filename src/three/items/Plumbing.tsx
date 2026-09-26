import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fabricMaterial, glass, metalMaterial, porcelain } from '../../materials/library';
import { box, merge, roundedBox } from '../geom';
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
  const handheld = P(item, 'handheld', 'none');
  const spoutStyle = P(item, 'spout', 'round');
  const fixed = handheld !== 'slidebar';
  const geo = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    // Tub spout
    if (spoutStyle === 'arzo') {
      // Delta Arzo RP48333: 7″ long × 2½″ tall, 6⅜″ reach; squared body with a raked nose.
      const prof = new THREE.Shape();
      prof.moveTo(0, -1.25);
      prof.lineTo(6.375, -1.25);
      prof.lineTo(6.375, -0.35);
      prof.lineTo(5.2, 1.25);
      prof.lineTo(0, 1.25);
      prof.lineTo(0, -1.25);
      const sp = new THREE.ExtrudeGeometry(prof, { depth: 2.2, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
      sp.rotateY(-Math.PI / 2);
      sp.translate(1.1, 2, 0);
      sp.computeVertexNormals();
      parts.push(sp);
    } else {
      const flange = new THREE.CylinderGeometry(1.2, 1.2, 0.4, 28);
      flange.rotateX(Math.PI / 2);
      flange.translate(0, 2, 0.2);
      const spout = roundedBox(1.9, 1.7, 6.5, 0.8, 3);
      spout.translate(0, 2, 3.4);
      parts.push(flange, spout);
    }
    // Valve trim
    const valveY = 26;
    if (head === 'square') {
      // Delta Monitor 14 Modern trim (from photo): 6½″ × 7⅞″ plate; diverter dial on top,
      // square lever block below with a flat blade dropping down the right side.
      const plate = roundedBox(6.5, 7.875, 0.35, 0.08, 2);
      plate.translate(0, valveY, 0.18);
      const divBlock = roundedBox(1.5, 1.5, 1.1, 0.12, 2);
      divBlock.translate(0.2, valveY + 2.0, 0.9);
      const divDial = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 32);
      divDial.rotateX(Math.PI / 2);
      divDial.translate(0.2, valveY + 2.0, 1.55);
      const divTab = box(0.9, 1.6, valveY + 2.2, valveY + 3.1, 0.3, 1.2);
      const hBlock = roundedBox(1.7, 1.7, 1.6, 0.12, 2);
      hBlock.translate(0.2, valveY - 0.9, 1.1);
      const blade = box(1.05, 1.5, valveY - 4.2, valveY - 0.6, 0.35, 2.1);
      parts.push(plate, divBlock, divDial, divTab, hBlock, blade);
    } else {
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
    }
    if (handheld === 'holder') {
      // Square wall holder with integrated outlet; slim round wand standing in it; hose loops below
      const bx = -8;
      const hy = valveY + 16;
      const flange = roundedBox(2, 2, 0.4, 0.1, 2);
      flange.translate(bx, hy, 0.2);
      const arm = box(bx - 0.6, bx + 0.6, hy - 0.6, hy + 0.6, 0.4, 2.6);
      const cradle = roundedBox(1.5, 1.4, 1.5, 0.15, 2);
      cradle.translate(bx, hy, 3.1);
      const wand = new THREE.CylinderGeometry(0.45, 0.42, 8.5, 28);
      wand.translate(bx, hy + 3.4, 3.1);
      const nozzle = new THREE.CylinderGeometry(0.52, 0.48, 2.6, 28);
      nozzle.translate(bx, hy + 8.9, 3.1);
      const hose = tube(
        [
          [bx, hy - 0.8, 3.1],
          [bx, hy - 5, 3.1],
          [bx - 0.4, hy - 16, 3.3],
          [bx + 0.6, hy - 22, 3.6],
          [bx + 1.3, hy - 16, 3.8],
          [bx + 1.0, hy - 6, 3.4],
          [bx + 0.4, hy - 1.4, 1.5],
        ],
        0.2,
        80,
      );
      parts.push(flange, arm, cradle, wand, nozzle, hose);
    }
    if (handheld === 'combo' || handheld === 'slidebar') {
      // Slide bar beside the valve, handheld resting in its bracket, hose to a wall elbow
      const bx = 6.5;
      const y0 = valveY + 6;
      const y1 = Math.max(y0 + 12, h - 6);
      const bar = new THREE.CylinderGeometry(0.4, 0.4, y1 - y0, 20);
      bar.translate(bx, (y0 + y1) / 2, 1.8);
      parts.push(bar);
      for (const y of [y0, y1]) {
        const post = new THREE.CylinderGeometry(0.35, 0.45, 1.8, 16);
        post.rotateX(Math.PI / 2);
        post.translate(bx, y, 0.9);
        const rose = new THREE.CylinderGeometry(0.9, 0.9, 0.3, 24);
        rose.rotateX(Math.PI / 2);
        rose.translate(bx, y, 0.15);
        parts.push(post, rose);
      }
      const hy = y1 - 4;
      const bracket = roundedBox(1.4, 1.6, 1.6, 0.4, 2);
      bracket.translate(bx, hy, 2.6);
      parts.push(bracket);
      // handheld: handle angled forward, head at top facing down/out
      const handle = new THREE.CylinderGeometry(0.5, 0.42, 7, 20);
      handle.rotateX(-0.35);
      handle.translate(bx, hy + 2.2, 3.5);
      const hh = new THREE.CylinderGeometry(2, 1.7, 0.9, 40);
      hh.rotateX(-0.35 - Math.PI / 2 + 0.3);
      hh.translate(bx, hy + 5.6, 5);
      parts.push(handle, hh);
      // wall supply elbow + hose drooping in a loop
      const ex = 3;
      const ey = valveY - 5;
      const elbow = new THREE.CylinderGeometry(0.9, 0.9, 0.35, 24);
      elbow.rotateX(Math.PI / 2);
      elbow.translate(ex, ey, 0.18);
      const nub = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 16);
      nub.rotateX(Math.PI / 2);
      nub.translate(ex, ey, 0.9);
      const hose = tube(
        [
          [ex, ey, 1.5],
          [ex + 0.5, ey - 9, 3],
          [bx + 1, ey - 12, 4],
          [bx + 1.5, ey - 4, 4.4],
          [bx + 0.6, hy - 6, 4],
          [bx, hy - 1.2, 2.9],
        ],
        0.3,
        64,
      );
      parts.push(elbow, nub, hose);
    }
    if (!fixed) return merge(parts);
    // Shower arm & head
    const armY = h - 2;
    const r = size / 2;
    if (head === 'square') {
      // From photo: square wall flange, round arm straight out, rounded 90° bend down into a flat square head
      const reach = Math.max(10, size * 0.9 + 3);
      const fl = roundedBox(2.4, 2.4, 0.5, 0.1, 2);
      fl.translate(0, armY, 0.25);
      const arm = tube(
        [
          [0, armY, 0.3],
          [0, armY, reach * 0.6],
          [0, armY, reach - 1.6],
          [0, armY - 0.4, reach - 0.4],
          [0, armY - 1.6, reach],
          [0, armY - 2.6, reach],
        ],
        0.4,
        64,
      );
      const collar = new THREE.CylinderGeometry(0.55, 0.55, 0.7, 24);
      collar.translate(0, armY - 2.9, reach);
      const hd = roundedBox(size, 0.4, size, 0.12, 2);
      hd.translate(0, armY - 3.35, reach);
      parts.push(fl, arm, collar, hd);
      return merge(parts);
    }
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
    const hd = new THREE.CylinderGeometry(r, r, 0.45, 64);
    hd.rotateX(0.12);
    hd.translate(0, armY - 1.8, 8.6);
    parts.push(hd);
    return merge(parts);
  }, [h, head, size, handheld, spoutStyle]);
  const face = useGeo(() => {
    const r = size / 2 - 0.35;
    if (head === 'square') {
      const reach = Math.max(10, size * 0.9 + 3);
      const g = new THREE.BoxGeometry(size - 0.8, 0.04, size - 0.8);
      g.translate(0, h - 2 - 3.57, reach);
      return g;
    }
    const g = new THREE.CylinderGeometry(r, r, 0.05, 64);
    g.rotateX(0.12);
    g.translate(0, h - 2 - 2.05, 8.6);
    return g;
  }, [h, head, size]);
  return (
    <group>
      <mesh geometry={geo} material={metal} castShadow />
      <mesh geometry={face} castShadow visible={fixed}>
        <meshStandardMaterial color={head === 'square' ? '#6f7274' : '#2b2b2b'} roughness={0.5} metalness={head === 'square' ? 0.6 : 0} />
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
