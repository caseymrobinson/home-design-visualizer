export type Mount = 'floor' | 'wall' | 'ceiling';

export type Field =
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: 'number'; min: number; max: number; step?: number; unit?: 'in' | '' }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'color' };

export interface CatalogEntry {
  type: string;
  label: string;
  blurb: string;
  category: 'Fixtures' | 'Storage' | 'Lighting' | 'Electrical' | 'Accessories' | 'Decor';
  mount: Mount;
  /** Floor items that should back up flush against walls & rotate to face the room. */
  wallSnap?: boolean;
  defaults: { w: number; d: number; h: number; z: number; params: Record<string, string | number | boolean> };
  /** Which dimensions the person can edit */
  dims: ('w' | 'd' | 'h' | 'z')[];
  fields: Field[];
}

const opt = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const WOODS = opt(
  ['rosewood', 'Rosewood'],
  ['white-oak', 'White oak'],
  ['rift-oak', 'Rift-sawn oak'],
  ['walnut', 'Walnut'],
  ['ash-black', 'Ebonized ash'],
  ['painted', 'Painted'],
);

export const COUNTERTOPS = opt(
  ['white-acrylic', 'White acrylic (integrated)'],
  ['white-quartz', 'White quartz'],
  ['calacatta', 'Calacatta marble'],
  ['carrara', 'Carrara marble'],
  ['soapstone', 'Soapstone'],
  ['travertine', 'Travertine'],
  ['terrazzo', 'Terrazzo'],
);

const FRONTS = opt(['slab', 'Flat slab'], ['shaker', 'Shaker'], ['fluted', 'Fluted'], ['reeded', 'Reeded (fine)']);
const PULLS = opt(['profile', 'Aluminum profile (full width)'], ['edge', 'Edge pulls'], ['bar', 'Bar pulls'], ['knob', 'Knobs'], ['none', 'Push to open']);

