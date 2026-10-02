/**
 * MAPEI's U.S. grout palette: the 40 standard colors of Ultracolor Plus FA.
 * Numbers and names are MAPEI's.
 *
 * MAPEI doesn't publish hex values, and it says on-screen color is only indicative.
 * These hex values are approximations of its swatches. Check the final choice
 * against a physical MAPEI color sample or a cured grout stick.
 */
export type GroutFamily = 'white' | 'beige' | 'brown' | 'gray' | 'dark';

export interface GroutColor {
  code: string;
  name: string;
  hex: string;
  family: GroutFamily;
}

export const GROUT_FAMILIES: { id: GroutFamily; label: string }[] = [
  { id: 'white', label: 'Whites & creams' },
  { id: 'beige', label: 'Beiges & tans' },
  { id: 'brown', label: 'Browns' },
  { id: 'gray', label: 'Grays' },
  { id: 'dark', label: 'Charcoals & deep tones' },
];

export const MAPEI_GROUTS: GroutColor[] = [
  // Whites & creams
  { code: '5220', name: 'Eggshell', hex: '#efebe2', family: 'white' },
  { code: '5077', name: 'Frost', hex: '#e7e7e2', family: 'white' },
  { code: '5038', name: 'Avalanche', hex: '#d9d9d3', family: 'white' },
  { code: '5229', name: 'Sea Salt', hex: '#dedad0', family: 'white' },
  { code: '5039', name: 'Ivory', hex: '#ebe2cd', family: 'white' },
  { code: '5001', name: 'Alabaster', hex: '#e4ddcd', family: 'white' },
  { code: '5049', name: 'Light Almond', hex: '#e0d5bf', family: 'white' },
  // Beiges & tans
  { code: '5015', name: 'Bone', hex: '#d6cab2', family: 'beige' },
  { code: '5014', name: 'Biscuit', hex: '#d4c5a7', family: 'beige' },
  { code: '5223', name: 'Oatmeal', hex: '#cbbea5', family: 'beige' },
  { code: '5222', name: 'Honey Butter', hex: '#d5bd8c', family: 'beige' },
  { code: '5011', name: 'Sahara Beige', hex: '#ccb893', family: 'beige' },
  { code: '5004', name: 'Bahama Beige', hex: '#c6b397', family: 'beige' },
  { code: '5005', name: 'Chamois', hex: '#c7ab84', family: 'beige' },
  { code: '5225', name: 'Sandstorm', hex: '#b6a58b', family: 'beige' },
  { code: '5224', name: 'Wicker', hex: '#b7a380', family: 'beige' },
  { code: '5006', name: 'Harvest', hex: '#b69469', family: 'beige' },
  // Browns
  { code: '5044', name: 'Pale Umber', hex: '#9c8a73', family: 'brown' },
  { code: '5105', name: 'Driftwood', hex: '#988a78', family: 'brown' },
  { code: '5226', name: 'Nutmeg', hex: '#85674c', family: 'brown' },
  { code: '5042', name: 'Mocha', hex: '#786452', family: 'brown' },
  { code: '5079', name: 'Cocoa', hex: '#5d4a3c', family: 'brown' },
  { code: '5007', name: 'Chocolate', hex: '#4c3a2f', family: 'brown' },
  // Grays
  { code: '5221', name: 'Moonbeam', hex: '#cfcfcb', family: 'gray' },
  { code: '5027', name: 'Silver', hex: '#bcbcb7', family: 'gray' },
  { code: '5019', name: 'Pearl Gray', hex: '#b2b1aa', family: 'gray' },
  { code: '5104', name: 'Timberwolf', hex: '#a7a49d', family: 'gray' },
  { code: '5093', name: 'Warm Gray', hex: '#a39c90', family: 'gray' },
  { code: '5101', name: 'Rain', hex: '#9ea2a2', family: 'gray' },
  { code: '5227', name: 'Castle Wall', hex: '#8d8981', family: 'gray' },
  { code: '5002', name: 'Pewter', hex: '#898680', family: 'gray' },
  { code: '5009', name: 'Gray', hex: '#808180', family: 'gray' },
  { code: '5103', name: 'Cobblestone', hex: '#76726a', family: 'gray' },
  // Charcoals & deep tones
  { code: '5228', name: 'Cavern Moss', hex: '#6e6f5e', family: 'dark' },
  { code: '5230', name: 'Armor', hex: '#5d5f5f', family: 'dark' },
  { code: '5107', name: 'Iron', hex: '#5a5a57', family: 'dark' },
  { code: '5047', name: 'Charcoal', hex: '#4a4a48', family: 'dark' },
  { code: '5231', name: 'Deep Ocean', hex: '#3b4751', family: 'dark' },
  { code: '5232', name: 'Night Sky', hex: '#30333a', family: 'dark' },
  { code: '5010', name: 'Black', hex: '#2b2b2b', family: 'dark' },
];

export const groutLabel = (g: GroutColor) => `${g.code} ${g.name}`;

/** The MAPEI color with exactly this hex, if any. */
export function mapeiGrout(hex: string): GroutColor | undefined {
  const h = hex.toLowerCase();
  return MAPEI_GROUTS.find((g) => g.hex === h);
}

/** The MAPEI color closest to an arbitrary hex (perceptual distance in Lab). */
export function nearestMapei(hex: string): GroutColor {
  const a = lab(hex);
  let best = MAPEI_GROUTS[0];
  let bestD = Infinity;
  for (const g of MAPEI_GROUTS) {
    const b = lab(g.hex);
    const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function lab(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
