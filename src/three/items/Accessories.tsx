import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { fabricMaterial, matte, metalMaterial, mirrorPT, woodMaterial, worldUV } from '../../materials/library';
import { mulberry32 } from '../../materials/noise';
import { merge, roundedBox, roundedRectShape } from '../geom';
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
  const geo = useGeo(() => {
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
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={metal} castShadow />
      <mesh position={[0.4, 1, 3]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[2.25, 2.25, 4.1, 40]} />
        <meshStandardMaterial color="#f7f6f2" roughness={0.95} />
      </mesh>
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

export function Plant({ item }: ItemProps) {
  const { h } = item;
  const kind = P(item, 'kind', 'olive');
  const potColor = P(item, 'pot', '#cbbba5');
  const potH = kind === 'olive' ? Math.min(13, h * 0.32) : Math.min(9, h * 0.45);
  const potR = kind === 'olive' ? 5.8 : 4.6;
  const pot = useGeo(
    () =>
      lathe([
        [0, 0],
        [potR * 0.72, 0],
        [potR * 0.78, 0.3],
        [potR, potH - 0.6],
        [potR + 0.25, potH - 0.3],
        [potR + 0.25, potH],
        [potR - 0.4, potH],
        [potR - 0.5, potH - 1],
        [0, potH - 1],
      ]),
    [potH, potR],
  );
  const { leaves, stems } = useMemo(() => {
    const rnd = mulberry32(kind.length * 99 + Math.round(h));
    const leafParts: THREE.BufferGeometry[] = [];
    const stemParts: THREE.BufferGeometry[] = [];
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
    } else {
      const heart = leafShape(2.4, 2, true);
      for (let v = 0; v < 12; v++) {
        const a = (v / 12) * Math.PI * 2;
        const trail = v % 3 === 0 ? 10 + rnd() * 10 : 3 + rnd() * 3;
        const pts = [
          new THREE.Vector3(Math.cos(a) * 1, potH + 1.5, Math.sin(a) * 1),
          new THREE.Vector3(Math.cos(a) * (potR + 0.8), potH + 2.5, Math.sin(a) * (potR + 0.8)),
          new THREE.Vector3(Math.cos(a) * (potR + 1.4), potH - trail * 0.5, Math.sin(a) * (potR + 1.4)),
          new THREE.Vector3(Math.cos(a + 0.2) * (potR + 1.8), potH - trail, Math.sin(a + 0.2) * (potR + 1.8)),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        stemParts.push(new THREE.TubeGeometry(curve, 24, 0.08, 5));
        const n = Math.round(4 + trail / 2);
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const p = curve.getPoint(t);
          const g = heart.clone();
          g.scale(0.7 + rnd() * 0.5, 0.7 + rnd() * 0.5, 1);
          place(g, p, new THREE.Vector3(Math.cos(a) + (rnd() - 0.5), 0.6 + rnd(), Math.sin(a) + (rnd() - 0.5)), rnd() * 6);
        }
      }
    }
    return { leaves: merge(leafParts), stems: merge(stemParts) };
  }, [kind, h, potH, potR]);
  useEffect(
    () => () => {
      leaves.dispose();
      stems.dispose();
    },
    [leaves, stems],
  );
  const leafMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: kind === 'olive' ? '#6f7d5b' : kind === 'fern' ? '#5f7f45' : '#4f7a3a',
        roughness: kind === 'olive' ? 0.75 : 0.5,
        side: THREE.DoubleSide,
        sheen: kind === 'olive' ? 0.6 : 0,
        sheenColor: new THREE.Color('#c9d0bd'),
      }),
    [kind],
  );
  return (
    <group position={[0, 0, potR + 0.5]}>
      <mesh geometry={pot} castShadow receiveShadow>
        <meshPhysicalMaterial color={potColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, potH - 1.2, 0]} rotation-x={-Math.PI / 2} material={matte('#3d3129', 1)}>
        <circleGeometry args={[potR - 0.5, 32]} />
      </mesh>
      <mesh geometry={stems} material={matte(kind === 'olive' ? '#6b5c4a' : '#4f6b3a', 0.9)} castShadow />
      <mesh geometry={leaves} material={leafMat} castShadow receiveShadow />
    </group>
  );
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
