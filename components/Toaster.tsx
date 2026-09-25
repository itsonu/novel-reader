'use client';
// Transient confirmations, with an Undo where one makes sense.
//
// A module-level queue rather than a context: anything can call toast() — a library
// write, a chapter delete two screens back — without being inside a provider, and the
// one <Toaster/> in the root layout survives client navigation, so a toast raised
// just before router.push() is still on screen after it.

import { useEffect, useState, useSyncExternalStore } from 'react';
import Icon from './Icon';

export type Toast = {
  id: number;
  message: string;
  tone?: 'default' | 'ok' | 'err';
  action?: { label: string; onClick: () => void };
  /** ms; errors and anything with an action stay longer. */
  duration?: number;
};

let queue: (Toast & { leaving?: boolean })[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
let nextId = 1;

export function toast(t: Omit<Toast, 'id'>): number {
  const id = nextId++;
  queue = [...queue.slice(-2), { ...t, id }];   // three on screen, at most
  emit();
  return id;
}

export function dismissToast(id: number) {
  if (!queue.some(t => t.id === id && !t.leaving)) return;
  queue = queue.map(t => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  window.setTimeout(() => { queue = queue.filter(t => t.id !== id); emit(); }, 200);
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => queue;
const empty: typeof queue = [];

function Item({ t }: { t: Toast & { leaving?: boolean } }) {
  const [paused, setPaused] = useState(false);
  const ms = t.duration ?? (t.action || t.tone === 'err' ? 6500 : 3200);

  useEffect(() => {
    if (paused || t.leaving) return;
    const h = window.setTimeout(() => dismissToast(t.id), ms);
    return () => window.clearTimeout(h);
  }, [paused, t.id, t.leaving, ms]);

  return (
    <li
      className="toast"
      data-tone={t.tone ?? 'default'}
      data-leaving={t.leaving || undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {t.tone === 'ok' && <Icon name="check" size={17} />}
      {t.tone === 'err' && <Icon name="alert" size={17} />}
      <span className="msg">{t.message}</span>
      {t.action && (
        <button
          className="act"
          onClick={() => { t.action!.onClick(); dismissToast(t.id); }}
        >
          {t.action.label === 'Undo' && <Icon name="undo" size={15} />}
          {t.action.label}
        </button>
      )}
      <button className="x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}

export default function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <>
      {/* Always in the DOM, so screen readers have a live region to listen to before
          the first toast arrives — a region created *with* its message is often missed. */}
      <ol className="toaster" aria-live="polite" aria-relevant="additions" aria-label="Notifications">
        {list.map(t => <Item key={t.id} t={t} />)}
      </ol>
      <style jsx>{`
        .toaster {
          position: fixed; z-index: var(--z-toast); left: 50%; bottom: calc(var(--toast-offset, 1.25rem) + env(safe-area-inset-bottom, 0px));
          transform: translateX(-50%); width: min(26rem, calc(100vw - 2rem));
          list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3);
          pointer-events: none;
        }
        .toaster :global(.toast) {
          pointer-events: auto;
          display: flex; align-items: center; gap: var(--s-3);
          min-height: 3rem; padding: var(--s-2) var(--s-2) var(--s-2) var(--s-5);
          background: var(--surface-2); color: var(--ink);
          border-radius: var(--r-lg); box-shadow: var(--shadow-3);
          font-size: var(--t-callout);
          animation: toast-in var(--dur-3) var(--ease-spring) both;
        }
        .toaster :global(.toast[data-leaving]) { animation: toast-out var(--dur-2) var(--ease-out) both; }
        .toaster :global(.toast[data-tone='ok'] > svg) { color: var(--ok); flex: none; }
        .toaster :global(.toast[data-tone='err'] > svg) { color: var(--err); flex: none; }
        .toaster :global(.msg) { flex: 1; min-width: 0; line-height: 1.35; padding: var(--s-2) 0; }
        .toaster :global(.act) {
          flex: none; display: inline-flex; align-items: center; gap: var(--s-2);
          min-height: 2.25rem; padding: 0 var(--s-4); border: 0; border-radius: var(--r-md);
          background: var(--accent-soft); color: var(--accent); font-weight: 600; cursor: pointer;
          transition: background-color var(--dur-2), transform var(--dur-1);
        }
        .toaster :global(.act:hover) { background: color-mix(in oklab, var(--accent) 22%, transparent); }
        .toaster :global(.act:active) { transform: scale(0.96); }
        .toaster :global(.x) {
          flex: none; display: grid; place-items: center; width: 2.25rem; height: 2.25rem;
          border: 0; border-radius: var(--r-round); background: transparent; color: var(--ink-3); cursor: pointer;
        }
        .toaster :global(.x:hover) { background: var(--fill); color: var(--ink); }
        @keyframes toast-in {
          from { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.97); }
          to { opacity: 1; transform: none; }
        }
        @keyframes toast-out { to { opacity: 0; transform: translate3d(0, 6px, 0) scale(0.98); } }
        /* Sit above the reader's transport rather than on top of it. */
        :global(body:has(.player)) .toaster { --toast-offset: 6.75rem; }
        @media (max-width: 40rem) { :global(body:has(nav.tabbar)) .toaster { --toast-offset: 4.75rem; } }
      `}</style>
    </>
  );
}
