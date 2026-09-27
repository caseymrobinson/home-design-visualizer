import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { fabricMaterial, matte, metalMaterial, mirrorPT, woodMaterial, worldUV } from '../../materials/library';
import { mulberry32 } from '../../materials/noise';
import { box, merge, roundedBox, roundedRectShape } from '../geom';
import { FLAGS } from '../../lib/flags';
import { registry } from '../registry';
import { lathe, P, tube, type ItemProps } from './common';

function useGeo(make: () => THREE.BufferGeometry, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

function mirrorShape(kind: string, w: number, h: number, cy: number) {
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  switch (kind) {
    case 'round': {
      const s = new THREE.Shape();
      s.absellipse(0, cy, w / 2, h / 2, 0, Math.PI * 2, false, 0);
      return s;
    }
    case 'arch': {
      const r = w / 2;
      const s = new THREE.Shape();
      s.moveTo(-r, y0);
      s.lineTo(r, y0);
      s.lineTo(r, Math.max(y0, y1 - r));
      s.absarc(0, Math.max(y0, y1 - r), r, 0, Math.PI, false);
      s.lineTo(-r, y0);
      return s;
    }
    case 'pill':
      return roundedRectShape(w, h, w / 2, 0, cy);
    case 'rounded':
      return roundedRectShape(w, h, Math.min(w, h) * 0.12, 0, cy);
    default:
      return roundedRectShape(w, h, 0.05, 0, cy);
  }
}

export function Mirror({ item, design }: ItemProps) {
  const { w, h } = item;
  const kind = P(item, 'shape', 'arch');
  const frame = P(item, 'frame', 'metal');
  const rail = P(item, 'rail', 'none');
  const ft = frame === 'metal' || frame === 'black' ? 0.55 : frame === 'wood' ? 1.4 : 0;
  const metal = metalMaterial(design.finishes.metal);
  const black = metalMaterial('matte-black');
  const railMat = rail === 'black' ? black : metal;
  const wood = woodMaterial('white-oak');
  const cy = h / 2;
  const hh = kind === 'round' ? w : h;
  const outer = useMemo(() => mirrorShape(kind, w, hh, cy), [kind, w, hh, cy]);
  const inner = useMemo(() => mirrorShape(kind, w - ft * 2, hh - ft * 2, cy), [kind, w, hh, cy, ft]);

  const frameGeo = useGeo(() => {
    if (ft <= 0) {
      const g = new THREE.ExtrudeGeometry(outer, { depth: 0.2, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2, curveSegments: 48 });
      g.translate(0, 0, 0.35);
      return g;
    }
    const s = outer.clone();
    s.holes = [inner];
    const g = new THREE.ExtrudeGeometry(s, {
      depth: frame === 'wood' ? 1.1 : 0.9,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      bevelSegments: 3,
      curveSegments: 64,
    });
    g.translate(0, 0, 0.1);
    return frame === 'wood' ? worldUV(g, 'vertical') : g;
  }, [outer, inner, ft, frame]);

  const glassGeo = useGeo(() => new THREE.ShapeGeometry(inner, 64), [inner]);

  const reflector = useMemo(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = new Reflector(glassGeo, {
      textureWidth: Math.round(window.innerWidth * dpr * 0.75),
      textureHeight: Math.round(window.innerHeight * dpr * 0.75),
      color: 0xbfc4c2,
      clipBias: 0.002,
      multisample: 4,
    });
    r.position.z = frame === 'none' ? 0.62 : 0.55;
    return r;
  }, [glassGeo, frame]);

  const stand = useMemo(() => {
    const m = new THREE.Mesh(glassGeo, mirrorPT());
    m.position.z = frame === 'none' ? 0.62 : 0.55;
    m.visible = false;
    return m;
  }, [glassGeo, frame]);

  useEffect(() => {
    registry.rasterOnly.add(reflector);
    registry.traceOnly.add(stand);
    return () => {
      registry.rasterOnly.delete(reflector);
      registry.traceOnly.delete(stand);
      reflector.dispose();
    };
  }, [reflector, stand]);

  return (
    <group>
      <mesh geometry={frameGeo} material={ft <= 0 ? matte('#2e3331', 0.3) : frame === 'wood' ? wood : frame === 'black' ? black : metal} castShadow receiveShadow />
      {rail !== 'none' && <MirrorRail w={w} top={kind === 'round' ? w : hh} material={railMat} />}
      <mesh position={[0, cy, 0.3]}>
        <boxGeometry args={[w * 0.6, hh * 0.6, 0.4]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {FLAGS.mirrors && <primitive object={reflector} />}
      <primitive object={stand} />
    </group>
  );
}

/** A wall rail above the mirror with two straps the mirror hangs from. */
function MirrorRail({ w, top, material }: { w: number; top: number; material: THREE.Material }) {
  const geo = useGeo(() => {
    const railY = top + 6;
    const len = w + 8;
    const z = 1.6;
    const parts: THREE.BufferGeometry[] = [];
    const rod = new THREE.CylinderGeometry(0.3, 0.3, len, 20);
    rod.rotateZ(Math.PI / 2);
    rod.translate(0, railY, z);
    parts.push(rod);
    for (const sx of [-1, 1]) {
      // end brackets back to the wall + finials
      const post = new THREE.CylinderGeometry(0.22, 0.22, z, 12);
      post.rotateX(Math.PI / 2);
      post.translate(sx * (len / 2 - 0.8), railY, z / 2);
      const rose = new THREE.CylinderGeometry(0.75, 0.75, 0.25, 24);
      rose.rotateX(Math.PI / 2);
      rose.translate(sx * (len / 2 - 0.8), railY, 0.12);
      const fin = new THREE.SphereGeometry(0.45, 16, 12);
      fin.translate(sx * (len / 2 + 0.2), railY, z);
      // hanging strap: hook over the rail down to the frame
      const hx = sx * w * 0.3;
      const strap = tube(
        [
          [hx, railY + 0.35, z - 0.3],
          [hx, railY + 0.45, z + 0.1],
          [hx, railY, z + 0.45],
          [hx, railY - 2, z - 0.3],
          [hx, top - 0.2, 0.9],
        ],
        0.1,
        24,
      );
      parts.push(post, rose, fin, strap);
    }
    return merge(parts);
  }, [w, top]);
  return <mesh geometry={geo} material={material} castShadow />;
}

function draped(width: number, front: number, back: number, R: number, th: number, gather = 0) {
  // U-profile around a bar at the origin, extruded along x.
  const s = new THREE.Shape();
  const o = R + th;
  s.moveTo(o, -front);
  s.lineTo(o, 0);
  s.absarc(0, 0, o, 0, Math.PI, false);
  s.lineTo(-o, -back);
  s.lineTo(-R, -back);
  s.lineTo(-R, 0);
  s.absarc(0, 0, R, Math.PI, 0, true);
  s.lineTo(R, -front);
  s.lineTo(o, -front);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.25, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  // Soft folds so it doesn't look like a board
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.max(0, -y) / Math.max(front, back);
    // Gathered at the hook, relaxing into soft vertical folds as it falls
    const spread = gather > 0 ? THREE.MathUtils.lerp(1 - gather, 1, Math.pow(k, 0.6)) : 1 + k * 0.02;
    const fold = Math.sin((x / width) * Math.PI * 5) * (0.2 + 0.35 * k) * (gather > 0 ? 1 : 0.5);
    pos.setX(i, x * spread);
    pos.setZ(i, z + fold * Math.sign(z || 1) + Math.sin(x * 0.9) * 0.12 * k);
    // Hem sags a touch at the corners
    if (y < -Math.max(front, back) * 0.9) pos.setY(i, y - Math.pow(Math.abs(x) / (width / 2), 2) * 0.6);
  }
  g.computeVertexNormals();
  // Planar UVs in inches for the terry texture
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i);
    uv[i * 2 + 1] = pos.getY(i) + pos.getZ(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function TowelBar({ item, design }: ItemProps) {
  const { w, d, h } = item;
  const metal = metalMaterial(design.finishes.metal);
  const hasTowel = P(item, 'towel', true);
  const towelMat = fabricMaterial(P(item, 'towelColor', '#e9e2d6'));
  const barY = h / 2;
  const barZ = d - 0.5;
  const hw = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.9);
      const ros = new THREE.CylinderGeometry(0.9, 0.9, 0.35, 32);
      ros.rotateX(Math.PI / 2);
      ros.translate(x, barY, 0.18);
      const post = new THREE.CylinderGeometry(0.28, 0.32, barZ, 20);
      post.rotateX(Math.PI / 2);
      post.translate(x, barY, barZ / 2);
      parts.push(ros, post);
    }
    const bar = new THREE.CylinderGeometry(0.33, 0.33, w - 1.2, 24);
    bar.rotateZ(Math.PI / 2);
    bar.translate(0, barY, barZ);
    parts.push(bar);
    return merge(parts);
  }, [w, d, h]);
  const towel = useGeo(() => {
    const tw = Math.min(w - 5, 15);
    const g = draped(tw, 15, 13, 0.36, 0.55);
    g.translate(0, barY, barZ);
    return g;
  }, [w, d, h]);
  return (
    <group>
      <mesh geometry={hw} material={metal} castShadow />
      {hasTowel && <mesh geometry={towel} material={towelMat} castShadow receiveShadow />}
    </group>
  );
}

