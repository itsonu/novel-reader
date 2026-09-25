'use client';
// "Aa": how the page looks. Appearance, type size, face, leading, measure. Every change
// applies live — the panel sits beside the text it's changing, so you see the result
// rather than guessing at it.

import { useEffect, useState } from 'react';
import Sheet from './Sheet';
import Icon from './Icon';
import { ThemeSegmented } from './ThemeMenu';
import {
  loadReading, onReading, saveReading, SIZE_MAX, SIZE_MIN, SIZE_STEP, DEFAULT_READING,
  type Face, type Leading, type ReadingPrefs, type Width
} from '@/lib/reading';

const FACES: { id: Face; label: string; sample: string }[] = [
  { id: 'serif', label: 'Book', sample: 'var(--font-serif)' },
  { id: 'sans', label: 'Sans', sample: 'var(--font-ui)' },
  { id: 'legible', label: 'Legible', sample: 'var(--font-legible)' }
];
const LEADINGS: { id: Leading; label: string }[] = [
  { id: 'compact', label: 'Compact' }, { id: 'normal', label: 'Normal' }, { id: 'relaxed', label: 'Relaxed' }
];
const WIDTHS: { id: Width; label: string }[] = [
  { id: 'narrow', label: 'Narrow' }, { id: 'normal', label: 'Normal' }, { id: 'wide', label: 'Wide' }
];

export function useReadingPrefs(): [ReadingPrefs, (p: Partial<ReadingPrefs>) => void] {
  const [p, setP] = useState<ReadingPrefs>(DEFAULT_READING);
  useEffect(() => { setP(loadReading()); return onReading(setP); }, []);
  return [p, patch => setP(saveReading({ ...loadReading(), ...patch }))];
}

export default function ReadingSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, set] = useReadingPrefs();
  const pct = Math.round((p.size / DEFAULT_READING.size) * 100);

  return (
    <Sheet open={open} onClose={onClose} title="Reading" placement="top">
      <div className="panel">
        <section>
          <h3 className="lbl">Appearance</h3>
          <ThemeSegmented />
        </section>

        <section>
          <h3 className="lbl">
            Text size <span className="val mono">{pct}%</span>
          </h3>
          <div className="size">
            <button
              className="icon-btn" aria-label="Smaller text" disabled={p.size <= SIZE_MIN}
              onClick={() => set({ size: p.size - SIZE_STEP })}
            >
              <span className="a sm" aria-hidden>A</span>
            </button>
            <input
              type="range" min={SIZE_MIN} max={SIZE_MAX} step={SIZE_STEP} value={p.size}
              onChange={e => set({ size: parseFloat(e.target.value) })}
              aria-label="Text size" aria-valuetext={`${pct}%`}
            />
            <button
              className="icon-btn" aria-label="Larger text" disabled={p.size >= SIZE_MAX}
              onClick={() => set({ size: p.size + SIZE_STEP })}
            >
              <span className="a lg" aria-hidden>A</span>
            </button>
          </div>
        </section>

        <section>
          <h3 className="lbl">Typeface</h3>
          <div className="faces" role="radiogroup" aria-label="Typeface">
            {FACES.map(f => (
              <button key={f.id} role="radio" aria-checked={p.font === f.id} className="face" onClick={() => set({ font: f.id })}>
                <span className="sample" style={{ fontFamily: f.sample }} aria-hidden>Ag</span>
                <span className="caption">{f.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="lbl">Line spacing</h3>
          <div className="seg" role="radiogroup" aria-label="Line spacing">
            {LEADINGS.map(l => (
              <button key={l.id} role="radio" aria-checked={p.leading === l.id} onClick={() => set({ leading: l.id })}>{l.label}</button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="lbl">Line length</h3>
          <div className="seg" role="radiogroup" aria-label="Line length">
            {WIDTHS.map(w => (
              <button key={w.id} role="radio" aria-checked={p.width === w.id} onClick={() => set({ width: w.id })}>{w.label}</button>
            ))}
          </div>
        </section>

        <section className="row">
          <span className="rowlbl">
            Justify text
            <span className="caption">Even edges, with hyphenation</span>
          </span>
          <button className="switch" role="switch" aria-checked={p.justify} aria-label="Justify text" onClick={() => set({ justify: !p.justify })}><i /></button>
        </section>

        <button className="btn reset" data-variant="ghost" data-size="sm" onClick={() => set(DEFAULT_READING)}>
          <Icon name="undo" size={15} /> Reset to defaults
        </button>
      </div>

      <style jsx>{`
        .panel { display: grid; gap: var(--s-6); padding: var(--s-2) var(--s-2) var(--s-3); }
        section { display: grid; gap: var(--s-3); }
        .lbl {
          display: flex; justify-content: space-between; margin: 0;
          font-size: var(--t-caption); font-weight: 600; color: var(--ink-2);
        }
        .val { color: var(--ink-3); font-weight: 500; }
        section :global(.seg) { display: flex; width: 100%; }
        .size { display: flex; align-items: center; gap: var(--s-3); }
        .size input { flex: 1; min-width: 0; accent-color: var(--accent); height: 1.75rem; }
        .a { font-family: var(--font-serif); line-height: 1; color: var(--ink); }
        .a.sm { font-size: 0.85rem; }
        .a.lg { font-size: 1.35rem; }
        .faces { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-3); }
        .face {
          display: grid; justify-items: center; gap: var(--s-1); padding: var(--s-4) var(--s-2) var(--s-3);
          border-radius: var(--r-md); border: 1px solid var(--rule); background: transparent; cursor: pointer;
          transition: border-color var(--dur-2), background-color var(--dur-2), transform var(--dur-1) var(--ease-spring);
        }
        .face:hover { border-color: var(--rule-strong); }
        .face:active { transform: scale(0.97); }
        .face[aria-checked='true'] { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent) inset; }
        .sample { font-size: 1.6rem; line-height: 1.1; color: var(--ink); }
        .row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); }
        .rowlbl { display: grid; gap: 0.1rem; font-size: var(--t-callout); font-weight: 500; }
        .panel :global(.reset) { justify-self: start; margin-left: calc(var(--s-3) * -1); }
      `}</style>
    </Sheet>
  );
}
