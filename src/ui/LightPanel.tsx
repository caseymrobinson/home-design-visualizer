import { motion } from 'motion/react';
import { Cloud, LampCeiling, LampWallUp, Sun } from 'lucide-react';
import { useRef } from 'react';
import type { Design, Lighting } from '../lib/types';
import { kelvinToHex } from '../materials/library';
import { useDesign, useStore } from '../store';
import { Field, PanelShell, Section, Slider, staggerItem, Toggle } from './primitives';

const fmtTime = (t: number) => {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

function SunArc({ time }: { time: number }) {
  const t = (time - 5) / 16;
  const x = 12 + t * 276;
  const up = Math.sin(((time - 6) / 12) * Math.PI);
  const y = 70 - Math.max(-0.15, up) * 56;
  const day = up > 0;
  return (
    <svg className="sun-arc" viewBox="0 0 300 84">
      <defs>
        <linearGradient id="skyg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={day ? '#dbe7f3' : '#2f3a55'} />
          <stop offset="1" stopColor={day ? '#f6ead8' : '#5b5470'} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="300" height="72" rx="12" fill="url(#skyg)" style={{ transition: 'fill 0.6s' }} />
      <path d="M12 70 Q150 -42 288 70" fill="none" stroke="rgba(30,26,22,0.18)" strokeDasharray="3 4" />
      <line x1="0" x2="300" y1="70" y2="70" stroke="rgba(30,26,22,0.18)" />
      <g className="sun-dot" style={{ transform: `translate(${x}px, ${y}px)` }}>
        <circle r="14" fill={day ? '#ffd28a' : '#e9e6f5'} opacity="0.35" />
        <circle r="7.5" fill={day ? '#f6b04e' : '#e9e6f5'} />
      </g>
      <text x="12" y="82" className="plan-dim">
        5am
      </text>
      <text x="150" y="82" className="plan-dim" textAnchor="middle">
        noon
      </text>
      <text x="288" y="82" className="plan-dim" textAnchor="end">
        9pm
      </text>
    </svg>
  );
}

function Compass({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = (e: React.PointerEvent) => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const a = (Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
      onChange(Math.round(((a % 360) + 360) % 360 / 15) * 15);
    };
    move(e.nativeEvent);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="compass" ref={ref} onPointerDown={drag} title="Drag to set which way is north on the plan">
      <div className="compass-needle" style={{ transform: `rotate(${angle}deg)` }}>
        <svg viewBox="0 0 52 52" width="100%" height="100%">
          <path d="M26 4 L31 26 L26 23 L21 26 Z" fill="var(--accent)" />
          <path d="M26 48 L31 26 L26 29 L21 26 Z" fill="rgba(30,26,22,0.25)" />
          <text x="26" y="-1" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--ink)" transform="translate(0,11)">
            N
          </text>
        </svg>
      </div>
    </div>
  );
}

export function LightPanel() {
  const design = useDesign();
  const L = design.lighting;
  const upd = (patch: Partial<Lighting>, record = false) => useStore.getState().update((d: Design) => void Object.assign(d.lighting, patch), record);
  const checkpoint = () => useStore.getState().checkpoint();
  return (
    <PanelShell title="Light" sub="Daylight follows the sun through your window; fixtures use real lumens and color temperature." onClose={() => useStore.getState().setPanel(null)}>
      <motion.div {...staggerItem}>
        <Section title="Daylight" action={<Toggle on={L.daylight} onChange={(v) => upd({ daylight: v }, true)} />}>
          <SunArc time={L.time} />
          <Slider label="Time of day" className="sun" value={L.time} min={5} max={21} step={0.25} format={fmtTime} onStart={checkpoint} onChange={(v) => upd({ time: v })} />
          <Field label={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Cloud size={14} /> Overcast</span>}>
            <Toggle on={L.overcast} onChange={(v) => upd({ overcast: v }, true)} />
          </Field>
          <div className="field" style={{ marginTop: 8 }}>
            <div>
              <div className="field-label">Orientation</div>
              <div className="field-hint" style={{ maxWidth: 190, lineHeight: 1.4 }}>
                Point north the way it is on your plan so morning and evening sun land right.
              </div>
            </div>
            <Compass angle={L.northAngle} onChange={(a) => upd({ northAngle: a })} />
          </div>
        </Section>
      </motion.div>

      <motion.div {...staggerItem}>
        <Section title="Fixtures">
          <Field label={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><LampWallUp size={14} /> Sconces</span>}>
            <Toggle on={L.sconces} onChange={(v) => upd({ sconces: v }, true)} />
          </Field>
          <Field label={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><LampCeiling size={14} /> Ceiling lights</span>}>
            <Toggle on={L.ceiling} onChange={(v) => upd({ ceiling: v }, true)} />
          </Field>
          <Slider label="Dimmer" value={L.dimmer} min={0.05} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onStart={checkpoint} onChange={(v) => upd({ dimmer: v })} />
          <Slider
            label={
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                Color temperature <span style={{ width: 10, height: 10, borderRadius: 5, background: kelvinToHex(L.kelvin), boxShadow: '0 0 0 1px rgba(0,0,0,.1)' }} />
              </span>
            }
            className="kelvin"
            value={L.kelvin}
            min={2200}
            max={5000}
            step={100}
            format={(v) => `${v}K`}
            onStart={checkpoint}
            onChange={(v) => upd({ kelvin: v })}
          />
        </Section>
      </motion.div>

      <motion.div {...staggerItem}>
        <Section title="Camera">
          <Slider
            label={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Sun size={14} /> Exposure</span>}
            value={L.exposure}
            min={-2}
            max={2}
            step={0.1}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`}
            onStart={checkpoint}
            onChange={(v) => upd({ exposure: v })}
          />
          <div className="note">Exposure meters automatically like a camera. Nudge it if you want the room to read brighter or moodier.</div>
        </Section>
      </motion.div>
    </PanelShell>
  );
}
