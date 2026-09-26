import { Select } from '@react-three/postprocessing';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CATALOG_BY_TYPE } from '../lib/catalog';
import { findSurface } from '../lib/geometry';
import type { Design, Item } from '../lib/types';
import { IN } from '../lib/units';
import { useStore } from '../store';
import { ITEM_COMPONENTS } from './items/index';
import { hitPlane, hitSurfaces, itemOnSurface, placeOnFloor, placeOnWall, type Guide } from './placement';
import { markEnvDirty } from './registry';

interface DragState {
  id: string;
  mount: 'floor' | 'wall' | 'ceiling';
  startX: number;
  startY: number;
  moved: boolean;
  grabWall: { du: number; dv: number };
  grabFloor: { x: number; y: number };
}

export const dragApi = {
  start: (_it: Item, _e: ThreeEvent<PointerEvent>) => {},
  /** True while the pointer is holding an item (even before it has moved). */
  holding: false,
  guides: [] as Guide[],
  listeners: new Set<() => void>(),
};

const angleDamp = (cur: number, target: number, lambda: number, dt: number) => {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * (1 - Math.exp(-lambda * dt));
};

const ItemNode = memo(function ItemNode({ item, design }: { item: Item; design: Design }) {
  const Comp = ITEM_COMPONENTS[item.type];
  const entry = CATALOG_BY_TYPE[item.type];
  const selected = useStore((s) => s.selectedId === item.id);
  const ref = useRef<THREE.Group>(null!);
  const born = useRef(performance.now());
  const baseY = entry?.mount === 'ceiling' ? design.room.ceiling : item.z;

  useEffect(() => {
    // Drop-in: start slightly above and settle.
    ref.current.position.set(item.x, baseY + (entry?.mount === 'floor' ? 5 : 0), item.y);
    ref.current.rotation.y = item.rot;
    ref.current.scale.setScalar(0.94);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dt) => {
    const g = ref.current;
    const k = useStore.getState().dragging ? 26 : 14;
    const p = g.position;
    const before = p.x + p.y + p.z + g.rotation.y;
    p.x = THREE.MathUtils.damp(p.x, item.x, k, dt);
    p.y = THREE.MathUtils.damp(p.y, baseY, k, dt);
    p.z = THREE.MathUtils.damp(p.z, item.y, k, dt);
    g.rotation.y = angleDamp(g.rotation.y, item.rot, 12, dt);
    const s = THREE.MathUtils.damp(g.scale.x, 1, 10, dt);
    g.scale.setScalar(Math.abs(1 - s) < 1e-4 ? 1 : s);
    if (Math.abs(before - (p.x + p.y + p.z + g.rotation.y)) > 0.02 && performance.now() - born.current > 100) markEnvDirty();
  });

  if (!Comp) return null;

  return (
    <group
      ref={ref}
      name={item.id}
      onPointerDown={(e) => {
        if (e.button !== 0 || useStore.getState().render.active) return;
        if (useStore.getState().editMode) e.stopPropagation();
        useStore.getState().select(item.id);
        // Only pick things up in edit mode, so orbiting never nudges the furniture.
        if (useStore.getState().editMode) dragApi.start(item, e);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        const st = useStore.getState();
        document.body.style.cursor = st.dragging ? 'grabbing' : st.editMode ? 'grab' : 'pointer';
        useStore.getState().setHover(item.id);
      }}
      onPointerOut={() => {
        if (!useStore.getState().dragging) document.body.style.cursor = '';
        useStore.getState().setHover(null);
      }}
    >
      <Select enabled={selected}>
        <Comp item={item} design={design} />
      </Select>
    </group>
  );
});

export function Items({ design }: { design: Design }) {
  return (
    <>
      {design.items.map((it) => (
        <ItemNode key={it.id} item={it} design={design} />
      ))}
    </>
  );
}

/** Owns the pointer while an item is being dragged. */
export function DragController() {
  const { camera, gl, raycaster } = useThree();
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const ndc = new THREE.Vector2();
    const rayAt = (cx: number, cy: number) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray;
    };

    dragApi.start = (it, e) => {
      const st = useStore.getState();
      const design = st.design();
      const mount = CATALOG_BY_TYPE[it.type]?.mount ?? 'floor';
      const ray = rayAt(e.nativeEvent.clientX, e.nativeEvent.clientY);
      let grabWall = { du: 0, dv: it.h / 2 };
      let grabFloor = { x: 0, y: 0 };
      if (mount === 'wall') {
        const s = findSurface(design.room, it.surface);
        const hit = hitSurfaces(ray, design, { skipLowered: false });
        if (s && hit && hit.s.key === s.key) grabWall = { du: hit.u - itemOnSurface(it, s), dv: hit.v - it.z };
        else {
          // Clicked the item's front — use its own point instead of the wall behind.
          const p = e.point.clone().divideScalar(IN);
          if (s) {
            const u = (p.x - s.origin.x) * s.u.x + (p.z - s.origin.y) * s.u.y;
            grabWall = { du: u - itemOnSurface(it, s), dv: p.y - it.z };
          }
        }
      } else {
        const hp = hitPlane(ray, mount === 'ceiling' ? design.room.ceiling : 0);
        if (hp) grabFloor = { x: it.x - hp.x, y: it.y - hp.y };
      }
      dragApi.holding = true;
      drag.current = { id: it.id, mount, startX: e.nativeEvent.clientX, startY: e.nativeEvent.clientY, moved: false, grabWall, grabFloor };
    };

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return;
        d.moved = true;
        useStore.getState().checkpoint();
        useStore.setState({ dragging: true });
        document.body.style.cursor = 'grabbing';
      }
      const st = useStore.getState();
      const design = st.design();
      const it = design.items.find((i) => i.id === d.id);
      if (!it) return;
      const ray = rayAt(ev.clientX, ev.clientY);
      const snapping = st.snapping && !ev.altKey;
      if (d.mount === 'wall') {
        const hit = hitSurfaces(ray, design);
        if (!hit) return;
        const { patch, guides } = placeOnWall(it, hit, d.grabWall, design, snapping);
        dragApi.guides = guides;
        st.updateItem(d.id, patch, false);
      } else {
        const hp = hitPlane(ray, d.mount === 'ceiling' ? design.room.ceiling : 0);
        if (!hp) return;
        const target = { x: hp.x + d.grabFloor.x, y: hp.y + d.grabFloor.y };
        const { patch, guides } = d.mount === 'ceiling' ? { patch: { ...target, z: it.z, rot: it.rot }, guides: [] } : placeOnFloor(it, target, design, snapping);
        dragApi.guides = guides;
        st.updateItem(d.id, patch, false);
      }
      dragApi.listeners.forEach((l) => l());
    };

    const onUp = () => {
      if (drag.current?.moved) {
        useStore.setState({ dragging: false });
        document.body.style.cursor = '';
      }
      drag.current = null;
      dragApi.holding = false;
      dragApi.guides = [];
      dragApi.listeners.forEach((l) => l());
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, raycaster]);

  return null;
}
