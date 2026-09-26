import type { TileMaps } from './tileTexture';
import { fbm, hashString, hexToRgb, lerp, smoothstep, valueNoise } from './noise';

/** Pack height/albedo/roughness float buffers into the RGBA triplet the materials use. */
function pack(
  W: number,
  H: number,
  pw: number,
  ph: number,
  rgb: Float32Array,
  height: Float32Array,
  rough: Float32Array,
  normalStrength = 1,
): TileMaps {
  const N = W * H;
  const albedo = new Uint8ClampedArray(N * 4);
  const normal = new Uint8ClampedArray(N * 4);
  const r = new Uint8ClampedArray(N * 4);
  const dx = (2 * pw) / W;
  const dy = (2 * ph) / H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const hx = (height[y * W + ((x + 1) % W)] - height[y * W + ((x - 1 + W) % W)]) / dx;
      const hy = (height[((y + 1) % H) * W + x] - height[((y - 1 + H) % H) * W + x]) / dy;
      const nx = -hx * normalStrength;
      const ny = hy * normalStrength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      normal[i * 4] = (nx * inv * 0.5 + 0.5) * 255;
      normal[i * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[i * 4 + 2] = (inv * 0.5 + 0.5) * 255;
      normal[i * 4 + 3] = 255;
      albedo[i * 4] = rgb[i * 3];
      albedo[i * 4 + 1] = rgb[i * 3 + 1];
      albedo[i * 4 + 2] = rgb[i * 3 + 2];
      albedo[i * 4 + 3] = 255;
      r[i * 4] = 255;
      r[i * 4 + 1] = rough[i] * 255;
      r[i * 4 + 2] = 0;
      r[i * 4 + 3] = 255;
    }
  return { width: W, height: H, pw, ph, albedo, normal, rough: r };
}

const WOOD: Record<string, { early: string; late: string; rings: number; straight: number; rough: number; pore: number; knots?: number }> = {
  'white-oak': { early: '#c8aa80', late: '#a4845d', rings: 34, straight: 0.55, rough: 0.5, pore: 0.75 },
  // Moreno Bath "Rosewood": warm red-brown laminate with a fine, fairly straight grain
  // Moreno Bath "Rosewood" is a rustic brown oak laminate: knotty, cathedral grain, dark streaks
  rosewood: { early: '#86613f', late: '#4c3322', rings: 26, straight: 0.45, rough: 0.55, pore: 0.62, knots: 7 },
  'rift-oak': { early: '#cdb18a', late: '#ac8d66', rings: 60, straight: 0.92, rough: 0.48, pore: 0.8 },
  walnut: { early: '#6f4d36', late: '#4b3222', rings: 30, straight: 0.5, rough: 0.42, pore: 0.6 },
  'ash-black': { early: '#2d2a27', late: '#1d1b19', rings: 28, straight: 0.6, rough: 0.5, pore: 0.9 },
};

