import { create } from 'zustand';
import { defaultDesign, electricalItems, LAYOUT_REV } from './lib/defaults';
import { normalizeCorners } from './lib/geometry';
import type { Design, Item, ViewMode } from './lib/types';
import { uid } from './lib/units';

export type Panel = 'room' | 'add' | 'finishes' | 'light' | 'designs' | null;

export interface RenderState {
  active: boolean;
  samples: number;
  target: number;
  phase: 'idle' | 'building' | 'tracing' | 'done';
  snapshot: string | null;
}

interface State {
  designs: Design[];
  activeId: string;
  selectedId: string | null;
  hoverId: string | null;
  mode: ViewMode;
  panel: Panel;
  dragging: boolean;
  editMode: boolean;
  snapping: boolean;
  showDims: boolean;
  fov: number;
  render: RenderState;
  toast: string | null;
  past: Design[];
  future: Design[];

  design: () => Design;
  /** Mutate the active design. `record` pushes an undo step first. */
  update: (fn: (d: Design) => void, record?: boolean) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  updateItem: (id: string, patch: Partial<Item> | ((it: Item) => void), record?: boolean) => void;
  addItem: (it: Item) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  select: (id: string | null) => void;
  setHover: (id: string | null) => void;
  setMode: (m: ViewMode) => void;
  setPanel: (p: Panel) => void;
  set: (p: Partial<State>) => void;
  setRender: (p: Partial<RenderState>) => void;
  notify: (msg: string) => void;

  newDesign: (fromCurrent: boolean) => void;
  switchDesign: (id: string) => void;
  renameDesign: (id: string, name: string) => void;
  deleteDesign: (id: string) => void;
  importDesign: (d: Design) => void;
  resetDesign: () => void;
}

const STORAGE_KEY = 'bath-studio:v1';

function load(): { designs: Design[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.designs?.length) {
        // Older saves predate the corrected layout (toilet/tub swap, door opposite the window).
        const fresh = defaultDesign();
        parsed.designs = parsed.designs.map((d: Design) =>
          d.layoutRev === 4
            ? {
                // Rev 5 only adds switches & outlets; keep everything the person placed.
                ...d,
                layoutRev: LAYOUT_REV,
                items: d.items.some((i) => i.type === 'switch' || i.type === 'outlet') ? d.items : [...d.items, ...electricalItems(d.room)],
              }
            : (d.layoutRev ?? 1) < LAYOUT_REV
            ? {
                ...d,
                room: fresh.room,
                items: fresh.items,
                layoutRev: LAYOUT_REV,
                // Chosen products: tile & plumbing finish come with the layout
                finishes: { ...d.finishes, floorTile: fresh.finishes.floorTile, metal: fresh.finishes.metal },
                tiles: { ...fresh.tiles, ...d.tiles },
                lighting: { ...fresh.lighting, ...d.lighting, underCabinet: d.lighting.underCabinet ?? true },
              }
            : d,
        );
        return parsed;
      }
    }
  } catch {
    /* storage may be unavailable */
  }
  const d = defaultDesign();
  return { designs: [d], activeId: d.id };
}

const initial = load();
let toastTimer: number | undefined;

