import * as THREE from 'three';
import type { MetalFinish, TileSpec } from '../lib/types';
import type { TileMaps } from './tileTexture';
import type { TextureJob } from './textureWorker';

/* ───────────────────────── texture worker pool ───────────────────────── */

const pool: Worker[] = [];
const pending = new Map<number, (m: TileMaps) => void>();
let jobId = 0;
let rr = 0;
export const textureActivity = { pending: 0, listeners: new Set<(n: number) => void>() };
const bump = (d: number) => {
  textureActivity.pending += d;
  textureActivity.listeners.forEach((l) => l(textureActivity.pending));
};

function worker() {
  if (!pool.length) {
    const n = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; maps: TileMaps }>) => {
        const cb = pending.get(e.data.id);
        pending.delete(e.data.id);
        bump(-1);
        cb?.(e.data.maps);
      };
      pool.push(w);
    }
  }
  return pool[rr++ % pool.length];
}

function run(job: TextureJob): Promise<TileMaps> {
  return new Promise((resolve) => {
    const id = ++jobId;
    pending.set(id, resolve);
    bump(1);
    worker().postMessage({ id, job });
  });
}

function toTexture(data: Uint8ClampedArray, w: number, h: number, srgb: boolean) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function applyMaps(m: THREE.MeshStandardMaterial, maps: TileMaps, opts: { color?: boolean; normalScale?: number } = {}) {
  const repeat = new THREE.Vector2(1 / maps.pw, 1 / maps.ph);
  const set = (t: THREE.Texture) => {
    t.repeat.copy(repeat);
    return t;
  };
  for (const key of ['map', 'normalMap', 'roughnessMap'] as const) m[key]?.dispose();
  if (opts.color !== false) {
    m.map = set(toTexture(maps.albedo, maps.width, maps.height, true));
    m.color.set('#ffffff');
  }
  m.normalMap = set(toTexture(maps.normal, maps.width, maps.height, false));
  m.normalScale.setScalar(opts.normalScale ?? 1);
  m.roughnessMap = set(toTexture(maps.rough, maps.width, maps.height, false));
  m.roughness = 1;
  m.needsUpdate = true;
}

/* ───────────────────────── tiles ───────────────────────── */

const tileCache = new Map<string, THREE.MeshPhysicalMaterial>();
const latestTile = new Map<string, { key: string; mat: THREE.MeshPhysicalMaterial }>();

async function loadImageData(src: string, max = 512): Promise<ImageData | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * s));
    c.height = Math.max(1, Math.round(img.height * s));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return null;
  }
}

const previewCache = new Map<string, Promise<string>>();
/** A small swatch image of a tile field (one pattern period, ≥ 16″). */
export function tilePreview(spec: TileSpec, size = 160): Promise<string> {
  const key = JSON.stringify(spec) + size;
  let p = previewCache.get(key);
  if (p) return p;
  p = (async () => {
    const image = spec.image ? await loadImageData(spec.image) : null;
    const maps = await run({ kind: 'tile', spec, image });
    const src = document.createElement('canvas');
    src.width = maps.width;
    src.height = maps.height;
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(maps.albedo), maps.width, maps.height), 0, 0);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    // Show ~18″ of the field, tiling the period if needed.
    const span = 18;
    const pxPerIn = size / span;
    const tw = maps.pw * pxPerIn;
    const th = maps.ph * pxPerIn;
    for (let y = 0; y < size; y += th) for (let x = 0; x < size; x += tw) ctx.drawImage(src, x, y, tw, th);
    return c.toDataURL('image/jpeg', 0.85);
  })();
  previewCache.set(key, p);
  return p;
}

export function tileMaterial(spec: TileSpec): THREE.MeshPhysicalMaterial {
  const key = JSON.stringify(spec);
  let m = tileCache.get(key);
  if (m) return m;
  m = new THREE.MeshPhysicalMaterial({
    color: spec.colors[0],
    roughness: spec.finish === 'gloss' ? 0.1 : spec.finish === 'satin' ? 0.3 : 0.6,
    name: `tile:${spec.name}`,
  });
  // Glossy glazes get a thin clear layer for that wet, deep look.
  if (spec.finish === 'gloss') {
    m.clearcoat = 0.6;
    m.clearcoatRoughness = 0.04;
  }
  const mat = m;
  tileCache.set(key, m);
  // Retire the previous version of this tile once meshes have switched over.
  const prev = latestTile.get(spec.id);
  if (prev && prev.key !== key) {
    const old = prev;
    window.setTimeout(() => {
      if (latestTile.get(spec.id)?.key === old.key) return;
      tileCache.delete(old.key);
      for (const k of ['map', 'normalMap', 'roughnessMap'] as const) old.mat[k]?.dispose();
      old.mat.dispose();
    }, 4000);
  }
  latestTile.set(spec.id, { key, mat: m });
  (async () => {
    const image = spec.image ? await loadImageData(spec.image) : null;
    const maps = await run({ kind: 'tile', spec, image });
    applyMaps(mat, maps);
  })();
  return m;
}