/** A seamless 24″ × 48″ plank of wood. u runs across the grain, v along it. */
export function generateWood(key: string, paint?: string): TileMaps {
  const W = 768;
  const H = 1536;
  const pw = 24;
  const ph = 48;
  const painted = key === 'painted';
  const spec = WOOD[key] ?? WOOD['white-oak'];
  const seed = hashString(key);
  const e = hexToRgb(spec.early);
  const l = hexToRgb(spec.late);
  const pc = hexToRgb(paint ?? '#6b7a6b');
  const rgb = new Float32Array(W * H * 3);
  const height = new Float32Array(W * H);
  const rough = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = y * W + x;
      // Warp rings with periodic noise so the plank tiles.
      const warp = fbm(u * 4, v * 1, 4, seed, 4, 1);
      const drift = fbm(u * 2, v * 3, 3, seed + 11, 2, 3);
      const cathedral = (1 - spec.straight) * Math.pow(Math.abs(Math.sin(v * Math.PI * 2 + warp * 2)), 3) * 0.6;
      // Knots: rings bulge around each one, cores go dark (positions tile with the plank)
      let knot = 0;
      let bend = 0;
      for (let k = 0; k < (spec.knots ?? 0); k++) {
        const kx = ((Math.sin(k * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1;
        const ky = ((Math.sin(k * 78.233 + seed) * 12543.123) % 1 + 1) % 1;
        const size = 0.6 + ((Math.sin(k * 3.7 + seed) * 9173.1) % 1 + 1) % 1;
        let dx = u - kx;
        let dy = v - ky;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        const r = Math.hypot(dx, dy * 0.45) / size;
        bend += Math.exp(-(r * r) / 0.0045) * 1.6;
        knot = Math.max(knot, 1 - smoothstep(0.012, 0.026, r));
      }
      const g = u * spec.rings + (warp - 0.5) * 2.2 * (1 - spec.straight * 0.7) + (drift - 0.5) * 0.8 + cathedral * 2 + bend;
      const ring = g - Math.floor(g);
      const late = smoothstep(0.55, 0.92, ring) * (1 - smoothstep(0.95, 1, ring));
      const streak = valueNoise(u * 220, v * 6, seed + 3, 220, 6);
      const pore = streak > spec.pore ? (streak - spec.pore) / (1 - spec.pore) : 0;
      const tone = 0.94 + 0.12 * fbm(u * 4, v * 3, 3, seed + 7, 4, 3);
      if (painted) {
        const k = 0.985 + 0.03 * fbm(u * 8, v * 2, 3, seed, 8, 2);
        rgb[i * 3] = pc[0] * k;
        rgb[i * 3 + 1] = pc[1] * k;
        rgb[i * 3 + 2] = pc[2] * k;
        height[i] = late * 0.002 + pore * 0.002;
        rough[i] = 0.45;
      } else {
        let t = late * 0.85 + pore * 0.5;
        if (spec.knots) {
          t += knot * 0.9 + (fbm(u * 3, v * 8, 4, seed + 21, 3, 8) - 0.5) * 0.5; // dark cores + rustic tonal streaks
          t = Math.min(1.2, Math.max(0, t));
        }
        rgb[i * 3] = lerp(e[0], l[0], t) * tone;
        rgb[i * 3 + 1] = lerp(e[1], l[1], t) * tone;
        rgb[i * 3 + 2] = lerp(e[2], l[2], t) * tone;
        height[i] = -pore * 0.006 - late * 0.002;
        rough[i] = spec.rough + pore * 0.25;
      }
    }
  }
  return pack(W, H, pw, ph, rgb, height, rough);
}

/** Paint roller stipple — 12″ swatch, normal-only detail. */
export function generateStipple(): TileMaps {
  const W = 512;
  const H = 512;
  const rgb = new Float32Array(W * H * 3).fill(255);
  const height = new Float32Array(W * H);
  const rough = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const n = fbm((x / W) * 64, (y / H) * 64, 3, 11, 64, 64);
      const m = fbm((x / W) * 8, (y / H) * 8, 3, 12, 8, 8);
      height[i] = n * 0.004 + m * 0.002;
      rough[i] = 0.5 + (n - 0.5) * 0.2;
      const k = 247 + m * 8;
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = k;
    }
  return pack(W, H, 12, 12, rgb, height, rough);
}

/** Cotton terry / loop pile — 4″ swatch. */
export function generateTerry(): TileMaps {
  const W = 512;
  const H = 512;
  const rgb = new Float32Array(W * H * 3);
  const height = new Float32Array(W * H);
  const rough = new Float32Array(W * H).fill(1);
  const loops = 48;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const u = (x / W) * loops;
      const v = (y / H) * loops;
      const jitter = valueNoise(u * 0.5, v * 0.5, 4, loops / 2, loops / 2) * 0.6;
      const lx = u + jitter - Math.floor(u + jitter) - 0.5;
      const ly = v - Math.floor(v) - 0.5;
      const d = Math.hypot(lx, ly);
      const loop = Math.max(0, 1 - Math.abs(d - 0.28) * 7);
      const fuzz = valueNoise(u * 6, v * 6, 5, loops * 6, loops * 6);
      height[i] = loop * 0.03 + fuzz * 0.01;
      const k = 205 + loop * 40 + fuzz * 10;
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = k;
    }
  return pack(W, H, 4, 4, rgb, height, rough, 0.6);
}
