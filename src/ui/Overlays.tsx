import { AnimatePresence, motion } from 'motion/react';
import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { textureActivity } from '../materials/library';
import { useDesign, useStore } from '../store';
import { spring } from './primitives';

export function RenderOverlay() {
  const r = useStore((s) => s.render);
  const design = useDesign();
  const pct = Math.min(1, r.samples / r.target);

  useEffect(() => {
    if (!r.snapshot || r.snapshot === 'request') return;
    const a = document.createElement('a');
    a.href = r.snapshot;
    a.download = `${design.name.replace(/[^\w\- ]+/g, '').trim() || 'bathroom'} — render.png`;
    a.click();
    useStore.getState().setRender({ snapshot: null });
    useStore.getState().notify('Render saved');
  }, [r.snapshot, design.name]);

  useEffect(() => {
    if (!r.active) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && useStore.getState().setRender({ active: false });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [r.active]);

  return (
    <AnimatePresence>
      {r.active && (
        <motion.div
          className="render-card glass"
          initial={{ opacity: 0, y: -16, x: '-50%', scale: 0.97 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: -16, x: '-50%', scale: 0.97 }}
          transition={spring}
        >
          <svg className="ring" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(30,26,22,.1)" strokeWidth="3" />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              strokeDasharray={2 * Math.PI * 15}
              animate={{ strokeDashoffset: 2 * Math.PI * 15 * (1 - pct) }}
              transition={{ ease: 'linear', duration: 0.3 }}
            />
          </svg>
          <div className="render-progress">
            <div className="render-title">
              <span>
                {r.phase === 'building'
                  ? 'Preparing the scene…'
                  : r.phase === 'done'
                    ? 'Render complete'
                    : 'Path tracing light bounces…'}
              </span>
              <span>
                {r.samples} / {r.target} samples
              </span>
            </div>
            <div className="bar">
              <div style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          <button className="chip primary" onClick={() => useStore.getState().setRender({ snapshot: 'request' })} disabled={r.phase === 'building'}>
            <Download size={14} /> Save PNG
          </button>
          <button className="icon-btn" onClick={() => useStore.getState().setRender({ active: false })} aria-label="Close render">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Splash() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTimeout(() => setShow(false), 350);
    };
    const l = (n: number) => n === 0 && finish();
    textureActivity.listeners.add(l);
    const t = setTimeout(finish, 4500);
    return () => {
      textureActivity.listeners.delete(l);
      clearTimeout(t);
    };
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="splash" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }}>
          <motion.div className="splash-inner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            <div className="splash-title">Bath Studio</div>
            <div className="splash-sub">Setting tile, hanging mirrors, finding the light…</div>
            <div className="splash-line">
              <div />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
