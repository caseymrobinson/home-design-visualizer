import { motion } from 'motion/react';
import { CATALOG, type CatalogEntry } from '../lib/catalog';
import { formatIn } from '../lib/units';
import { useStore } from '../store';
import { addFromCatalog } from './actions';
import { ITEM_ICONS } from './icons';
import { PanelShell, Section, staggerItem } from './primitives';

const ORDER: CatalogEntry['category'][] = ['Fixtures', 'Storage', 'Lighting', 'Electrical', 'Accessories', 'Decor'];

export function AddPanel() {
  return (
    <PanelShell title="Add to the room" sub="Everything is built to real dimensions. Click to add, then drag it into place — it snaps to walls and corners." onClose={() => useStore.getState().setPanel(null)}>
      {ORDER.map((cat) => (
        <motion.div key={cat} {...staggerItem}>
          <Section title={cat}>
            <div className="catalog">
              {CATALOG.filter((c) => c.category === cat).map((c) => {
                const Icon = ITEM_ICONS[c.type];
                const size = c.dims.includes('w') || c.dims.includes('d') ? `${formatIn(c.defaults.w)} × ${formatIn(c.defaults.d)}` : c.mount === 'ceiling' ? 'Ceiling' : 'Standard';
                return (
                  <motion.button key={c.type} className="cat-card" whileTap={{ scale: 0.97 }} onClick={() => addFromCatalog(c.type)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="cat-icon">{Icon && <Icon size={18} strokeWidth={1.7} />}</div>
                      <span className="cat-size">{size}</span>
                    </div>
                    <div>
                      <div className="cat-name">{c.label}</div>
                      <div className="cat-blurb">{c.blurb}</div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </Section>
        </motion.div>
      ))}
    </PanelShell>
  );
}
