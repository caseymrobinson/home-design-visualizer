import { useEffect } from 'react';
import { CATALOG_BY_TYPE } from '../lib/catalog';
import { findSurface, surfacePoint } from '../lib/geometry';
import { useStore } from '../store';
import { itemOnSurface } from '../three/placement';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const st = useStore.getState();
      if (st.render.active) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      const sel = st.design().items.find((i) => i.id === st.selectedId);
      if (mod && k === 'd' && sel) {
        e.preventDefault();
        st.duplicateItem(sel.id);
        return;
      }
      if (mod) return;
      if (k === 'escape') {
        if (st.selectedId) st.select(null);
        else st.setPanel(null);
        return;
      }
      if ((k === 'delete' || k === 'backspace') && sel) {
        e.preventDefault();
        st.removeItem(sel.id);
        return;
      }
      if (st.mode !== 'walk') {
        if (k === '1') st.setMode('orbit');
        if (k === '3') st.setMode('plan');
      }
      if (k === '2') st.setMode('walk');
      if (k === 'm') st.set({ showDims: !st.showDims });
      if (k === 'e' && st.mode !== 'walk') {
        st.set({ editMode: !st.editMode });
        st.notify(st.editMode ? 'Edit mode off — furniture is locked' : 'Edit mode on — drag to move things');
      }
      if (!sel || !st.editMode) return;
      const entry = CATALOG_BY_TYPE[sel.type];
      if (k === 'r' && entry?.mount !== 'wall') {
        const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2;
        st.updateItem(sel.id, { rot: sel.rot - step }, true);
      }
      if (st.mode === 'walk') return;
      const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if (arrows[k]) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const [dx, dy] = arrows[k];
        if (entry?.mount === 'wall') {
          const s = findSurface(st.design().room, sel.surface);
          if (!s) return;
          if (dy !== 0) st.updateItem(sel.id, { z: Math.max(0, sel.z - dy * step) }, true);
          else {
            const p = surfacePoint(s, itemOnSurface(sel, s) + dx * step);
            st.updateItem(sel.id, { x: p.x, y: p.y }, true);
          }
        } else st.updateItem(sel.id, { x: sel.x + dx * step, y: sel.y + dy * step }, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