export const CATALOG: CatalogEntry[] = [
  {
    type: 'vanity',
    label: 'Floating vanity',
    blurb: 'Wall-hung cabinet, stone top, sinks & faucets',
    category: 'Fixtures',
    mount: 'wall',
    defaults: {
      w: 72,
      d: 21,
      h: 22,
      z: 12,
      params: {
        sinks: 2,
        sinkStyle: 'undermount',
        faucet: 'single',
        front: 'slab',
        columns: 3,
        rows: 2,
        wood: 'white-oak',
        paint: '#5b6b5d',
        top: 'white-quartz',
        topThickness: 1.5,
        pulls: 'edge',
      },
    },
    dims: ['w', 'd', 'h', 'z'],
    fields: [
      { key: 'sinks', label: 'Sinks', kind: 'select', options: opt(['1', 'One'], ['2', 'Two']) },
      { key: 'sinkStyle', label: 'Sink style', kind: 'select', options: opt(['integrated', 'Integrated (same as top)'], ['undermount', 'Undermount'], ['vessel', 'Vessel']) },
      { key: 'faucet', label: 'Faucet', kind: 'select', options: opt(['delta-modern', 'Delta Modern 567LF'], ['single', 'Gooseneck single hole'], ['widespread', 'Widespread'], ['wall', 'Wall mount']) },
      { key: 'front', label: 'Door style', kind: 'select', options: FRONTS },
      { key: 'columns', label: 'Columns', kind: 'number', min: 1, max: 6, step: 1, unit: '' },
      { key: 'rows', label: 'Drawers per column', kind: 'number', min: 1, max: 4, step: 1, unit: '' },
      { key: 'wood', label: 'Cabinet finish', kind: 'select', options: WOODS },
      { key: 'paint', label: 'Paint color', kind: 'color' },
      { key: 'pulls', label: 'Hardware', kind: 'select', options: PULLS },
      { key: 'top', label: 'Countertop', kind: 'select', options: COUNTERTOPS },
      { key: 'topThickness', label: 'Top thickness', kind: 'number', min: 0.75, max: 4, step: 0.25, unit: 'in' },
    ],
  },
  {
    type: 'linen',
    label: 'Linen cabinet',
    blurb: 'Tall floating storage tower',
    category: 'Storage',
    mount: 'wall',
    defaults: {
      w: 16,
      d: 14,
      h: 64,
      z: 12,
      params: { front: 'slab', wood: 'white-oak', paint: '#5b6b5d', pulls: 'edge', hinge: 'left', doors: 1 },
    },
    dims: ['w', 'd', 'h', 'z'],
    fields: [
      { key: 'front', label: 'Door style', kind: 'select', options: FRONTS },
      { key: 'doors', label: 'Doors', kind: 'number', min: 1, max: 3, step: 1, unit: '' },
      { key: 'hinge', label: 'Hinge side', kind: 'select', options: opt(['left', 'Left'], ['right', 'Right']) },
      { key: 'wood', label: 'Cabinet finish', kind: 'select', options: WOODS },
      { key: 'paint', label: 'Paint color', kind: 'color' },
      { key: 'pulls', label: 'Hardware', kind: 'select', options: PULLS },
    ],
  },
  {
    type: 'tub',
    label: 'Alcove tub',
    blurb: 'Enameled steel / acrylic, apron front',
    category: 'Fixtures',
    mount: 'floor',
    wallSnap: true,
    defaults: { w: 60, d: 30, h: 18, z: 0, params: { color: '#f4f2ee', drain: 'left' } },
    dims: ['w', 'd', 'h'],
    fields: [
      { key: 'drain', label: 'Drain end', kind: 'select', options: opt(['left', 'Left'], ['right', 'Right']) },
      { key: 'color', label: 'Enamel', kind: 'color' },
    ],
  },
  {
    type: 'toilet',
    label: 'Toilet',
    blurb: 'Elongated, 12″ rough-in',
    category: 'Fixtures',
    mount: 'floor',
    wallSnap: true,
    defaults: { w: 16, d: 28.5, h: 28, z: 0, params: { style: 'one-piece', color: '#f6f5f2' } },
    dims: ['w', 'd', 'h'],
    fields: [
      { key: 'style', label: 'Style', kind: 'select', options: opt(['one-piece', 'One-piece skirted'], ['two-piece', 'Two-piece']) },
      { key: 'color', label: 'Porcelain', kind: 'color' },
    ],
  },
  {
    type: 'shower-trim',
    label: 'Shower & tub set',
    blurb: 'Shower head, handheld option, valve and tub spout',
    category: 'Fixtures',
    mount: 'wall',
    defaults: { w: 9, d: 10, h: 58, z: 22, params: { head: 'round', headSize: 8, handheld: 'none' } },
    dims: ['h', 'z'],
    fields: [
      {
        key: 'handheld',
        label: 'Handheld shower',
        kind: 'select',
        options: opt(['none', 'None (fixed head)'], ['holder', 'Fixed head + handheld on wall holder'], ['combo', 'Fixed head + handheld on slide bar'], ['slidebar', 'Handheld on slide bar only']),
      },
      {
        key: 'spout',
        label: 'Tub spout',
        kind: 'select',
        options: opt(['arzo', 'Delta Arzo (square)'], ['round', 'Rounded']),
      },
      { key: 'head', label: 'Head shape', kind: 'select', options: opt(['round', 'Round'], ['square', 'Square']) },
      { key: 'headSize', label: 'Head diameter', kind: 'number', min: 4, max: 12, step: 0.5, unit: 'in' },
    ],
  },
  {
    type: 'glass-panel',
    label: 'Glass screen',
    blurb: 'Fixed frameless tub screen',
    category: 'Fixtures',
    mount: 'wall',
    defaults: { w: 0.375, d: 30, h: 58, z: 18, params: { tint: 'clear', hardware: true } },
    dims: ['d', 'h', 'z'],
    fields: [
      { key: 'tint', label: 'Glass', kind: 'select', options: opt(['clear', 'Clear'], ['fluted', 'Fluted'], ['smoke', 'Smoke']) },
      { key: 'hardware', label: 'Wall clamps', kind: 'toggle' },
    ],
  },
  {
    type: 'curtain',
    label: 'Shower curtain',
    blurb: 'Linen curtain on a tension rod',
    category: 'Fixtures',
    mount: 'floor',
    defaults: { w: 60, d: 2, h: 60, z: 18, params: { color: '#ece6db', open: 0.35 } },
    dims: ['w', 'h', 'z'],
    fields: [
      { key: 'color', label: 'Fabric', kind: 'color' },
      { key: 'open', label: 'Pulled back', kind: 'number', min: 0, max: 0.8, step: 0.05, unit: '' },
    ],
  },
  {
    type: 'mirror',
    label: 'Mirror',
    blurb: 'Framed or frameless',
    category: 'Decor',
    mount: 'wall',
    defaults: { w: 22, d: 1, h: 34, z: 42, params: { shape: 'arch', frame: 'metal', rail: 'none' } },
    dims: ['w', 'h', 'z'],
    fields: [
      {
        key: 'shape',
        label: 'Shape',
        kind: 'select',
        options: opt(['rect', 'Rectangle'], ['rounded', 'Soft rectangle'], ['arch', 'Arch'], ['pill', 'Pill'], ['round', 'Round']),
      },
      { key: 'frame', label: 'Frame', kind: 'select', options: opt(['metal', 'Thin metal (hardware finish)'], ['black', 'Black metal'], ['wood', 'Wood'], ['none', 'Frameless']) },
      { key: 'rail', label: 'Hanging rail', kind: 'select', options: opt(['none', 'None'], ['black', 'Black metal rail'], ['finish', 'Rail in hardware finish']) },
    ],
  },
  {
    type: 'sconce',
    label: 'Wall sconce',
    blurb: 'Glass shade, warm LED',
    category: 'Lighting',
    mount: 'wall',
    defaults: { w: 5, d: 6.5, h: 11, z: 58, params: { style: 'globe', lumens: 450 } },
    dims: ['z'],
    fields: [
      { key: 'style', label: 'Style', kind: 'select', options: opt(['tube', '21″ frosted cylinder'], ['globe', 'Opal globe'], ['cylinder', 'Short cylinder'], ['cone', 'Pleated cone']) },
      { key: 'lumens', label: 'Brightness (lm)', kind: 'number', min: 100, max: 1500, step: 50, unit: '' },
    ],
  },
  {
    type: 'switch',
    label: 'Light switch',
    blurb: 'Rocker, slide dimmer or toggle · 1–3 gang',
    category: 'Electrical',
    mount: 'wall',
    defaults: { w: 2.75, d: 0.5, h: 4.5, z: 45.75, params: { gangs: 1, style: 'rocker', plate: 'white' } },
    dims: ['z'],
    fields: [
      { key: 'gangs', label: 'Gangs', kind: 'number', min: 1, max: 3, step: 1, unit: '' },
      { key: 'style', label: 'Style', kind: 'select', options: opt(['rocker', 'Decora rocker'], ['dimmer', 'Rocker + slide dimmer'], ['toggle', 'Toggle']) },
      { key: 'plate', label: 'Plate', kind: 'select', options: opt(['white', 'White'], ['black', 'Black'], ['finish', 'Metal (hardware finish)']) },
    ],
  },
  {
    type: 'outlet',
    label: 'Outlet',
    blurb: 'GFCI, duplex or USB · 1–2 gang',
    category: 'Electrical',
    mount: 'wall',
    defaults: { w: 2.75, d: 0.5, h: 4.5, z: 41.75, params: { gangs: 1, style: 'gfci', plate: 'white' } },
    dims: ['z'],
    fields: [
      { key: 'gangs', label: 'Gangs', kind: 'number', min: 1, max: 2, step: 1, unit: '' },
      { key: 'style', label: 'Type', kind: 'select', options: opt(['gfci', 'GFCI (required in bathrooms)'], ['duplex', 'Duplex'], ['usb', 'Outlet + USB-A/C']) },
      { key: 'plate', label: 'Plate', kind: 'select', options: opt(['white', 'White'], ['black', 'Black'], ['finish', 'Metal (hardware finish)']) },
    ],
  },
  {
    type: 'ceiling-light',
    label: 'Ceiling light',
    blurb: 'Recessed can or flush mount',
    category: 'Lighting',
    mount: 'ceiling',
    defaults: { w: 4, d: 4, h: 1, z: 0, params: { style: 'recessed', lumens: 700 } },
    dims: [],
    fields: [
      { key: 'style', label: 'Style', kind: 'select', options: opt(['recessed', 'Recessed can'], ['flush', 'Flush dome'], ['pendant', 'Globe pendant']) },
      { key: 'lumens', label: 'Brightness (lm)', kind: 'number', min: 200, max: 2000, step: 50, unit: '' },
    ],
  },
  {
    type: 'towel-bar',
    label: 'Towel bar',
    blurb: 'With a folded bath towel',
    category: 'Accessories',
    mount: 'wall',
    defaults: { w: 24, d: 3.25, h: 2, z: 44, params: { towel: true, towelColor: '#e9e2d6' } },
    dims: ['w', 'z'],
    fields: [
      { key: 'towel', label: 'Towel', kind: 'toggle' },
      { key: 'towelColor', label: 'Towel color', kind: 'color' },
    ],
  },
  {
    type: 'robe-hook',
    label: 'Robe hook',
    blurb: 'Round post hook',
    category: 'Accessories',
    mount: 'wall',
    defaults: { w: 1.5, d: 2.5, h: 1.5, z: 64, params: { towel: true, towelColor: '#d9cbb7' } },
    dims: ['z'],
    fields: [
      { key: 'towel', label: 'Hand towel', kind: 'toggle' },
      { key: 'towelColor', label: 'Towel color', kind: 'color' },
    ],
  },
  {
    type: 'tp-holder',
    label: 'Paper holder',
    blurb: 'Square pivoting bar or open arm, with roll',
    category: 'Accessories',
    mount: 'wall',
    defaults: { w: 9, d: 4, h: 2.2, z: 25, params: { style: 'square' } },
    dims: ['z'],
    fields: [{ key: 'style', label: 'Style', kind: 'select', options: opt(['square', 'Square pivoting bar'], ['round', 'Round open arm']) }],
  },
  {
    type: 'towel-ring',
    label: 'Hand towel bar',
    blurb: 'L-shaped flat bar with a hand towel',
    category: 'Accessories',
    mount: 'wall',
    defaults: { w: 10, d: 3, h: 2, z: 42, params: { towel: true, towelColor: '#e6dccb', side: 'left' } },
    dims: ['w', 'z'],
    fields: [
      { key: 'side', label: 'Wall mount', kind: 'select', options: opt(['left', 'Left end'], ['right', 'Right end']) },
      { key: 'towel', label: 'Hand towel', kind: 'toggle' },
      { key: 'towelColor', label: 'Towel color', kind: 'color' },
    ],
  },
  {
    type: 'art',
    label: 'Wall art',
    blurb: 'Framed print, any size',
    category: 'Decor',
    mount: 'wall',
    defaults: { w: 16, d: 1.1, h: 20, z: 48, params: { art: 'arches', palette: 'warm', seed: 1, frame: 'black', mat: true } },
    dims: ['w', 'h', 'z'],
    fields: [
      {
        key: 'art',
        label: 'Artwork',
        kind: 'select',
        options: opt(
          ['arches', 'Rainbow arches'],
          ['sun', 'Sun & hills'],
          ['botanical', 'Botanical sketch'],
          ['landscape', 'Watercolor landscape'],
          ['shapes', 'Cut-paper shapes'],
          ['color-field', 'Color field'],
          ['lines', 'Fine line'],
        ),
      },
      { key: 'palette', label: 'Palette', kind: 'select', options: opt(['warm', 'Terracotta'], ['sage', 'Sage'], ['earth', 'Earth'], ['blush', 'Blush'], ['mono', 'Charcoal']) },
      { key: 'seed', label: 'Variation', kind: 'number', min: 1, max: 30, step: 1, unit: '' },
      { key: 'frame', label: 'Frame', kind: 'select', options: opt(['black', 'Thin black'], ['oak', 'Oak'], ['white', 'White'], ['finish', 'Metal (hardware finish)'], ['none', 'Gallery-wrapped canvas']) },
      { key: 'mat', label: 'Mat', kind: 'toggle' },
    ],
  },
  {
    type: 'shelf',
    label: 'Floating shelf',
    blurb: 'Solid wood, styled',
    category: 'Storage',
    mount: 'wall',
    defaults: { w: 24, d: 7, h: 1.5, z: 58, params: { wood: 'white-oak', decor: true } },
    dims: ['w', 'd', 'z'],
    fields: [
      { key: 'wood', label: 'Finish', kind: 'select', options: WOODS },
      { key: 'decor', label: 'Styling', kind: 'toggle' },
    ],
  },
  {
    type: 'rug',
    label: 'Bath mat',
    blurb: 'Cotton loop or flatweave',
    category: 'Decor',
    mount: 'floor',
    defaults: { w: 34, d: 21, h: 0.5, z: 0, params: { color: '#d8cdbd', weave: 'loop', stripe: '#b9a78f' } },
    dims: ['w', 'd'],
    fields: [
      { key: 'weave', label: 'Weave', kind: 'select', options: opt(['loop', 'Loop pile'], ['flat', 'Striped flatweave']) },
      { key: 'color', label: 'Color', kind: 'color' },
      { key: 'stripe', label: 'Accent', kind: 'color' },
    ],
  },
  {
    type: 'plant',
    label: 'Plant',
    blurb: 'Olive, monstera, snake plant, or trailing vines that drape over counters',
    category: 'Decor',
    mount: 'floor',
    defaults: { w: 12, d: 12, h: 34, z: 0, params: { kind: 'olive', pot: '#cbbba5', potStyle: 'tapered', trail: 30 } },
    dims: ['h', 'z'],
    fields: [
      {
        key: 'kind',
        label: 'Plant',
        kind: 'select',
        options: opt(
          ['olive', 'Olive tree'],
          ['monstera', 'Monstera'],
          ['snake', 'Snake plant'],
          ['fern', 'Fern'],
          ['pothos', 'Trailing pothos'],
          ['pearls', 'String of pearls'],
        ),
      },
      { key: 'trail', label: 'Vine length (trailing)', kind: 'number', min: 6, max: 60, step: 1, unit: 'in' },
      { key: 'potStyle', label: 'Pot', kind: 'select', options: opt(['tapered', 'Tapered'], ['cylinder', 'Cylinder'], ['bowl', 'Round bowl']) },
      { key: 'pot', label: 'Pot color', kind: 'color' },
    ],
  },
  {
    type: 'vanity-decor',
    label: 'Counter styling',
    blurb: 'Tray, soap, vase & candle',
    category: 'Decor',
    mount: 'floor',
    defaults: { w: 10, d: 5, h: 7, z: 34, params: {} },
    dims: ['z'],
    fields: [],
  },
];

export const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.type, c])) as Record<string, CatalogEntry>;
