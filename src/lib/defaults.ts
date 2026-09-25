import { CATALOG_BY_TYPE } from './catalog';
import { findSurface, rotForNormal, surfacePoint } from './geometry';
import { TILE_PRESETS } from './tiles';
import type { Design, Item, Lighting, Room, SurfaceRef, TileSpec } from './types';
import { uid } from './units';

export const EYE_HEIGHT = 65.5; // 5′10″ person → eyes ≈ 4½″ below the top of the head

export const DEFAULT_LIGHTING: Lighting = {
  time: 9.5,
  northAngle: 180,
  daylight: true,
  overcast: false,
  sconces: true,
  ceiling: true,
  dimmer: 0.8,
  kelvin: 3000,
  exposure: 0,
};

export function makeItem(type: string, over: Partial<Item> = {}): Item {
  const c = CATALOG_BY_TYPE[type];
  return {
    id: uid(type),
    type,
    x: 0,
    y: 0,
    rot: 0,
    z: c.defaults.z,
    w: c.defaults.w,
    d: c.defaults.d,
    h: c.defaults.h,
    ...over,
    params: { ...c.defaults.params, ...(over.params ?? {}) },
  };
}

/** Place a wall-mounted item with its back centered at `u` along the surface. */
export function onWall(room: Room, surface: SurfaceRef, type: string, u: number, over: Partial<Item> = {}): Item {
  const s = findSurface(room, surface)!;
  const p = surfacePoint(s, u);
  return makeItem(type, { ...over, x: p.x, y: p.y, rot: rotForNormal(s.n), surface });
}

/**
 * Casey's bathroom: 100½″ × 100″, 95″ ceiling.
 *  Wall A (y = 0)     tub/shower alcove + toilet, split by a 32″ × 4″ half wall
 *  Wall B (x = 100½)  shower valve end of the tub, door opposite the window
 *  Wall C (y = 100)   72″ floating vanity + 16″ linen cabinet
 *  Wall D (x = 0)     window
 */
export function defaultRoom(): Room {
  return {
    corners: [
      { x: 0, y: 0 },
      { x: 100.5, y: 0 },
      { x: 100.5, y: 100 },
      { x: 0, y: 100 },
    ],
    ceiling: 95,
    wallThickness: 4.5,
    baseboard: 4,
    partitions: [{ id: 'half-wall', name: 'Half wall', wall: 0, offset: 36.5, length: 32, thickness: 4, height: 0 }],
    openings: [
      { id: 'door', kind: 'door', wall: 1, offset: 57, width: 30, height: 80, sill: 0, hinge: 'start', openAngle: 0, glass: 'clear' },
      { id: 'window', kind: 'window', wall: 3, offset: 43, width: 28, height: 36, sill: 44, hinge: 'start', openAngle: 0, glass: 'frosted' },
    ],
    tileZones: [
      { id: 'tz-back', name: 'Shower · back wall', surface: { kind: 'wall', wall: 0 }, u0: 40.5, u1: 100.5, v0: 0, v1: 95, tile: 'zellige-ivory-4x4' },
      { id: 'tz-end', name: 'Shower · valve wall', surface: { kind: 'wall', wall: 1 }, u0: 0, u1: 32, v0: 0, v1: 95, tile: 'zellige-ivory-4x4' },
      {
        id: 'tz-half',
        name: 'Shower · half wall',
        surface: { kind: 'partition', id: 'half-wall', face: 'b' },
        u0: 0,
        u1: 32,
        v0: 0,
        v1: 95,
        tile: 'zellige-ivory-4x4',
      },
      {
        id: 'tz-half-end',
        name: 'Half wall · end cap',
        surface: { kind: 'partition', id: 'half-wall', face: 'end' },
        u0: 0,
        u1: 4,
        v0: 0,
        v1: 95,
        tile: 'zellige-ivory-4x4',
      },
    ],
  };
}

export function defaultItems(room: Room): Item[] {
  const A: SurfaceRef = { kind: 'wall', wall: 0 };
  const C: SurfaceRef = { kind: 'wall', wall: 2 };
  const D: SurfaceRef = { kind: 'wall', wall: 3 };
  const B: SurfaceRef = { kind: 'wall', wall: 1 };
  const halfA: SurfaceRef = { kind: 'partition', id: 'half-wall', face: 'a' };
  // Wall C runs from x = 100.5 back to x = 0, so u = 100.5 − x.
  const cx = (x: number) => 100.5 - x;
  // Wall D runs from y = 100 back to y = 0, so u = 100 − y.
  const dy = (y: number) => 100 - y;
  const vanityX = 54;
  return [
    makeItem('tub', { x: 70.5, y: 0, rot: 0, params: { drain: 'right' } }),
    makeItem('toilet', { x: 18.25, y: 0, rot: 0 }),
    onWall(room, B, 'shower-trim', 15),
    onWall(room, B, 'glass-panel', 29.6),
    onWall(room, C, 'vanity', cx(vanityX)),
    onWall(room, C, 'linen', cx(9)),
    onWall(room, C, 'mirror', cx(vanityX - 18)),
    onWall(room, C, 'mirror', cx(vanityX + 18)),
    onWall(room, C, 'sconce', cx(vanityX)),
    onWall(room, C, 'sconce', cx(vanityX - 34)),
    onWall(room, C, 'sconce', cx(vanityX + 34)),
    onWall(room, A, 'shelf', 18.25),
    onWall(room, halfA, 'tp-holder', 26),
    onWall(room, D, 'robe-hook', dy(35)),
    onWall(room, D, 'robe-hook', dy(39.5), { params: { towel: false } }),
    makeItem('ceiling-light', { x: 54, y: 64 }),
    makeItem('ceiling-light', { x: 70.5, y: 15 }),
    makeItem('ceiling-light', { x: 18, y: 22 }),
    makeItem('rug', { x: 70.5, y: 31, rot: 0 }),
    makeItem('vanity-decor', { x: vanityX + 2, y: 94, rot: Math.PI }),
    makeItem('plant', { x: 1, y: 76, rot: Math.PI / 2, params: { kind: 'olive' }, h: 42 }),
  ];
}

export function tilesById(ids: string[]): Record<string, TileSpec> {
  const out: Record<string, TileSpec> = {};
  for (const t of TILE_PRESETS) if (ids.includes(t.id)) out[t.id] = structuredClone(t);
  return out;
}

export const LAYOUT_REV = 2;

export function defaultDesign(): Design {
  const room = defaultRoom();
  return {
    layoutRev: LAYOUT_REV,
    id: uid('design'),
    name: 'Option A · Ivory & oak',
    updatedAt: Date.now(),
    room,
    items: defaultItems(room),
    finishes: {
      floorTile: 'limestone-12x24',
      wallPaint: '#e9e3d8',
      paintSheen: 'eggshell',
      ceilingPaint: '#f3f1ec',
      trimPaint: '#efece6',
      metal: 'brushed-brass',
    },
    tiles: Object.fromEntries(TILE_PRESETS.map((t) => [t.id, structuredClone(t)])),
    lighting: { ...DEFAULT_LIGHTING },
  };
}