/* ───────────────────────── stone countertops ───────────────────────── */

const STONES: Record<string, Partial<TileSpec>> = {
  'white-quartz': { colors: ['#eeebe5'], surface: 'quartz', vein: '#b9b4ad', finish: 'gloss' },
  'white-acrylic': { colors: ['#f6f5f2'], surface: 'flat', finish: 'gloss' },
  calacatta: { colors: ['#f2efe9'], surface: 'marble', vein: '#8a8178', finish: 'satin' },
  carrara: { colors: ['#e6e5e2'], surface: 'marble', vein: '#a19f9b', finish: 'satin' },
  soapstone: { colors: ['#3f4442'], surface: 'marble', vein: '#7f8683', finish: 'matte' },
  travertine: { colors: ['#d7c6aa'], surface: 'travertine', finish: 'matte' },
  terrazzo: { colors: ['#e7e1d7'], surface: 'terrazzo', finish: 'satin' },
};

const stoneCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function stoneMaterial(key: string) {
  let m = stoneCache.get(key);
  if (m) return m;
  const s = STONES[key] ?? STONES['white-quartz'];
  const spec: TileSpec = {
    id: `stone-${key}`,
    name: key,
    width: 96,
    height: 48,
    thickness: 1,
    pattern: 'grid',
    colors: s.colors!,
    variation: 0,
    finish: s.finish ?? 'satin',
    surface: s.surface ?? 'quartz',
    edge: 'square',
    groutWidth: 0.001,
    groutColor: s.colors![0],
    vein: s.vein,
  };
  m = new THREE.MeshPhysicalMaterial({ color: spec.colors[0], roughness: 0.2, clearcoat: spec.finish === 'gloss' ? 0.5 : 0.15, clearcoatRoughness: 0.08 });
  stoneCache.set(key, m);
  const mat = m;
  run({ kind: 'tile', spec }).then((maps) => applyMaps(mat, maps, { normalScale: 0.3 }));
  return m;
}

/* ───────────────────────── wood ───────────────────────── */

const woodCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function woodMaterial(key: string, paint = '#6b7a6b') {
  const k = key === 'painted' ? `painted:${paint}` : key;
  let m = woodCache.get(k);
  if (m) return m;
  const base: Record<string, string> = {
    'white-oak': '#bf9f76',
    rosewood: '#653829',
    'rift-oak': '#c7aa82',
    walnut: '#5e412d',
    'ash-black': '#262422',
  };
  m = new THREE.MeshPhysicalMaterial({
    color: key === 'painted' ? paint : (base[key] ?? '#bf9f76'),
    roughness: 0.5,
    // A thin satin lacquer. (A white sheen lobe read fine in raster but turned grazing faces pink when path traced.)
    clearcoat: key === 'painted' ? 0 : 0.12,
    clearcoatRoughness: 0.45,
  });
  woodCache.set(k, m);
  const mat = m;
  run({ kind: 'wood', key, paint }).then((maps) => applyMaps(mat, maps, { normalScale: 0.6 }));
  return m;
}

/* ───────────────────────── paint ───────────────────────── */

let stipple: Promise<TileMaps> | null = null;
const paintCache = new Map<string, THREE.MeshStandardMaterial>();
const SHEEN_ROUGH = { flat: 0.95, eggshell: 0.78, satin: 0.6, semigloss: 0.38 } as const;

export function paintMaterial(hex: string, sheen: keyof typeof SHEEN_ROUGH = 'eggshell') {
  const key = `${hex}:${sheen}`;
  let m = paintCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: hex, roughness: SHEEN_ROUGH[sheen], name: `paint:${hex}` });
  paintCache.set(key, m);
  stipple ??= run({ kind: 'stipple' });
  const mat = m;
  stipple.then((maps) => {
    applyMaps(mat, maps, { color: false, normalScale: 0.35 });
    mat.roughnessMap = null;
    mat.roughness = SHEEN_ROUGH[sheen];
    mat.needsUpdate = true;
  });
  return m;
}

/* ───────────────────────── fabric ───────────────────────── */

let terry: Promise<TileMaps> | null = null;
const fabricCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function fabricMaterial(hex: string, textured = true) {
  const key = `${hex}:${textured}`;
  let m = fabricCache.get(key);
  if (m) return m;
  const c = new THREE.Color(hex);
  m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 1,
    sheen: 1,
    sheenRoughness: 0.8,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.35),
  });
  fabricCache.set(key, m);
  if (textured) {
    terry ??= run({ kind: 'terry' });
    const mat = m;
    terry.then((maps) => {
      applyMaps(mat, maps, { color: false, normalScale: 0.8 });
      mat.roughnessMap = null;
      mat.roughness = 1;
      mat.needsUpdate = true;
    });
  }
  return m;
}

/* ───────────────────────── solids ───────────────────────── */

