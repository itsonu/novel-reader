// Light / dark / follow-the-system.
//
// The preference is stored; the resolved theme is what's on <html data-theme>.
// The inline boot script (app/layout.tsx) resolves it before first paint, which
// is the only way a static page avoids a flash of the wrong theme — by the time
// React hydrates, the page has already been drawn.
//
// No 'use client': BOOT_SCRIPT is rendered by the server layout.

import { READING_BOOT } from './reading';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'nr:theme';
const EVENT = 'nr:theme';
const QUERY = '(prefers-color-scheme: light)';
/** Browser chrome colour per theme — matches --bg in tokens.css. */
export const THEME_COLOR: Record<Theme, string> = { light: '#f5f0e6', dark: '#1c1a17' };

export function getThemePref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
}

export const systemTheme = (): Theme => (matchMedia(QUERY).matches ? 'light' : 'dark');
export const resolveTheme = (p: ThemePref): Theme => (p === 'system' ? systemTheme() : p);
export const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

function paint(t: Theme) {
  const d = document.documentElement;
  d.dataset.theme = t;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = THEME_COLOR[t];
}

/** Change theme as one crossfade. The View Transitions API snapshots the page
 *  and fades the whole image; without it, a short class-scoped transition. */
export function applyTheme(t: Theme, animate = true) {
  if (currentTheme() === t && document.documentElement.dataset.theme) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!animate || reduce) { paint(t); return; }
  if (doc.startViewTransition) { doc.startViewTransition(() => paint(t)); return; }
  const d = document.documentElement;
  d.classList.add('theme-fade');
  paint(t);
  window.setTimeout(() => d.classList.remove('theme-fade'), 320);
}

export function setThemePref(p: ThemePref) {
  try {
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch { /* still applied for this visit */ }
  applyTheme(resolveTheme(p));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

/** Subscribe to preference changes and, while following the system, to the OS flipping. */
export function watchTheme(fn: (p: ThemePref) => void) {
  const onPref = (e: Event) => fn((e as CustomEvent<ThemePref>).detail);
  const mq = matchMedia(QUERY);
  const onSystem = () => {
    if (getThemePref() !== 'system') return;
    applyTheme(systemTheme());
    fn('system');
  };
  window.addEventListener(EVENT, onPref);
  mq.addEventListener('change', onSystem);
  return () => { window.removeEventListener(EVENT, onPref); mq.removeEventListener('change', onSystem); };
}

/** Runs in <head> before the body is parsed. Kept tiny and dependency-free. */
export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement;
var t=localStorage.getItem(${JSON.stringify(KEY)});
if(t!=='light'&&t!=='dark')t=matchMedia(${JSON.stringify(QUERY)}).matches?'light':'dark';
d.dataset.theme=t;
var m=document.createElement('meta');m.name='theme-color';m.content=t==='light'?${JSON.stringify(THEME_COLOR.light)}:${JSON.stringify(THEME_COLOR.dark)};document.head.appendChild(m);
${READING_BOOT}
}catch(e){}})();`;
