// Reading preferences: size, leading, measure, face, justification.
//
// Stored as one JSON row and applied as CSS variables on <html>, so the prose,
// the chapter heading and the editor all follow the same settings without any
// of them being told. The inline boot script in app/layout.tsx applies the
// stored row before first paint — a reader who likes large type never sees one
// frame of small type first.
//
// No 'use client': the boot script's source is built from these tables on the server.

export type Leading = 'compact' | 'normal' | 'relaxed';
export type Width = 'narrow' | 'normal' | 'wide';
export type Face = 'serif' | 'sans' | 'legible';

export type ReadingPrefs = {
  /** Prose size in rem. */
  size: number;
  leading: Leading;
  width: Width;
  font: Face;
  justify: boolean;
};

export const SIZE_MIN = 0.95;
export const SIZE_MAX = 1.7;
export const SIZE_STEP = 0.0625;   // 1px at a 16px root

export const DEFAULT_READING: ReadingPrefs = {
  size: 1.1875, leading: 'normal', width: 'normal', font: 'serif', justify: false
};

export const LEADING: Record<Leading, number> = { compact: 1.5, normal: 1.68, relaxed: 1.86 };
/** Measure in ems of the prose size — so the line keeps its character count
 *  as the type grows, which is what a measure is. */
export const WIDTH: Record<Width, number> = { narrow: 27, normal: 31, wide: 37 };
export const FACE: Record<Face, string> = {
  serif: 'var(--font-serif)', sans: 'var(--font-ui)', legible: 'var(--font-legible)'
};

const KEY = 'nr:reading';
const EVENT = 'nr:reading';

const clampSize = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n / SIZE_STEP) * SIZE_STEP));

export function loadReading(): ReadingPrefs {
  if (typeof window === 'undefined') return DEFAULT_READING;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        size: clampSize(Number(raw.size) || DEFAULT_READING.size),
        leading: raw.leading in LEADING ? raw.leading : DEFAULT_READING.leading,
        width: raw.width in WIDTH ? raw.width : DEFAULT_READING.width,
        font: raw.font in FACE ? raw.font : DEFAULT_READING.font,
        justify: Boolean(raw.justify)
      };
    }
    // One-time migration from the single size key the reader used to keep.
    const legacy = parseFloat(localStorage.getItem('nr:size') ?? '');
    if (legacy) return { ...DEFAULT_READING, size: clampSize(legacy) };
  } catch { /* storage blocked */ }
  return DEFAULT_READING;
}

export function applyReading(p: ReadingPrefs) {
  const s = document.documentElement.style;
  s.setProperty('--prose', `${p.size}rem`);
  s.setProperty('--prose-leading', String(LEADING[p.leading]));
  s.setProperty('--measure', `${(WIDTH[p.width] * p.size).toFixed(3)}rem`);
  s.setProperty('--prose-font', FACE[p.font]);
  document.documentElement.dataset.justify = String(p.justify);
}

export function saveReading(p: ReadingPrefs) {
  const next = { ...p, size: clampSize(p.size) };
  applyReading(next);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* still applied for this visit */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return next;
}

export function onReading(fn: (p: ReadingPrefs) => void) {
  const h = (e: Event) => fn((e as CustomEvent<ReadingPrefs>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** The boot script's half of this file: the same tables, as plain JS. */
export const READING_BOOT = `
var r=JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||'null');
if(r){var L=${JSON.stringify(LEADING)},W=${JSON.stringify(WIDTH)},F=${JSON.stringify(FACE)},s=d.style,z=+r.size||${DEFAULT_READING.size};
s.setProperty('--prose',z+'rem');
if(L[r.leading])s.setProperty('--prose-leading',L[r.leading]);
s.setProperty('--measure',(W[r.width]||W.normal)*z+'rem');
if(F[r.font])s.setProperty('--prose-font',F[r.font]);
d.dataset.justify=String(!!r.justify);}`;