export function RobeHook({ item, design }: ItemProps) {
  const metal = metalMaterial(design.finishes.metal);
  const hasTowel = P(item, 'towel', true);
  const towelMat = fabricMaterial(P(item, 'towelColor', '#d9cbb7'));
  const geo = useGeo(() => {
    const ros = new THREE.CylinderGeometry(0.75, 0.75, 0.3, 28);
    ros.rotateX(Math.PI / 2);
    ros.translate(0, 0.75, 0.15);
    const post = new THREE.CylinderGeometry(0.25, 0.3, 2, 20);
    post.rotateX(Math.PI / 2);
    post.translate(0, 0.75, 1.2);
    const cap = new THREE.SphereGeometry(0.42, 24, 16);
    cap.scale(1, 1, 0.7);
    cap.translate(0, 0.75, 2.25);
    return merge([ros, post, cap]);
  }, []);
  const towel = useGeo(() => {
    const g = draped(12, 18, 15, 0.28, 0.35, 0.72);
    g.rotateX(-0.05);
    g.translate(0, 0.75, 1.6);
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={metal} castShadow />
      {hasTowel && <mesh geometry={towel} material={towelMat} castShadow receiveShadow />}
    </group>
  );
}

export function TPHolder({ item, design }: ItemProps) {
  const metal = metalMaterial(design.finishes.metal);
  const style = P(item, 'style', 'square');
  const geo = useGeo(() => {
    if (style === 'square') {
      // Moen 90 Degree style: two square rosettes, square arms, and a square pivot bar across the front
      const span = 6.9; // rosette centers
      const reach = 3.4; // wall to bar center
      const b = 0.3; // half the bar section
      const y = 1.1;
      const parts: THREE.BufferGeometry[] = [];
      for (const sx of [-1, 1]) {
        const x = (sx * span) / 2;
        const ros = roundedBox(2.15, 2.15, 0.45, 0.08);
        ros.translate(x, y, 0.225);
        parts.push(ros, box(x - b, x + b, y - b, y + b, 0.45, reach - b));
      }
      // Front bar from the left arm through a butt joint with the right arm's end cap
      parts.push(box(-span / 2 - b, span / 2 - b - 0.04, y - b, y + b, reach - b, reach + b));
      parts.push(box(span / 2 - b, span / 2 + b, y - b, y + b, reach - b, reach + b));
      return merge(parts);
    }
    const ros = new THREE.CylinderGeometry(0.85, 0.85, 0.35, 28);
    ros.rotateX(Math.PI / 2);
    ros.translate(-2.4, 1, 0.18);
    const arm = tube(
      [
        [-2.4, 1, 0.2],
        [-2.4, 1, 2.2],
        [-1.6, 1, 3],
        [2.8, 1, 3],
      ],
      0.26,
      32,
    );
    return merge([ros, arm]);
  }, [style]);
  const roll = style === 'square' ? { x: 0, y: 1.1, z: 3.4 } : { x: 0.4, y: 1, z: 3 };
  return (
    <group>
      <mesh geometry={geo} material={metal} castShadow />
      <mesh position={[roll.x, roll.y, roll.z]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[2.25, 2.25, 4.1, 40]} />
        <meshStandardMaterial color="#f7f6f2" roughness={0.95} />
      </mesh>
    </group>
  );
}

/** L-shaped flat hand towel bar: one wall block, an arm out, then an open-ended bar parallel to the wall. */
export function TowelRing({ item, design }: ItemProps) {
  const { w, d } = item;
  const metal = metalMaterial(design.finishes.metal);
  const hasTowel = P(item, 'towel', true);
  const towelMat = fabricMaterial(P(item, 'towelColor', '#e6dccb'));
  const side = P(item, 'side', 'left') === 'right' ? -1 : 1;
  const bw = 0.95; // flat bar: wide on top…
  const bt = 0.32; // …and thin
  const y = 1;
  const barZ = d - bw / 2;
  const hw = useGeo(() => {
    // Built for a left-hand mount; a right-hand mount swaps x spans (no mirroring, so windings stay valid).
    const span = (x0: number, x1: number): [number, number] => (side > 0 ? [x0, x1] : [-x1, -x0]);
    const x0 = -w / 2;
    return merge([
      // Wall block
      box(...span(x0, x0 + 1.4), y - 0.65, y + 0.65, 0, 0.6),
      // Arm out from the wall
      box(...span(x0 + 0.2, x0 + 0.2 + bw), y - bt / 2, y + bt / 2, 0.6, d),
      // Bar parallel to the wall, open at the far end
      box(...span(x0 + 0.2, w / 2), y - bt / 2, y + bt / 2, d - bw, d),
    ]);
  }, [w, d, side]);
  const towel = useGeo(() => {
    const tw = Math.min(w - 3, 10);
    const g = draped(tw, 13, 11, bw / 2, 0.4);
    g.translate(side * (w / 2 - 0.8 - tw / 2), y, barZ);
    return g;
  }, [w, d, side]);
  return (
    <group>
      <mesh geometry={hw} material={metal} castShadow />
      {hasTowel && <mesh geometry={towel} material={towelMat} castShadow receiveShadow />}
    </group>
  );
}

const stripeCache = new Map<string, THREE.CanvasTexture>();
function stripeTexture(base: string, stripe: string) {
  const key = base + stripe;
  let t = stripeCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = stripe;
  for (const [y, hgt] of [
    [14, 10],
    [30, 3],
    [210, 3],
    [222, 10],
  ])
    ctx.fillRect(0, y, 256, hgt);
  const img = ctx.getImageData(0, 0, 256, 256);
  const r = mulberry32(3);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  stripeCache.set(key, t);
  return t;
}

export function Rug({ item }: ItemProps) {
  const { w, d, h } = item;
  const weave = P(item, 'weave', 'loop');
  const color = P(item, 'color', '#d8cdbd');
  const stripe = P(item, 'stripe', '#b9a78f');
  const geo = useGeo(() => {
    const g = roundedBox(w, h, d, Math.min(h / 2, 0.2), 2);
    g.translate(0, h / 2, d / 2);
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = weave === 'flat' ? (pos.getX(i) + w / 2) / w : pos.getX(i);
      uv[i * 2 + 1] = weave === 'flat' ? (pos.getZ(i)) / d : pos.getZ(i);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }, [w, d, h, weave]);
  const mat = useMemo(() => {
    if (weave === 'flat') {
      return new THREE.MeshPhysicalMaterial({ map: stripeTexture(color, stripe), roughness: 1, sheen: 0.6, sheenRoughness: 0.9, sheenColor: new THREE.Color('#ffffff') });
    }
    return fabricMaterial(color);
  }, [weave, color, stripe]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
}

export function VanityDecor({ item, design }: ItemProps) {
  const metal = metalMaterial(design.finishes.metal);
  const tray = useGeo(() => roundedBox(10, 0.5, 5, 0.2, 2), []);
  const bottle = useGeo(
    () =>
      lathe([
        [0, 0],
        [1.35, 0],
        [1.45, 0.2],
        [1.45, 4.2],
        [1.1, 4.9],
        [0.55, 5.1],
        [0.55, 5.4],
        [0, 5.4],
      ]),
    [],
  );
  const vase = useGeo(
    () =>
      lathe([
        [0, 0],
        [1, 0],
        [1.5, 1.2],
        [1.2, 3],
        [0.45, 4.2],
        [0.5, 4.8],
        [0, 4.8],
      ]),
    [],
  );
  const sprig = useGeo(
    () =>
      merge([
        tube(
          [
            [0, 4.5, 0],
            [0.4, 8, 0.2],
            [1.6, 11.5, 0.4],
          ],
          0.05,
          12,
        ),
        tube(
          [
            [0, 4.5, 0],
            [-0.5, 7.5, -0.2],
            [-1.8, 10, -0.3],
          ],
          0.05,
          12,
        ),
      ]),
    [],
  );
  return (
    <group position={[0, 0, item.d / 2]}>
      <mesh geometry={tray} position={[0, 0.25, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#e9e4dc" roughness={0.3} clearcoat={0.4} />
      </mesh>
      <mesh geometry={bottle} position={[-2.8, 0.5, 0]} castShadow>
        <meshPhysicalMaterial color="#7a4a1f" roughness={0.05} transmission={0.85} thickness={0.02} ior={1.5} attenuationColor="#6a3a10" attenuationDistance={0.05} />
      </mesh>
      <mesh position={[-2.8, 6.3, 0]} material={metal} castShadow>
        <cylinderGeometry args={[0.35, 0.45, 1.6, 16]} />
      </mesh>
      <mesh position={[-2.2, 6.95, 0]} rotation-z={Math.PI / 2} material={metal} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 1.4, 12]} />
      </mesh>
      <mesh geometry={vase} position={[1.2, 0.5, -0.5]} castShadow>
        <meshPhysicalMaterial color="#e6ddd0" roughness={0.6} />
      </mesh>
      <mesh geometry={sprig} position={[1.2, 0.5, -0.5]} material={matte('#6d7152', 0.8)} castShadow />
      <mesh position={[3.6, 1.9, 1]} castShadow>
        <cylinderGeometry args={[1.2, 1.2, 2.8, 32]} />
        <meshPhysicalMaterial color="#f4efe6" roughness={0.5} sheen={0.3} />
      </mesh>
    </group>
  );
}
