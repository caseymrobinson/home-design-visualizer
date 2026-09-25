/** Plan coordinates are inches. x → 3D X, y → 3D Z. Height is 3D Y. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Partition {
  id: string;
  name: string;
  wall: number; // index of host wall
  offset: number; // distance along host wall to the partition's first face
  length: number; // how far it juts into the room
  thickness: number;
  height: number; // 0 → full ceiling height
}

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  wall: number;
  offset: number; // center, measured along the wall from its start corner
  width: number;
  height: number;
  sill: number; // windows: height of the bottom of the opening
  hinge: 'start' | 'end';
  openAngle: number; // doors, degrees
  glass: 'clear' | 'frosted';
}

export type SurfaceRef =
  | { kind: 'wall'; wall: number }
  | { kind: 'partition'; id: string; face: 'a' | 'b' | 'end' };

export interface TileZone {
  id: string;
  name: string;
  surface: SurfaceRef;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  tile: string; // TileSpec id
}

export interface Room {
  corners: Vec2[];
  ceiling: number;
  wallThickness: number;
  partitions: Partition[];
  openings: Opening[];
  tileZones: TileZone[];
  baseboard: number; // height, 0 disables
}

export type TilePattern =
  | 'grid'
  | 'running'
  | 'third'
  | 'vertical'
  | 'herringbone'
  | 'basketweave'
  | 'hex';

export type TileSurface = 'flat' | 'handmade' | 'zellige' | 'marble' | 'terrazzo' | 'concrete' | 'quartz' | 'travertine';

export interface TileSpec {
  id: string;
  name: string;
  width: number;
  height: number;
  thickness: number;
  pattern: TilePattern;
  colors: string[];
  variation: number; // 0–1 tone variation tile to tile
  finish: 'matte' | 'satin' | 'gloss';
  surface: TileSurface;
  edge: 'square' | 'eased' | 'pillowed';
  groutWidth: number;
  groutColor: string;
  vein?: string; // marble vein color
  image?: string; // optional photo of the tile face (data URL)
}

export type MetalFinish =
  | 'chrome'
  | 'polished-nickel'
  | 'brushed-nickel'
  | 'brushed-brass'
  | 'matte-black'
  | 'oil-rubbed-bronze';

export interface Finishes {
  floorTile: string;
  wallPaint: string;
  paintSheen: 'flat' | 'eggshell' | 'satin' | 'semigloss';
  ceilingPaint: string;
  trimPaint: string;
  metal: MetalFinish;
}

export interface Lighting {
  time: number; // 5–21 hours
  northAngle: number; // compass bearing (deg) that the first wall's interior faces
  daylight: boolean;
  overcast: boolean;
  sconces: boolean;
  ceiling: boolean;
  dimmer: number; // 0–1
  kelvin: number;
  exposure: number; // EV offset
}

export interface Item {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number; // bottom elevation
  rot: number; // radians about vertical. 0 → front faces +y
  w: number;
  d: number;
  h: number;
  params: Record<string, string | number | boolean>;
  surface?: SurfaceRef; // set for wall mounted items
}

export interface Design {
  id: string;
  name: string;
  updatedAt: number;
  room: Room;
  items: Item[];
  finishes: Finishes;
  tiles: Record<string, TileSpec>;
  lighting: Lighting;
}

export type ViewMode = 'orbit' | 'walk' | 'plan';
