import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { matte, metalMaterial, woodMaterial } from '../../materials/library';
import { mulberry32 } from '../../materials/noise';
import { box, merge } from '../geom';
import { P, type ItemProps } from './common';

export const ART_PALETTES: Record<string, { bg: string; ink: string; c: string[] }> = {
  warm: { bg: '#efe6d8', ink: '#3b2f27', c: ['#c0714f', '#d9a47e', '#e8c9a8', '#8c5a3c', '#b98b62'] },
  sage: { bg: '#eef0e8', ink: '#2f3a2c', c: ['#8fa487', '#b7c4a8', '#5f7458', '#d7dccb', '#a9b59a'] },
  earth: { bg: '#ece5d8', ink: '#2e2a25', c: ['#6d6a4b', '#b67658', '#c9a66b', '#3f3a33', '#d8c7a5'] },
  blush: { bg: '#f3e9e4', ink: '#4a3a34', c: ['#d9a79a', '#e8c4b8', '#a86f5f', '#c9b3a3', '#7d5a4f'] },
  mono: { bg: '#f1eee8', ink: '#24221f', c: ['#2d2b28', '#77726a', '#b8b2a7', '#d9d4ca', '#4a4640'] },
};

type Ctx = CanvasRenderingContext2D;
type Painter = (g: Ctx, W: number, H: number, pal: (typeof ART_PALETTES)[string], rnd: () => number) => void;


/** Soft organic blob through `n` jittered points on a circle. */
function blob(g: Ctx, cx: number, cy: number, r: number, rnd: () => number, n = 7, j = 0.35) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - j / 2 + rnd() * j);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x0, y0] = pts[i % n];
    const [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(x0, y0, mx, my);
  }
  g.closePath();
}