export const useStore = create<State>((set, get) => ({
  designs: initial.designs,
  activeId: initial.activeId,
  selectedId: null,
  hoverId: null,
  mode: 'orbit',
  panel: null,
  dragging: false,
  editMode: false,
  snapping: true,
  showDims: true,
  fov: 58,
  render: { active: false, samples: 0, target: 200, phase: 'idle', snapshot: null },
  toast: null,
  past: [],
  future: [],

  design: () => {
    const s = get();
    return s.designs.find((d) => d.id === s.activeId) ?? s.designs[0];
  },

  update: (fn, record = true) => {
    const s = get();
    const cur = s.design();
    const next = structuredClone(cur);
    fn(next);
    next.room.corners = normalizeCorners(next.room.corners);
    next.updatedAt = Date.now();
    set({
      designs: s.designs.map((d) => (d.id === cur.id ? next : d)),
      ...(record ? { past: [...s.past.slice(-80), cur], future: [] } : {}),
    });
  },

  checkpoint: () => {
    const s = get();
    set({ past: [...s.past.slice(-80), s.design()], future: [] });
  },

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    const cur = s.design();
    set({
      designs: s.designs.map((d) => (d.id === cur.id ? prev : d)),
      past: s.past.slice(0, -1),
      future: [cur, ...s.future],
    });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const cur = s.design();
    set({
      designs: s.designs.map((d) => (d.id === cur.id ? next : d)),
      past: [...s.past, cur],
      future: s.future.slice(1),
    });
  },

  updateItem: (id, patch, record = false) =>
    get().update((d) => {
      const it = d.items.find((i) => i.id === id);
      if (!it) return;
      if (typeof patch === 'function') patch(it);
      else Object.assign(it, patch);
    }, record),

  addItem: (it) => {
    get().update((d) => {
      d.items.push(it);
    });
    set({ selectedId: it.id });
  },

  removeItem: (id) => {
    get().update((d) => {
      d.items = d.items.filter((i) => i.id !== id);
    });
    if (get().selectedId === id) set({ selectedId: null });
  },

  duplicateItem: (id) => {
    const it = get()
      .design()
      .items.find((i) => i.id === id);
    if (!it) return;
    const copy: Item = { ...structuredClone(it), id: uid(it.type) };
    // Offset along the item's own width so the copy lands beside the original.
    copy.x += Math.cos(it.rot) * (it.w + 2);
    copy.y -= Math.sin(it.rot) * (it.w + 2);
    get().addItem(copy);
  },

  select: (id) => set({ selectedId: id }),
  setHover: (id) => set({ hoverId: id }),
  setMode: (m) => set({ mode: m }),
  setPanel: (p) => set((s) => ({ panel: s.panel === p ? null : p })),
  set: (p) => set(p),
  setRender: (p) => set((s) => ({ render: { ...s.render, ...p } })),
  notify: (msg) => {
    set({ toast: msg });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600);
  },

  newDesign: (fromCurrent) => {
    const s = get();
    const base = fromCurrent ? structuredClone(s.design()) : defaultDesign();
    const letter = String.fromCharCode(65 + (s.designs.length % 26));
    const d: Design = { ...base, id: uid('design'), name: `Option ${letter}`, updatedAt: Date.now() };
    set({ designs: [...s.designs, d], activeId: d.id, past: [], future: [], selectedId: null });
  },
  switchDesign: (id) => set({ activeId: id, past: [], future: [], selectedId: null }),
  renameDesign: (id, name) => set((s) => ({ designs: s.designs.map((d) => (d.id === id ? { ...d, name } : d)) })),
  deleteDesign: (id) => {
    const s = get();
    if (s.designs.length <= 1) return;
    const designs = s.designs.filter((d) => d.id !== id);
    set({ designs, activeId: s.activeId === id ? designs[0].id : s.activeId, past: [], future: [] });
  },
  importDesign: (d) => {
    const s = get();
    const copy = { ...d, id: uid('design'), updatedAt: Date.now() };
    set({ designs: [...s.designs, copy], activeId: copy.id, past: [], future: [] });
  },
  resetDesign: () => {
    const fresh = defaultDesign();
    get().update((d) => {
      d.room = fresh.room;
      d.items = fresh.items;
      d.finishes = fresh.finishes;
      d.tiles = { ...fresh.tiles, ...d.tiles };
      d.lighting = fresh.lighting;
    });
  },
}));

export const useDesign = () => useStore((s) => s.designs.find((d) => d.id === s.activeId) ?? s.designs[0]);

// Persist (debounced).
let saveTimer: number | undefined;
useStore.subscribe((s, prev) => {
  if (s.designs === prev.designs && s.activeId === prev.activeId) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ designs: s.designs, activeId: s.activeId }));
    } catch {
      /* quota or private mode — the session still works */
    }
  }, 400);
});
