import { EYE_HEIGHT } from './defaults';
import { bounds, getWalls } from './geometry';
import type { Design } from './types';

export interface Viewpoint {
  id: string;
  label: string;
  x: number;
  y: number;
  lookX: number;
  lookY: number;
  lookH: number;
}

/** Suggested places to stand, derived from the room: the doorway, then facing each fixture. */
export function viewpoints(design: Design): Viewpoint[] {
  const out: Viewpoint[] = [];
  const b = bounds(design.room.corners);
  const walls = getWalls(design.room);
  const door = design.room.openings.find((o) => o.kind === 'door');
  if (door) {
    const w = walls[door.wall];
    if (w) {
      const p = { x: w.a.x + w.dir.x * door.offset + w.n.x * 12, y: w.a.y + w.dir.y * door.offset + w.n.y * 12 };
      out.push({ id: 'door', label: 'Doorway', x: p.x, y: p.y, lookX: p.x + w.n.x * 80, lookY: p.y + w.n.y * 80, lookH: EYE_HEIGHT - 12 });
    }
  }
  const labels: Record<string, string> = { vanity: 'At the vanity', tub: 'Bath', toilet: 'Toilet side' };
  for (const type of ['vanity', 'tub', 'toilet']) {
    const it = design.items.find((i) => i.type === type);
    if (!it) continue;
    const fx = Math.sin(it.rot);
    const fy = Math.cos(it.rot);
    const back = type === 'vanity' ? 34 : type === 'tub' ? 60 : 44;
    let x = it.x + fx * (it.d + back);
    let y = it.y + fy * (it.d + back);
    x = Math.min(Math.max(x, b.minX + 10), b.maxX - 10);
    y = Math.min(Math.max(y, b.minY + 10), b.maxY - 10);
    out.push({ id: type, label: labels[type], x, y, lookX: it.x + fx * it.d * 0.5, lookY: it.y + fy * it.d * 0.5, lookH: type === 'vanity' ? EYE_HEIGHT - 6 : 30 });
  }
  return out;
}
