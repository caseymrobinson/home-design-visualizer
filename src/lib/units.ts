/** All design data is stored in inches. The 3D scene works in meters. */
export const IN = 0.0254;

const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
const SUP: Record<string, string> = { '1': '¹', '3': '³', '5': '⁵', '7': '⁷', '9': '⁹' };

/** Split a decimal inch value into whole inches and the nearest 1/16" glyph. */
function inchParts(inches: number): [number, string] {
  let sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  sixteenths -= whole * 16;
  if (sixteenths % 2 === 0) return [whole, EIGHTHS[sixteenths / 2]];
  const num = String(sixteenths)
    .split('')
    .map((c) => SUP[c] ?? '¹')
    .join('');
  return [whole, `${num}⁄₁₆`];
}

/** 100.5 → `8′ 4½″` */
export function formatFtIn(inches: number, opts: { compact?: boolean } = {}): string {
  const sign = inches < 0 ? '−' : '';
  const abs = Math.abs(inches);
  const [whole, frac] = inchParts(abs);
  const ft = Math.floor(whole / 12);
  const inch = whole - ft * 12;
  if (ft === 0) return `${sign}${inch || !frac ? inch : ''}${frac}″`;
  if (opts.compact && inch === 0 && !frac) return `${sign}${ft}′`;
  return `${sign}${ft}′ ${inch}${frac}″`;
}

/** 34.5 → `34½″` (never rolls into feet) */
export function formatIn(inches: number): string {
  const sign = inches < 0 ? '−' : '';
  const [whole, frac] = inchParts(Math.abs(inches));
  return `${sign}${whole || !frac ? whole : ''}${frac}″`;
}

/**
 * Parse flexible length input. Accepts:
 *  `100.5`, `100 1/2`, `8' 4.5"`, `8'4 1/2"`, `8ft 4in`, `8-4 1/2`, `8′ 4½″`
 * Bare numbers are inches.
 */
export function parseLength(input: string): number | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s
    .replace(/[′’]/g, "'")
    .replace(/[″”]/g, '"')
    .replace(/feet|foot|ft/g, "'")
    .replace(/inches|inch|in/g, '"')
    .replace(/([¹³⁵⁷⁹]+)⁄₁₆/g, (_, n: string) => ` ${n.replace(/[¹³⁵⁷⁹]/g, (c) => '13579'['¹³⁵⁷⁹'.indexOf(c)])}/16`)
    .replace(/⅛/g, ' 1/8')
    .replace(/¼/g, ' 1/4')
    .replace(/⅜/g, ' 3/8')
    .replace(/½/g, ' 1/2')
    .replace(/⅝/g, ' 5/8')
    .replace(/¾/g, ' 3/4')
    .replace(/⅞/g, ' 7/8');

  const num = (t: string): number | null => {
    t = t.trim();
    if (!t) return 0;
    const parts = t.split(/\s+/);
    let total = 0;
    for (const p of parts) {
      if (p.includes('/')) {
        const [a, b] = p.split('/').map(Number);
        if (!isFinite(a) || !isFinite(b) || b === 0) return null;
        total += a / b;
      } else {
        const v = Number(p);
        if (!isFinite(v)) return null;
        total += v;
      }
    }
    return total;
  };

  let feet = 0;
  let rest = s;
  const ftIdx = s.indexOf("'");
  if (ftIdx >= 0) {
    const f = num(s.slice(0, ftIdx));
    if (f === null) return null;
    feet = f;
    rest = s.slice(ftIdx + 1);
  } else if (/^\d+\s*-\s*\d/.test(s)) {
    // 8-4 1/2 → feet-inches
    const [f, r] = s.split('-');
    const fv = num(f);
    if (fv === null) return null;
    feet = fv;
    rest = r;
  }
  rest = rest.replace(/"/g, '').replace(/-/g, ' ');
  const inches = num(rest);
  if (inches === null) return null;
  const total = feet * 12 + inches;
  return isFinite(total) ? total : null;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const snap = (v: number, step: number) => Math.round(v / step) * step;
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`;
