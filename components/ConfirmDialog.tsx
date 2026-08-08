'use client';
// A real dialog for decisions that can destroy something. Replaces window.confirm(),
// which can't be styled, can't be read by the page's own voice, and on mobile looks
// like the browser is warning you about the site rather than the app asking a question.
//
// Deliberately not a Sheet: a sheet is for choosing, this is for stopping.

import { useEffect, useRef } from 'react';

export type Choice = { label: string; onPick: () => void; variant?: 'primary' | 'danger' };

export default function ConfirmDialog({
  open, title, body, choices, onDismiss
}: {
  open: boolean;
  title: string;
  body?: string;
  /** First choice is the safe one and takes focus — the dialog defaults to *not* losing work. */
  choices: Choice[];
  onDismiss: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    first.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDismiss(); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the dialog. Without this the focus ring walks off into the
      // page behind, which for a "you have unsaved work" prompt is worse than useless.
      const focusable = panel.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable?.length) return;
      const list = [...focusable];
      const edge = e.shiftKey ? list[0] : list[list.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? list[list.length - 1] : list[0]).focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      restore?.focus?.();
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="root" role="dialog" aria-modal="true" aria-labelledby="cd-title">
      <button className="scrim" aria-label="Dismiss" onClick={onDismiss} />
      <div className="panel" ref={panel}>
        <h2 id="cd-title" className="title">{title}</h2>
        {body && <p className="caption">{body}</p>}
        <div className="choices">
          {choices.map((c, i) => (
            <button
              key={c.label}
              ref={i === 0 ? first : undefined}
              className="btn"
              data-variant={c.variant === 'primary' ? 'primary' : undefined}
              data-danger={c.variant === 'danger' || undefined}
              onClick={c.onPick}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .root {
          position: fixed; inset: 0; z-index: var(--z-sheet);
          display: grid; place-items: center; padding: var(--s-5);
        }
        .scrim {
          position: absolute; inset: 0; border: 0; padding: 0;
          background: color-mix(in oklab, #000 62%, transparent);
          backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
          animation: fade var(--quick) both;
        }
        .panel {
          position: relative; width: min(24rem, 100%);
          background: var(--paper); border: 1px solid var(--rule);
          border-radius: var(--r-panel); padding: var(--s-6);
          box-shadow: var(--e-3);
          display: grid; gap: var(--s-3);
          animation: rise var(--settle) both;
        }
        .panel h2 { margin: 0; }
        .panel p { margin: 0; }
        .choices { display: grid; gap: var(--s-2); margin-top: var(--s-3); }
        .choices :global(.btn) { width: 100%; padding: var(--s-3) var(--s-4); font-size: 0.9rem; }
        .choices :global(.btn[data-danger]) { color: var(--err); }
        .choices :global(.btn[data-danger]:hover) { border-color: var(--err); background: var(--err-bg); }

        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rise {
          from { opacity: 0; transform: translateY(0.75rem) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        /* Reduced motion still gets the dialog, just without the entrance. */
        @media (prefers-reduced-motion: reduce) {
          .scrim, .panel { animation: none; }
        }
        @media (min-width: 30rem) {
          .choices { grid-auto-flow: column; justify-content: end; }
          .choices :global(.btn) { width: auto; }
        }
      `}</style>
    </div>
  );
}
