import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatFtIn, formatIn, parseLength } from '../lib/units';

export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

export function Section({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="section">
      {title && (
        <div className="section-title">
          <span>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div>
        <div className="field-label">{label}</div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Feet-and-inches input. Accepts 8′4½″, 8' 4.5", 100.5, 100 1/2… Arrow keys nudge by ½″ (shift: 1″). */
export function LengthInput({
  value,
  onChange,
  min = 0,
  max = 2000,
  inchesOnly,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  inchesOnly?: boolean;
  className?: string;
}) {
  const fmt = (v: number) => (inchesOnly ? formatIn(v) : formatFtIn(v));
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inchesOnly]);
  const commit = (t: string) => {
    const v = parseLength(t);
    if (v === null || v < min || v > max) {
      setBad(true);
      setTimeout(() => setBad(false), 700);
      setText(fmt(value));
      return;
    }
    onChange(v);
    setText(fmt(v));
  };
  return (
    <div className={`length-input ${className ?? ''}`}>
      <input
        className={`input ${bad ? 'bad' : ''}`}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.currentTarget.value);
        }}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(value));
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const step = e.shiftKey ? 1 : 0.5;
            const v = Math.min(max, Math.max(min, value + (e.key === 'ArrowUp' ? step : -step)));
            onChange(v);
            setText(fmt(v));
          }
        }}
        spellCheck={false}
      />
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}>
      <span className="knob" />
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  className,
  onStart,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => ReactNode;
  onChange: (v: number) => void;
  className?: string;
  onStart?: () => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider-top">
        <span className="field-label">{label}</span>
        <span className="slider-value">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className={className}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${pct}%` }}
        onPointerDown={onStart}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={spring} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <select className={`select ${className ?? ''}`} value={value} onChange={(e) => onChange(e.currentTarget.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorWell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="color" className="color-well" value={value} onChange={(e) => onChange(e.currentTarget.value)} />;
}

export function PanelShell({ title, sub, children, right, onClose }: { title: ReactNode; sub?: ReactNode; children: ReactNode; right?: boolean; onClose?: () => void }) {
  return (
    <motion.div
      className={`panel glass ${right ? 'right' : ''}`}
      initial={{ opacity: 0, x: right ? 18 : -18, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: right ? 18 : -18, scale: 0.985, transition: { duration: 0.16 } }}
      transition={spring}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="panel-head">
        <div>
          <div className="panel-title">{title}</div>
          {sub && <div className="panel-sub">{sub}</div>}
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <motion.div
        className="panel-body"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export const staggerItem = {
  variants: { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: spring } },
};

export function Stagger({ children }: { children: ReactNode }) {
  return <motion.div {...staggerItem}>{children}</motion.div>;
}