const METALS: Record<MetalFinish, { color: string; roughness: number; metalness: number; clearcoat?: number }> = {
  chrome: { color: '#e4e6e9', roughness: 0.04, metalness: 1 },
  'polished-nickel': { color: '#dcd3c4', roughness: 0.07, metalness: 1 },
  'brushed-nickel': { color: '#c3beb5', roughness: 0.28, metalness: 1 },
  'brushed-brass': { color: '#cfa65d', roughness: 0.26, metalness: 1 },
  'matte-black': { color: '#1b1b1b', roughness: 0.55, metalness: 0.3, clearcoat: 0.1 },
  'oil-rubbed-bronze': { color: '#4a3526', roughness: 0.42, metalness: 0.8 },
};

export const METAL_LABELS: Record<MetalFinish, string> = {
  chrome: 'Chrome',
  'polished-nickel': 'Polished nickel',
  'brushed-nickel': 'Brushed nickel',
  'brushed-brass': 'Brushed brass',
  'matte-black': 'Matte black',
  'oil-rubbed-bronze': 'Oil-rubbed bronze',
};

export const METAL_SWATCH: Record<MetalFinish, string> = {
  chrome: 'linear-gradient(135deg,#f5f6f8,#9da3aa 55%,#e9ebee)',
  'polished-nickel': 'linear-gradient(135deg,#f1ebe0,#a79f91 55%,#e7dfd2)',
  'brushed-nickel': 'linear-gradient(135deg,#d7d3cc,#a9a49b 55%,#cdc8c0)',
  'brushed-brass': 'linear-gradient(135deg,#e6c983,#a98142 55%,#dcbc76)',
  'matte-black': 'linear-gradient(135deg,#3a3a3a,#141414 55%,#2a2a2a)',
  'oil-rubbed-bronze': 'linear-gradient(135deg,#6d5140,#2e2019 55%,#5a4233)',
};

const metalCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function metalMaterial(finish: MetalFinish) {
  let m = metalCache.get(finish);
  if (m) return m;
  const s = METALS[finish];
  m = new THREE.MeshPhysicalMaterial({
    color: s.color,
    roughness: s.roughness,
    metalness: s.metalness,
    clearcoat: s.clearcoat ?? 0,
  });
  metalCache.set(finish, m);
  return m;
}

const solidCache = new Map<string, THREE.Material>();
function solid<T extends THREE.Material>(key: string, make: () => T): T {
  let m = solidCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    solidCache.set(key, m);
  }
  return m;
}

export const porcelain = (hex = '#f6f5f2') =>
  solid(`porcelain:${hex}`, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 }));

export const glass = (tint: 'clear' | 'smoke' | 'fluted' | 'frosted' = 'clear') =>
  solid(
    `glass:${tint}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: tint === 'smoke' ? '#9a9c9b' : '#f4faf7',
        metalness: 0,
        roughness: tint === 'frosted' ? 0.55 : tint === 'fluted' ? 0.12 : 0,
        transmission: 1,
        thickness: 0.01,
        ior: 1.5,
        transparent: false,
        envMapIntensity: 1,
        attenuationColor: new THREE.Color(tint === 'smoke' ? '#6d706f' : '#dcefe8'),
        attenuationDistance: 0.5,
      }),
  );

export const matte = (hex: string, roughness = 0.85, metalness = 0) =>
  solid(`matte:${hex}:${roughness}:${metalness}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness }));

export const emissive = (hex: string, intensity: number) =>
  solid(`emissive:${hex}:${intensity}`, () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: hex, emissiveIntensity: intensity, toneMapped: true }));

export const opal = (on: boolean, kelvinHex: string) =>
  solid(
    `opal:${on}:${kelvinHex}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#f7f4ee',
        roughness: 0.35,
        transmission: 0,
        emissive: on ? kelvinHex : '#000000',
        emissiveIntensity: on ? 2.2 : 0,
        clearcoat: 0.6,
      }),
  );

export const mirrorPT = () =>
  solid('mirror-pt', () => new THREE.MeshPhysicalMaterial({ color: '#f0f2f1', metalness: 1, roughness: 0.0 }));

/** Planar-projects UVs in inches so procedural textures stay at true scale on any geometry. */
export function worldUV(geo: THREE.BufferGeometry, grain: 'vertical' | 'horizontal' = 'vertical', offset = 0) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) {
      u = z;
      v = x; // tops: grain runs along the width
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    if (grain === 'horizontal' && !(ay >= ax && ay >= az)) [u, v] = [v, u];
    uv[i * 2] = u + offset;
    uv[i * 2 + 1] = v + offset * 0.37;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function kelvinToHex(k: number) {
  // Tanner Helland's approximation
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `#${[r, g, b].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Lamp color as a camera would see it: white-balanced toward neutral so 2700–3000K reads warm,
 * not orange, and 5000K reads crisp rather than blue.
 */
export function lampColor(k: number) {
  const raw = new THREE.Color(kelvinToHex(k));
  const neutral = new THREE.Color(kelvinToHex(4300));
  const c = new THREE.Color(raw.r / neutral.r, raw.g / neutral.g, raw.b / neutral.b);
  const m = Math.max(c.r, c.g, c.b);
  c.multiplyScalar(1 / m);
  return `#${c.getHexString()}`;
}
