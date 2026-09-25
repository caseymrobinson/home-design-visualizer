import type { TileSpec } from '../lib/types';
import { fbm, hashString, hexToRgb, lerp, mulberry32, smoothstep, valueNoise } from './noise';

/**
 * Procedurally "manufactures" a tile field: every tile is rasterised with its own
 * color, glaze, edge profile and surface relief, then grout fills the joints.
 * Output is a seamless albedo / normal / roughness set covering one pattern period.
 */

type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rot90?: boolean }
  | { kind: 'hex'; cx: number; cy: number; f: number };

interface Layout {
  pw: number;
  ph: number;
  shapes: Shape[];
}

function layout(t: TileSpec): Layout {
  const g = t.groutWidth;
  const W = t.width;
  const H = t.height;
  const shapes: Shape[] = [];
  const reps = (cell: number, multiple = 1, target = 40) => {
    let n = Math.max(1, Math.round(target / cell));
    n = Math.min(n, 14);
    n = Math.ceil(n / multiple) * multiple;
    return n;
  };

  switch (t.pattern) {
    case 'hex': {
      const F = W + g; // flat-to-flat pitch, pointy-top hexes
      const rowH = (F * Math.sqrt(3)) / 2;
      const nx = reps(F, 1, 24);
      const ny = reps(rowH, 2, 24);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) shapes.push({ kind: 'hex', cx: i * F + (j % 2 ? F / 2 : 0) + F / 2, cy: j * rowH + rowH / 2, f: W });
      return { pw: nx * F, ph: ny * rowH, shapes };
    }
    case 'herringbone': {
      const long = Math.max(W, H);
      const short = Math.min(W, H);
      const n = Math.max(2, Math.round((long + g) / (short + g)));
      const T = short + g;
      const L = n * T;
      const P = 2 * L;
      // H at (0,0) L×T, V at (−L, −(L−T)) T×L; lattice a = (T, T), b = (2L, 0)
      for (let i = -2 * n - 2; i < 2 * n + 2; i++)
        for (let j = -2; j <= 2; j++) {
          const ox = i * T + j * 2 * L;
          const oy = i * T;
          shapes.push({ kind: 'rect', x: ox, y: oy, w: L - g, h: T - g });
          shapes.push({ kind: 'rect', x: ox - L, y: oy - (L - T), w: T - g, h: L - g, rot90: true });
        }
      return { pw: P, ph: P, shapes };
    }
    case 'basketweave': {
      const T = Math.min(W, H) + g;
      const B = 2 * T; // a 2-tile block
      const L = B - g;
      for (let by = 0; by < 4; by++)
        for (let bx = 0; bx < 4; bx++) {
          const horiz = (bx + by) % 2 === 0;
          for (let k = 0; k < 2; k++) {
            if (horiz) shapes.push({ kind: 'rect', x: bx * B, y: by * B + k * T, w: L, h: T - g });
            else shapes.push({ kind: 'rect', x: bx * B + k * T, y: by * B, w: T - g, h: L, rot90: true });
          }
        }
      return { pw: 4 * B, ph: 4 * B, shapes };
    }
    default: {
      const cw = W + g;
      const ch = H + g;
      const shift = t.pattern === 'running' ? 0.5 : t.pattern === 'third' ? 1 / 3 : 0;
      const nx = reps(cw);
      const ny = reps(ch, t.pattern === 'running' ? 2 : t.pattern === 'third' ? 3 : 1);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) shapes.push({ kind: 'rect', x: i * cw + ((j * shift) % 1) * cw, y: j * ch, w: W, h: H });
      return { pw: nx * cw, ph: ny * ch, shapes };
    }
  }
}

function sdBox(px: number, py: number, hw: number, hh: number) {
  const dx = Math.abs(px) - hw;
  const dy = Math.abs(py) - hh;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
}

function sdHexPointy(px: number, py: number, apothem: number) {
  // iq's hexagon (flat top/bottom) with axes swapped → flat left/right
  let x = Math.abs(py);
  let y = Math.abs(px);
  const kx = -0.866025404,
    ky = 0.5,
    kz = 0.577350269;
  const d = 2 * Math.min(kx * x + ky * y, 0);
  x -= d * kx;
  y -= d * ky;
  const cx = Math.min(Math.max(x, -kz * apothem), kz * apothem);
  const lx = x - cx;
  const ly = y - apothem;
  return Math.hypot(lx, ly) * Math.sign(ly);
}

