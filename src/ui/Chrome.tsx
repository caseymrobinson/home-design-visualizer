import { AnimatePresence, motion } from 'motion/react';
import {
  Blocks,
  ChevronDown,
  Footprints,
  Layers,
  Lightbulb,
  Magnet,
  Move,
  Map as MapIcon,
  Orbit,
  Palette,
  Plus,
  Redo2,
  Ruler,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ViewMode } from '../lib/types';
import { viewpoints } from '../lib/views';
import { textureActivity } from '../materials/library';
import { useDesign, useStore, type Panel } from '../store';
import { cameraApi } from '../three/CameraRig';
import { spring } from './primitives';

export function TopBar() {
  const design = useDesign();
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const snapping = useStore((s) => s.snapping);
  const showDims = useStore((s) => s.showDims);
  const editMode = useStore((s) => s.editMode);
  const set = useStore((s) => s.set);
  return (
    <div className="topbar">
      <motion.div className="brand glass" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
        <div className="brand-mark">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <path d="M6 17h20v2.5A5.5 5.5 0 0 1 20.5 25h-9A5.5 5.5 0 0 1 6 19.5z" fill="currentColor" />
            <path d="M10 16V8.5a3.5 3.5 0 0 1 7 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Bath Studio</div>
          <div className="brand-sub">
            <span className="saved-dot" /> Saved on this device
          </div>
        </div>
        <div className="brand-sep" />
        <button className="design-switch" onClick={() => useStore.getState().setPanel('designs')}>
          <span className="name">{design.name}</span>
          <ChevronDown size={14} color="var(--muted)" />
        </button>
      </motion.div>

      <motion.div className="actions" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.18 }}>
        <button className={`edit-btn glass ${editMode ? 'on' : ''}`} onClick={() => set({ editMode: !editMode })} data-tip="Toggle moving things  E">
          <Move size={16} />
          {editMode ? 'Editing' : 'Edit'}
        </button>
        <div className="tool-cluster glass">
          <button className="icon-btn" data-tip="Undo  ⌘Z" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
            <Undo2 size={17} />
          </button>
          <button className="icon-btn" data-tip="Redo  ⇧⌘Z" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
            <Redo2 size={17} />
          </button>
          <button className={`icon-btn ${snapping ? 'on' : ''}`} data-tip={`Snapping ${snapping ? 'on' : 'off'}  (hold ⌥ to bypass)`} onClick={() => set({ snapping: !snapping })}>
            <Magnet size={17} />
          </button>
          <button className={`icon-btn ${showDims ? 'on' : ''}`} data-tip="Measurements  M" onClick={() => set({ showDims: !showDims })}>
            <Ruler size={17} />
          </button>
        </div>
        <button className="render-btn" onClick={() => useStore.getState().setRender({ active: true })}>
          <Sparkles size={16} className="spark" />
          Render photo
        </button>
      </motion.div>
    </div>
  );
}

const DOCK: { id: Exclude<Panel, null>; label: string; icon: typeof Plus }[] = [
  { id: 'add', label: 'Add fixtures', icon: Plus },
  { id: 'finishes', label: 'Tile, paint & metal', icon: Palette },
  { id: 'light', label: 'Light & time of day', icon: Lightbulb },
  { id: 'room', label: 'Room & walls', icon: Blocks },
  { id: 'designs', label: 'Design options', icon: Layers },
];

export function Dock() {
  const panel = useStore((s) => s.panel);
  return (
    <motion.div className="dock glass" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.24 }}>
      {DOCK.map((d, i) => (
        <div key={d.id}>
          {i === 3 && <div className="dock-divider" />}
          <button className={`dock-btn ${panel === d.id ? 'active' : ''}`} data-tip={d.label} onClick={() => useStore.getState().setPanel(d.id)}>
            {panel === d.id && <motion.span layoutId="dock-pill" className="pill" transition={spring} />}
            <d.icon size={19} strokeWidth={1.8} />
          </button>
        </div>
      ))}
    </motion.div>
  );
}

const VIEWS: { id: ViewMode; label: string; icon: typeof Orbit; key: string }[] = [
  { id: 'orbit', label: 'Orbit', icon: Orbit, key: '1' },
  { id: 'walk', label: 'Eye level', icon: Footprints, key: '2' },
  { id: 'plan', label: 'Plan', icon: MapIcon, key: '3' },
];

export function ViewBar() {
  const mode = useStore((s) => s.mode);
  const fov = useStore((s) => s.fov);
  const design = useDesign();
  const vps = viewpoints(design);
  const lensMm = Math.round(12 / Math.tan((fov * Math.PI) / 360)); // full-frame equivalent (24mm sensor height)
  return (
    <div className="viewbar">
      <AnimatePresence>
        {mode === 'walk' && (
          <motion.div
            className="walkbar glass"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={spring}
          >
            <div className="walk-hint">
              <span>
                <span className="kbd">W</span>
                <span className="kbd">A</span>
                <span className="kbd">S</span>
                <span className="kbd">D</span> walk
              </span>
              <span>drag to look</span>
              <span>double-click to go</span>
            </div>
            {vps.map((v) => (
              <button key={v.id} className="chip" onClick={() => cameraApi.goto(v)}>
                {v.label}
              </button>
            ))}
            <div className="lens">
              <span>{lensMm}mm</span>
              <input
                type="range"
                min={28}
                max={90}
                step={1}
                value={120 - fov}
                style={{ ['--pct' as string]: `${((120 - fov - 28) / 62) * 100}%` }}
                onChange={(e) => useStore.setState({ fov: 120 - Number(e.currentTarget.value) })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div className="viewbar-main glass" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }}>
        <div className="view-seg">
          {VIEWS.map((v) => (
            <button key={v.id} className={mode === v.id ? 'active' : ''} onClick={() => useStore.getState().setMode(v.id)}>
              {mode === v.id && <motion.span layoutId="view-pill" className="view-pill" transition={spring} />}
              <v.icon size={16} strokeWidth={1.9} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function Status() {
  const [pending, setPending] = useState(textureActivity.pending);
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    const l = (n: number) => setPending(n);
    textureActivity.listeners.add(l);
    return () => {
      textureActivity.listeners.delete(l);
    };
  }, []);
  return (
    <>
      <AnimatePresence>
        {pending > 0 && (
          <motion.div className="status glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring}>
            <span className="spinner" /> Firing tiles & finishes…
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 10, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 6, x: '-50%' }} transition={spring}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function Hints() {
  const mode = useStore((s) => s.mode);
  const selected = useStore((s) => s.selectedId);
  const editMode = useStore((s) => s.editMode);
  if (mode === 'walk') return null;
  return (
    <motion.div className="hints glass" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
      {selected ? (
        <>
          <span>{editMode ? <><b>Drag</b> to move</> : <>Turn on <b>Edit</b> to move</>}</span>
          <span>
            <span className="kbd">R</span> rotate
          </span>
          <span>
            <span className="kbd">⌫</span> remove
          </span>
        </>
      ) : (
        <>
          <span>
            <b>Drag</b> to orbit
          </span>
          <span>
            <b>Right-drag</b> to pan
          </span>
          <span>
            <b>Click</b> anything to edit
          </span>
        </>
      )}
    </motion.div>
  );
}