const PAINTERS: Record<string, Painter> = {
  /** Nested rainbow arches, mid-century boho. */
  arches: (g, W, H, pal, rnd) => {
    const u = Math.min(W, H);
    const groups = W > H * 1.3 ? 2 : 1;
    for (let k = 0; k < groups; k++) {
      const cx = groups === 1 ? W / 2 : W * (0.3 + k * 0.4);
      const base = H * 0.5 + u * 0.2 + (rnd() - 0.5) * H * 0.04;
      const bands = 4 + Math.floor(rnd() * 2);
      const outer = u * (groups === 1 ? 0.36 : 0.28);
      const bw = outer / (bands + 0.6);
      const cols = [...pal.c].sort(() => rnd() - 0.5);
      for (let b = 0; b < bands; b++) {
        const r = outer - b * bw;
        g.fillStyle = cols[b % cols.length];
        g.beginPath();
        g.moveTo(cx - r, base);
        g.arc(cx, base, r, Math.PI, 0);
        g.lineTo(cx + r - bw * 0.82, base);
        g.arc(cx, base, r - bw * 0.82, 0, Math.PI, true);
        g.closePath();
        g.fill();
      }
    }
  },
  /** Low sun over layered hills. */
  sun: (g, W, H, pal, rnd) => {
    const u = Math.min(W, H);
    g.fillStyle = pal.c[2];
    g.beginPath();
    g.arc(W * (0.35 + rnd() * 0.3), H * (0.34 + rnd() * 0.1), u * 0.14, 0, Math.PI * 2);
    g.fill();
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      g.fillStyle = [pal.c[4], pal.c[0], pal.c[3]][i];
      const top = H * (0.55 + i * 0.12);
      g.beginPath();
      g.moveTo(0, H);
      g.lineTo(0, top + (rnd() - 0.5) * H * 0.08);
      const bumps = 2 + Math.floor(rnd() * 2);
      for (let b = 1; b <= bumps; b++) {
        const x = (W * b) / bumps;
        g.quadraticCurveTo(x - W / bumps / 2, top - H * (0.06 + rnd() * 0.12), x, top + (rnd() - 0.5) * H * 0.06);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    }
  },
  /** Ink botanical sprig on paper. */
  botanical: (g, W, H, pal, rnd) => {
    const u = Math.min(W, H);
    g.strokeStyle = pal.ink;
    g.fillStyle = pal.c[0];
    g.lineCap = 'round';
    const stems = 1 + Math.floor(rnd() * 2);
    for (let s = 0; s < stems; s++) {
      const x0 = W * (0.5 + (s - (stems - 1) / 2) * 0.18);
      const y0 = H * 0.9;
      const x1 = x0 + (rnd() - 0.5) * W * 0.3;
      const y1 = H * (0.12 + rnd() * 0.1);
      const cx = x0 + (rnd() - 0.5) * W * 0.5;
      const cy = (y0 + y1) / 2;
      g.lineWidth = u * 0.006;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(cx, cy, x1, y1);
      g.stroke();
      const n = 9 + Math.floor(rnd() * 5);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
        const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
        const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
        const ang = Math.atan2(dy, dx);
        const len = u * (0.09 - t * 0.04) * (0.8 + rnd() * 0.4);
        for (const sgn of [-1, 1]) {
          if (rnd() < 0.15) continue;
          const a = ang + sgn * (0.7 + rnd() * 0.3);
          g.save();
          g.translate(x, y);
          g.rotate(a);
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(len * 0.5, -len * 0.28, len, 0);
          g.quadraticCurveTo(len * 0.5, len * 0.28, 0, 0);
          g.globalAlpha = 0.55;
          g.fill();
          g.globalAlpha = 1;
          g.lineWidth = u * 0.003;
          g.stroke();
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(len * 0.85, 0);
          g.lineWidth = u * 0.0015;
          g.stroke();
          g.restore();
        }
      }
    }
  },
  /** Soft abstract landscape in washes. */
  landscape: (g, W, H, pal, rnd) => {
    const bands = 5;
    const order = [pal.c[3], pal.c[1], pal.c[4], pal.c[0], pal.c[2]];
    for (let b = 0; b < bands; b++) {
      const top = H * (0.25 + b * 0.15 + (rnd() - 0.5) * 0.05);
      g.fillStyle = order[b % order.length];
      // Several translucent passes with drifting edges read as watercolor
      for (let pass = 0; pass < 6; pass++) {
        g.globalAlpha = 0.16;
        g.beginPath();
        g.moveTo(0, H);
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const x = (W * i) / steps;
          const y = top + Math.sin(i * 0.5 + b * 2 + pass * 0.3) * H * 0.02 + (rnd() - 0.5) * H * 0.012;
          g.lineTo(x, y);
        }
        g.lineTo(W, H);
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 1;
  },
  /** Matisse-like cut-paper shapes, spread over a loose grid. */
  shapes: (g, W, H, pal, rnd) => {
    const u = Math.min(W, H);
    const cols = W > H ? 3 : 2;
    const rows = H > W ? 3 : 2;
    const cells = Array.from({ length: cols * rows }, (_, i) => i).sort(() => rnd() - 0.5);
    const n = Math.min(cells.length, 4 + Math.floor(rnd() * 2));
    for (let i = 0; i < n; i++) {
      const cx = ((cells[i] % cols) + 0.5 + (rnd() - 0.5) * 0.5) * (W / cols);
      const cy = (Math.floor(cells[i] / cols) + 0.5 + (rnd() - 0.5) * 0.5) * (H / rows);
      g.fillStyle = pal.c[i % pal.c.length];
      if (i % 2 === 1) {
        // A smooth leaf with its midrib cut out of the paper
        const L = u * (0.3 + rnd() * 0.12);
        g.save();
        g.translate(cx, cy);
        g.rotate((rnd() - 0.5) * 1.6);
        g.beginPath();
        g.moveTo(0, -L / 2);
        g.quadraticCurveTo(L * 0.32, -L * 0.1, 0, L / 2);
        g.quadraticCurveTo(-L * 0.32, -L * 0.1, 0, -L / 2);
        g.fill();
        g.strokeStyle = pal.bg;
        g.lineWidth = u * 0.008;
        g.beginPath();
        g.moveTo(0, -L * 0.38);
        g.lineTo(0, L * 0.45);
        g.stroke();
        g.restore();
      } else {
        blob(g, cx, cy, u * (0.1 + rnd() * 0.07), rnd, 6, 0.3);
        g.fill();
      }
    }
  },
  /** Stacked soft color fields. */
  'color-field': (g, W, H, pal, rnd) => {
    const cols = [...pal.c].sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 2));
    const m = Math.min(W, H) * 0.09;
    const total = H - m * 2;
    let y = m;
    cols.forEach((c, i) => {
      const hh = (total - m * 0.5 * (cols.length - 1)) * (i === 0 ? 0.55 : 0.45 / (cols.length - 1));
      g.fillStyle = c;
      // Feathered edges: nested translucent rects
      for (let k = 0; k < 10; k++) {
        const inset = (k / 10) * m * 0.35;
        g.globalAlpha = 0.14;
        g.fillRect(m + inset, y + inset, W - m * 2 - inset * 2, hh - inset * 2);
      }
      g.globalAlpha = 1;
      y += hh + m * 0.5;
    });
  },
  /** Continuous fine line: arcs and a horizon. */
  lines: (g, W, H, pal, rnd) => {
    const u = Math.min(W, H);
    g.strokeStyle = pal.ink;
    g.lineWidth = u * 0.004;
    const cx = W / 2;
    const cy = H * 0.58;
    const rings = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < rings; i++) {
      const r = u * (0.08 + i * 0.035);
      g.beginPath();
      g.arc(cx + (rnd() - 0.5) * u * 0.02, cy, r, Math.PI, 0);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(W * 0.14, cy);
    g.lineTo(W * 0.86, cy);
    g.stroke();
    g.fillStyle = pal.c[0];
    g.beginPath();
    g.arc(cx + u * 0.2 * (rnd() < 0.5 ? -1 : 1), cy - u * 0.28, u * 0.035, 0, Math.PI * 2);
    g.fill();
  },
};