const FINISH_ROUGH = { gloss: 0.05, satin: 0.22, matte: 0.55 } as const;

export interface TileMaps {
  width: number;
  height: number;
  pw: number;
  ph: number;
  albedo: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  rough: Uint8ClampedArray;
}

export function generateTileMaps(t: TileSpec, faceImage?: ImageData | null): TileMaps {
  const L = layout(t);
  const maxPx = 1600;
  const ppi = Math.min(36, maxPx / Math.max(L.pw, L.ph));
  const W = Math.max(8, Math.round(L.pw * ppi));
  const H = Math.max(8, Math.round(L.ph * ppi));
  const sx = W / L.pw;
  const sy = H / L.ph;
  const N = W * H;

  const seed = hashString(t.id + t.colors.join() + t.surface);
  const height = new Float32Array(N); // inches, grout = 0
  const rgb = new Float32Array(N * 3);
  const rough = new Float32Array(N);

  // Grout
  const [gr, gg, gb] = hexToRgb(t.groutColor);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const n = fbm((x / sx) * 3, (y / sy) * 3, 3, seed + 5, L.pw * 3, L.ph * 3);
      const k = 0.9 + 0.14 * n;
      rgb[i * 3] = gr * k;
      rgb[i * 3 + 1] = gg * k;
      rgb[i * 3 + 2] = gb * k;
      rough[i] = 0.92;
    }

  const relief = t.edge === 'pillowed' ? 0.09 : 0.07;
  const baseRough = t.surface === 'concrete' ? 0.62 : FINISH_ROUGH[t.finish];
  const colors = t.colors.map(hexToRgb);
  const [vr, vg, vb] = hexToRgb(t.vein ?? '#8a8580');

  const shade = (
    i: number,
    din: number,
    lx: number,
    ly: number,
    tw: number,
    th: number,
    base: [number, number, number],
    tone: number,
    ts: number,
    rot90: boolean,
  ) => {
    // Edge profile
    let prof: number;
    if (t.edge === 'square') prof = smoothstep(0, 0.02, din);
    else if (t.edge === 'eased') prof = smoothstep(0, 0.07, din);
    else {
      const k = Math.min(din / 0.32, 1);
      prof = Math.sqrt(1 - (1 - k) * (1 - k));
    }
    let h = relief * prof;
    let r = base[0] * tone;
    let g = base[1] * tone;
    let b = base[2] * tone;
    let ro = baseRough;
    // Tile-local coordinates, rotated so vein / grain direction follows the tile
    const u = rot90 ? ly : lx;
    const v = rot90 ? lx : ly;
    const tu = u + ts * 37.1;
    const tv = v + ts * 11.3;

    if (faceImage) {
      const fx = Math.min(faceImage.width - 1, Math.max(0, Math.floor((u / (rot90 ? th : tw)) * faceImage.width)));
      const fy = Math.min(faceImage.height - 1, Math.max(0, Math.floor((v / (rot90 ? tw : th)) * faceImage.height)));
      const fi = (fy * faceImage.width + fx) * 4;
      r = faceImage.data[fi] * lerp(1, tone, 0.5);
      g = faceImage.data[fi + 1] * lerp(1, tone, 0.5);
      b = faceImage.data[fi + 2] * lerp(1, tone, 0.5);
    } else {
      switch (t.surface) {
        case 'flat': {
          const n = fbm(tu * 0.7, tv * 0.7, 3, seed);
          const k = 0.97 + 0.06 * n;
          r *= k;
          g *= k;
          b *= k;
          break;
        }
        case 'concrete': {
          const n = fbm(tu * 0.22, tv * 0.22, 5, seed);
          const fine = valueNoise(tu * 9, tv * 9, seed + 3);
          let k = 0.9 + 0.18 * n + (fine - 0.5) * 0.04;
          if (fine > 0.985) k *= 0.82; // fossil pits
          r *= k;
          g *= k;
          b *= k;
          ro += (n - 0.5) * 0.12;
          h += (fine - 0.5) * 0.004;
          break;
        }
        case 'handmade': {
          const n = fbm(tu * 0.5, tv * 0.5, 4, seed);
          const edge = smoothstep(0, 0.4, din);
          const k = (0.93 + 0.12 * n) * lerp(0.86, 1, edge);
          r *= k;
          g *= k;
          b *= k;
          h += (n - 0.5) * 0.035;
          ro += (n - 0.5) * 0.04;
          break;
        }
        case 'zellige': {
          const n = fbm(tu * 0.55, tv * 0.55, 5, seed);
          const cloud = fbm(tu * 1.6 + 7, tv * 1.6, 3, seed + 1);
          const edge = smoothstep(0, 0.4, din);
          // Glaze pools thicker (and slightly deeper in tone) toward the rim
          const k = (0.92 + 0.14 * n + (cloud - 0.5) * 0.06) * lerp(0.9, 1, edge);
          r *= k;
          g *= k;
          b *= k;
          h += (n - 0.5) * 0.14 + (cloud - 0.5) * 0.03;
          ro = 0.03 + (1 - n) * 0.05;
          break;
        }
        case 'marble': {
          const warp = fbm(tu * 0.09, tv * 0.09, 5, seed) * 9;
          const dir = u * 0.72 + v * 0.69;
          const vein1 = Math.pow(1 - Math.abs(Math.sin(dir * 0.22 + warp)), 18);
          const warp2 = fbm(tu * 0.25 + 3, tv * 0.25, 4, seed + 2) * 6;
          const vein2 = Math.pow(1 - Math.abs(Math.sin((u * 0.3 - v * 0.9) * 0.35 + warp2)), 30) * 0.5;
          const cloud = fbm(tu * 0.15, tv * 0.15, 4, seed + 4);
          const vein = Math.min(1, vein1 * 0.85 + vein2);
          const k = 0.96 + 0.06 * cloud;
          r = lerp(r * k, vr, vein * 0.75);
          g = lerp(g * k, vg, vein * 0.75);
          b = lerp(b * k, vb, vein * 0.75);
          ro += vein * 0.05;
          break;
        }
        case 'quartz': {
          const fleck = valueNoise(tu * 14, tv * 14, seed + 6);
          const cloud = fbm(tu * 0.12, tv * 0.12, 4, seed);
          const warp = fbm(tu * 0.05, tv * 0.05, 4, seed + 1) * 7;
          const vein = Math.pow(1 - Math.abs(Math.sin((u * 0.8 + v * 0.6) * 0.08 + warp)), 40) * 0.35;
          let k = 0.975 + 0.04 * cloud;
          if (fleck > 0.93) k *= 0.9;
          else if (fleck < 0.05) k *= 1.03;
          r = lerp(r * k, vr, vein);
          g = lerp(g * k, vg, vein);
          b = lerp(b * k, vb, vein);
          break;
        }
        case 'travertine': {
          const band = fbm(tu * 0.03, tv * 0.6, 5, seed);
          const pit = valueNoise(tu * 1.2, tv * 5, seed + 4);
          let k = 0.86 + 0.24 * band;
          if (pit > 0.88) {
            k *= 0.8;
            h -= 0.02;
          }
          r *= k;
          g *= k * 0.99;
          b *= k * 0.97;
          ro += (band - 0.5) * 0.1;
          break;
        }
        case 'terrazzo': {
          const chips = [
            { cell: 0.45, p: 0.55, cols: [[98, 96, 92], [188, 176, 158], [140, 128, 112], [214, 206, 194]] },
            { cell: 1.4, p: 0.4, cols: [[176, 150, 120], [120, 124, 118], [226, 220, 210], [80, 78, 74]] },
          ];
          for (const c of chips) {
            const gx = Math.floor(tu / c.cell);
            const gy = Math.floor(tv / c.cell);
            for (let oy = -1; oy <= 1; oy++)
              for (let ox = -1; ox <= 1; ox++) {
                const cx = gx + ox;
                const cy = gy + oy;
                const rnd = mulberry32(((cx * 73856093) ^ (cy * 19349663) ^ seed) >>> 0);
                if (rnd() > c.p) continue;
                const px = (cx + rnd()) * c.cell;
                const py = (cy + rnd()) * c.cell;
                const rad = c.cell * (0.2 + rnd() * 0.35);
                const wob = 1 + (valueNoise(tu * 4, tv * 4, seed + 8) - 0.5) * 0.5;
                if (Math.hypot(tu - px, (tv - py) * (0.7 + rnd() * 0.6)) < rad * wob) {
                  const col = c.cols[Math.floor(rnd() * c.cols.length)];
                  r = col[0];
                  g = col[1];
                  b = col[2];
                }
              }
          }
          break;
        }
      }
    }

    height[i] = h;
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    rough[i] = Math.min(1, Math.max(0.02, ro));
  };

  const offsets = [-1, 0, 1];
  const mod = (a: number, m: number) => ((a % m) + m) % m;
  for (const s of L.shapes) {
    // Seed each tile from its position modulo the period so wrapped copies match.
    const ax = s.kind === 'rect' ? s.x : s.cx;
    const ay = s.kind === 'rect' ? s.y : s.cy;
    const rnd = mulberry32(seed ^ hashString(`${Math.round(mod(ax, L.pw) * 64)}:${Math.round(mod(ay, L.ph) * 64)}:${s.kind === 'rect' && s.rot90 ? 1 : 0}`));
    const base = colors[Math.floor(rnd() * colors.length)] ?? [230, 230, 230];
    const tone = 1 + (rnd() - 0.5) * t.variation * 0.22;
    const ts = rnd() * 100;
    const bb =
      s.kind === 'rect'
        ? { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h }
        : { x0: s.cx - s.f, y0: s.cy - s.f, x1: s.cx + s.f, y1: s.cy + s.f };
    for (const oy of offsets)
      for (const ox of offsets) {
        const dx = ox * L.pw;
        const dy = oy * L.ph;
        const px0 = Math.max(0, Math.floor((bb.x0 + dx) * sx));
        const px1 = Math.min(W - 1, Math.ceil((bb.x1 + dx) * sx));
        const py0 = Math.max(0, Math.floor((bb.y0 + dy) * sy));
        const py1 = Math.min(H - 1, Math.ceil((bb.y1 + dy) * sy));
        if (px0 > px1 || py0 > py1) continue;
        for (let py = py0; py <= py1; py++)
          for (let px = px0; px <= px1; px++) {
            const x = (px + 0.5) / sx - dx;
            const y = (py + 0.5) / sy - dy;
            let din: number, lx: number, ly: number, tw: number, th: number;
            if (s.kind === 'rect') {
              din = -sdBox(x - (s.x + s.w / 2), y - (s.y + s.h / 2), s.w / 2, s.h / 2);
              lx = x - s.x;
              ly = y - s.y;
              tw = s.w;
              th = s.h;
            } else {
              din = -sdHexPointy(x - s.cx, y - s.cy, s.f / 2);
              lx = x - (s.cx - s.f / 2);
              ly = y - (s.cy - s.f / 2);
              tw = s.f;
              th = s.f;
            }
            if (din <= 0) continue;
            shade(py * W + px, din, lx, ly, tw, th, base, tone, ts, s.kind === 'rect' && !!s.rot90);
          }
      }
  }

  // Encode
  const albedo = new Uint8ClampedArray(N * 4);
  const normal = new Uint8ClampedArray(N * 4);
  const roughOut = new Uint8ClampedArray(N * 4);
  const dx = 2 / sx;
  const dy = 2 / sy;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const xl = y * W + ((x - 1 + W) % W);
      const xr = y * W + ((x + 1) % W);
      const yu = ((y - 1 + H) % H) * W + x;
      const yd = ((y + 1) % H) * W + x;
      const hx = (height[xr] - height[xl]) / dx;
      const hy = (height[yd] - height[yu]) / dy;
      const nx = -hx;
      const ny = hy; // canvas y runs opposite to texture v
      const inv = 1 / Math.hypot(nx, ny, 1);
      normal[i * 4] = (nx * inv * 0.5 + 0.5) * 255;
      normal[i * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[i * 4 + 2] = (inv * 0.5 + 0.5) * 255;
      normal[i * 4 + 3] = 255;
      // Joints read slightly darker (cavity occlusion)
      const cav = height[i] < relief * 0.3 ? 0.9 : 1;
      albedo[i * 4] = rgb[i * 3] * cav;
      albedo[i * 4 + 1] = rgb[i * 3 + 1] * cav;
      albedo[i * 4 + 2] = rgb[i * 3 + 2] * cav;
      albedo[i * 4 + 3] = 255;
      const ro = rough[i] * 255;
      roughOut[i * 4] = 255;
      roughOut[i * 4 + 1] = ro;
      roughOut[i * 4 + 2] = 0;
      roughOut[i * 4 + 3] = 255;
    }

  return { width: W, height: H, pw: L.pw, ph: L.ph, albedo, normal, rough: roughOut };
}
