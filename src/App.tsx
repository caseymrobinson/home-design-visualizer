import { AnimatePresence, motion } from 'motion/react';
import { useStore } from './store';
import { Scene } from './three/Scene';
import { AddPanel } from './ui/AddPanel';
import { Dock, Hints, Status, TopBar, ViewBar } from './ui/Chrome';
import { FinishesPanel } from './ui/FinishesPanel';
import { Inspector } from './ui/Inspector';
import { LightPanel } from './ui/LightPanel';
import { OptionsPanel } from './ui/OptionsPanel';
import { RenderOverlay, Splash } from './ui/Overlays';
import { RoomPanel } from './ui/RoomPanel';
import { useShortcuts } from './ui/shortcuts';

const PANELS = {
  add: AddPanel,
  finishes: FinishesPanel,
  light: LightPanel,
  room: RoomPanel,
  designs: OptionsPanel,
};

export function App() {
  useShortcuts();
  const panel = useStore((s) => s.panel);
  const rendering = useStore((s) => s.render.active);
  const selectedId = useStore((s) => s.selectedId);
  const Panel = panel ? PANELS[panel] : null;
  return (
    <div className="app">
      <div className="canvas-wrap">
        <Scene />
      </div>
      <motion.div className={`ui-layer ${rendering ? 'rendering' : ''}`} animate={{ opacity: rendering ? 0 : 1 }} transition={{ duration: 0.4 }}>
        <TopBar />
        <Dock />
        <AnimatePresence mode="wait">{Panel && <Panel key={panel} />}</AnimatePresence>
        <AnimatePresence>{selectedId && <Inspector key={selectedId} />}</AnimatePresence>
        <ViewBar />
        <Hints />
        <Status />
      </motion.div>
      <div className="ui-layer">
        <RenderOverlay />
      </div>
      <Splash />
    </div>
  );
}