export const ART_STYLES = Object.keys(PAINTERS);

/** Paint a print at the given aspect (width / height); longest side 1024 px. */
export function paintArt(style: string, palette: string, seed: number, aspect: number, long = 1024) {
  const W = aspect >= 1 ? long : Math.round(long * aspect);
  const H = aspect >= 1 ? Math.round(long / aspect) : long;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const pal = ART_PALETTES[palette] ?? ART_PALETTES.warm;
  const rnd = mulberry32(seed * 7919 + style.length * 31);
  g.fillStyle = pal.bg;
  g.fillRect(0, 0, W, H);
  (PAINTERS[style] ?? PAINTERS.arches)(g, W, H, pal, rnd);
  // Paper tooth
  const img = g.getImageData(0, 0, W, H);
  const nr = mulberry32(seed + 5);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (nr() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const texCache = new Map<string, { tex: THREE.CanvasTexture; users: number }>();

function artTexture(style: string, palette: string, seed: number, aspect: number) {
  const key = `${style}|${palette}|${seed}|${aspect.toFixed(2)}`;
  const hit = texCache.get(key);
  if (hit) {
    hit.users++;
    return { key, tex: hit.tex };
  }
  const c = paintArt(style, palette, seed, aspect);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set(key, { tex, users: 1 });
  return { key, tex };
}

function releaseArt(key: string) {
  const hit = texCache.get(key);
  if (!hit || --hit.users > 0) return;
  hit.tex.dispose();
  texCache.delete(key);
}

const FRAME_W: Record<string, number> = { black: 0.75, oak: 1.1, white: 0.9, finish: 0.5, none: 0 };

/** Framed (or gallery-wrapped) print, generated to the size you set. */
export function WallArt({ item, design }: ItemProps) {
  const { w, h } = item;
  const style = P(item, 'art', 'arches');
  const palette = P(item, 'palette', 'warm');
  const seed = P(item, 'seed', 1);
  const frame = P(item, 'frame', 'black');
  const hasMat = P(item, 'mat', true) && frame !== 'none';
  const fw = FRAME_W[frame] ?? 0.75;
  const depth = frame === 'none' ? 1.5 : 1.1;
  const mat = hasMat ? Math.min(w, h) * 0.11 : 0;
  const pw = Math.max(1, w - 2 * fw - 2 * mat);
  const ph = Math.max(1, h - 2 * fw - 2 * mat);

  const art = useMemo(() => artTexture(style, palette, seed, pw / ph), [style, palette, seed, pw, ph]);
  useEffect(() => () => releaseArt(art.key), [art]);
  const printMat = useMemo(() => new THREE.MeshStandardMaterial({ map: art.tex, roughness: 0.9 }), [art]);
  useEffect(() => () => printMat.dispose(), [printMat]);

  const frameGeo = useMemo(() => {
    if (fw <= 0) return null;
    return merge([
      box(-w / 2, w / 2, 0, fw, 0, depth),
      box(-w / 2, w / 2, h - fw, h, 0, depth),
      box(-w / 2, -w / 2 + fw, fw, h - fw, 0, depth),
      box(w / 2 - fw, w / 2, fw, h - fw, 0, depth),
    ]);
  }, [w, h, fw, depth]);
  useEffect(() => () => frameGeo?.dispose(), [frameGeo]);

  const frameMat =
    frame === 'oak'
      ? woodMaterial('white-oak')
      : frame === 'white'
        ? matte('#f1efe9', 0.6)
        : frame === 'finish'
          ? metalMaterial(design.finishes.metal)
          : matte('#1d1c1a', 0.45);

  return (
    <group>
      {frameGeo && <mesh geometry={frameGeo} material={frameMat} castShadow receiveShadow />}
      {frame === 'none' ? (
        // Gallery wrap: the canvas itself has depth
        <>
          <mesh position={[0, h / 2, depth / 2]} castShadow receiveShadow>
            <boxGeometry args={[w, h, depth]} />
            <meshStandardMaterial color={ART_PALETTES[palette]?.bg ?? '#efe6d8'} roughness={0.95} />
          </mesh>
          <mesh position={[0, h / 2, depth + 0.01]} material={printMat}>
            <planeGeometry args={[w, h]} />
          </mesh>
        </>
      ) : (
        <>
          {/* Backing / mat, set just behind the frame face */}
          <mesh position={[0, h / 2, depth - 0.35]} receiveShadow>
            <boxGeometry args={[w - fw * 2 + 0.02, h - fw * 2 + 0.02, 0.1]} />
            <meshStandardMaterial color="#f5f2ec" roughness={0.95} />
          </mesh>
          <mesh position={[0, h / 2, depth - 0.24]} material={printMat} receiveShadow>
            <planeGeometry args={[pw, ph]} />
          </mesh>
        </>
      )}
    </group>
  );
}
