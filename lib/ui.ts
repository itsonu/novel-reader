'use client';
// Small UI behaviours shared by every overlay: mount-through-exit, focus trapping and
// restoration, scroll lock. Each overlay used to carry its own copy of some of these,
// and each copy was missing a different piece.

import { useEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keeps an overlay mounted long enough to play its exit.
 * `closing` is true for the exit window; style the exit off `[data-closing]`.
 */
export function usePresence(open: boolean, exitMs = 180) {
  // Mounted is derived, not stored: on the render where `open` flips true the overlay
  // must already be in the tree, or anything keyed on `open` (focus, scroll lock) runs
  // against a panel that doesn't exist yet.
  const [lingering, setLingering] = useState(false);
  const was = useRef(open);
  useEffect(() => {
    const before = was.current;
    was.current = open;
    if (open) { setLingering(false); return; }
    if (!before) return;
    if (reduced()) return;
    setLingering(true);
    const t = window.setTimeout(() => setLingering(false), exitMs);
    return () => window.clearTimeout(t);
  }, [open, exitMs]);
  return { mounted: open || lingering, closing: !open && lingering };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);

/**
 * Modal focus contract: move focus in on open ([data-autofocus] first, else the first
 * control), keep Tab inside, give focus back to whatever opened it on close, lock the
 * page scroll underneath, and close on Escape.
 */
export function useModal(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onEscape?: () => void,
  opts: { lockScroll?: boolean } = {}
) {
  const esc = useRef(onEscape);
  esc.current = onEscape;
  const lock = opts.lockScroll ?? true;

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const root = ref.current;
    requestAnimationFrame(() => {
      if (!root || root.contains(document.activeElement)) return;
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0] ?? root;
      target.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && esc.current) { e.preventDefault(); e.stopPropagation(); esc.current(); return; }
      if (e.key !== 'Tab' || !root) return;
      const list = focusables(root);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    // Capture phase, so the page's own shortcuts never see a key meant for the dialog.
    window.addEventListener('keydown', onKey, true);

    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (lock) document.body.style.overflow = prev;
      if (restore && document.contains(restore)) restore.focus({ preventScroll: true });
    };
  }, [open, ref, lock]);
}

/** True while the user is typing somewhere a shortcut must not fire. */
export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || t.matches('input, textarea, select')));
};

/** "3 min ago", tuned for a reading log rather than a clock. */
export function ago(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  return d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Human reading time: "12 min", "2 hr 5 min". */
export function readTime(words: number, wpm = 238): string {
  const m = Math.max(1, Math.round(words / wpm));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
