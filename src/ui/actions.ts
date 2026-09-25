import { CATALOG_BY_TYPE } from '../lib/catalog';
import { makeItem } from '../lib/defaults';
import { bounds, getSurfaces, rotForNormal, surfacePoint } from '../lib/geometry';
import { useStore } from '../store';
import { viewInfo } from '../three/CameraRig';
import { placeOnFloor } from '../three/placement';
import { registry } from '../three/registry';

/** Add a catalog item where it makes sense: wall items on the wall you're facing, floor items mid-room. */
export function addFromCatalog(type: string) {
  const st = useStore.getState();
  const design = st.design();
  const entry = CATALOG_BY_TYPE[type];
  const b = bounds(design.room.corners);
  let item = makeItem(type, { x: b.cx, y: b.cy, rot: 0 });

  if (entry.mount === 'wall') {
    const dir = { x: viewInfo.dir.x, y: viewInfo.dir.z };
    const surfaces = getSurfaces(design.room).filter(
      (s) => s.width >= item.w + 1 && !(s.ref.kind === 'wall' && registry.walls.get(s.ref.wall)?.lowered),
    );
    // The wall that faces the camera most directly
    const s = surfaces.sort((a, c) => a.n.x * dir.x + a.n.y * dir.y - (c.n.x * dir.x + c.n.y * dir.y))[0];
    if (s) {
      const p = surfacePoint(s, s.width / 2);
      item = { ...item, x: p.x, y: p.y, rot: rotForNormal(s.n), surface: s.ref };
    }
  } else if (entry.mount === 'floor') {
    const { patch } = placeOnFloor(item, { x: b.cx, y: b.cy }, design, true);
    item = { ...item, ...patch };
  }
  st.addItem(item);
  st.notify(`${entry.label} added — drag it into place`);
}
