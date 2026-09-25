import { motion } from 'motion/react';
import { Copy, FileDown, FileUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Design } from '../lib/types';
import { useStore } from '../store';
import { PanelShell, Section, staggerItem } from './primitives';

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export function OptionsPanel() {
  const designs = useStore((s) => s.designs);
  const activeId = useStore((s) => s.activeId);
  const [editing, setEditing] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const st = useStore.getState();
  const active = designs.find((d) => d.id === activeId)!;

  return (
    <PanelShell title="Design options" sub="Try different directions side by side. Everything saves automatically in this browser." onClose={() => st.setPanel(null)}>
      <motion.div {...staggerItem}>
        <Section
          title="Options"
          action={
            <button className="link" onClick={() => st.newDesign(true)}>
              <Plus size={12} /> New from current
            </button>
          }
        >
          {designs.map((d, i) => (
            <motion.div layout key={d.id} className={`design-list-item ${d.id === activeId ? 'active' : ''}`} onClick={() => st.switchDesign(d.id)}>
              <div className="design-thumb" style={{ background: d.finishes.wallPaint }}>
                {String.fromCharCode(65 + i)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing === d.id ? (
                  <input
                    className="input"
                    autoFocus
                    defaultValue={d.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      st.renameDesign(d.id, e.currentTarget.value || d.name);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                  />
                ) : (
                  <div
                    style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditing(d.id);
                    }}
                    title="Double-click to rename"
                  >
                    {d.name}
                  </div>
                )}
                <div className="tile-meta">
                  {d.items.length} pieces · edited {ago(d.updatedAt)}
                </div>
              </div>
              {designs.length > 1 && (
                <button
                  className="icon-btn danger"
                  style={{ width: 28, height: 28 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete “${d.name}”?`)) st.deleteDesign(d.id);
                  }}
                  aria-label="Delete option"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </Section>
      </motion.div>
      <motion.div {...staggerItem}>
        <Section title="This option">
          <div className="btn-row">
            <button className="chip" onClick={() => setEditing(activeId)}>
              Rename
            </button>
            <button className="chip" onClick={() => st.newDesign(true)}>
              <Copy size={14} /> Duplicate
            </button>
            <button
              className="chip"
              onClick={() => {
                const blob = new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${active.name.replace(/[^\w\- ]+/g, '').trim() || 'bathroom'}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <FileDown size={14} /> Export
            </button>
            <button className="chip" onClick={() => file.current?.click()}>
              <FileUp size={14} /> Import
            </button>
            <button
              className="chip"
              onClick={() => {
                if (confirm('Reset this option to the starting layout? (You can undo.)')) st.resetDesign();
              }}
            >
              <RotateCcw size={14} /> Reset layout
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              try {
                const d = JSON.parse(await f.text()) as Design;
                if (!d.room?.corners || !Array.isArray(d.items)) throw new Error('bad file');
                st.importDesign({ ...d, name: `${d.name} (imported)` });
                st.notify('Design imported');
              } catch {
                st.notify('That file isn’t a Bath Studio design');
              }
              e.currentTarget.value = '';
            }}
          />
        </Section>
      </motion.div>
    </PanelShell>
  );
}
