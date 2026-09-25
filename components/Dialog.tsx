'use client';
// The app's one modal dialog. Centered card on wide screens, a bottom-anchored card on
// phones (where a thumb can reach its buttons). Owns the whole modal contract through
// useModal — focus in, Tab trapped, focus restored, Escape, scroll lock — and plays an
// exit instead of vanishing.

import { useId, useRef } from 'react';
import { useModal, usePresence } from '@/lib/ui';
import Icon from './Icon';

export default function Dialog({
  open, onClose, title, description, children, footer, size = 'sm', dismissable = true
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md';
  /** False for a dialog that must be answered (no scrim click, no close button). */
  dismissable?: boolean;
}) {
  const { mounted, closing } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useModal(panel, open, onClose);

  if (!mounted) return null;

  return (
    <div className="root" data-closing={closing || undefined}>
      <div className="scrim" aria-hidden onClick={dismissable ? onClose : undefined} />
      <div
        ref={panel}
        className="panel"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
      >
        <header>
          <h2 id={`${id}-t`} className="title-3">{title}</h2>
          {dismissable && (
            <button className="icon-btn" data-size="sm" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          )}
        </header>
        {description && <div id={`${id}-d`} className="desc">{description}</div>}
        {children && <div className="content">{children}</div>}
        {footer && <div className="foot">{footer}</div>}
      </div>

      <style jsx>{`
        .root {
          position: fixed; inset: 0; z-index: var(--z-sheet);
          display: grid; place-items: center; padding: var(--s-5);
          padding-bottom: max(var(--s-5), env(safe-area-inset-bottom));
        }
        .scrim {
          position: absolute; inset: 0; background: var(--scrim);
          backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
          animation: fade-in var(--dur-2) var(--ease-out) both;
        }
        .panel {
          position: relative; width: min(26rem, 100%); max-height: calc(100dvh - 2rem); overflow: auto;
          background: var(--surface-2); border-radius: var(--r-xl);
          box-shadow: var(--shadow-3); padding: var(--s-6);
          display: grid; gap: var(--s-4); outline: none;
          animation: pop-in var(--dur-3) var(--ease-spring) both;
        }
        .panel[data-size='md'] { width: min(34rem, 100%); }
        [data-closing] .scrim { animation: fade-out var(--dur-2) var(--ease-out) both; }
        [data-closing] .panel { animation: pop-out var(--dur-2) var(--ease-out) both; }
        header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-4); }
        header h2 { margin: 0.35rem 0 0; }
        header :global(.icon-btn) { margin: -0.25rem -0.5rem 0 0; }
        .desc { color: var(--ink-2); font-size: var(--t-callout); line-height: 1.55; }
        .desc :global(p) { margin: 0; }
        .content { display: grid; gap: var(--s-5); }
        .foot { display: flex; gap: var(--s-3); justify-content: flex-end; flex-wrap: wrap; margin-top: var(--s-2); }

        @media (max-width: 40rem) {
          .root { place-items: end center; padding: var(--s-3); padding-bottom: max(var(--s-3), env(safe-area-inset-bottom)); }
          .panel { width: 100%; padding: var(--s-6) var(--s-5) var(--s-5); animation-name: rise-in; }
          .panel[data-size='md'] { width: 100%; }
          [data-closing] .panel { animation-name: rise-out; }
          .foot { flex-direction: column-reverse; }
          .foot :global(.btn) { width: 100%; }
        }
        @keyframes fade-in { from { opacity: 0; } }
        @keyframes fade-out { to { opacity: 0; } }
        @keyframes pop-in { from { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.97); } }
        @keyframes pop-out { to { opacity: 0; transform: scale(0.98); } }
        @keyframes rise-in { from { opacity: 0; transform: translate3d(0, 24px, 0); } }
        @keyframes rise-out { to { opacity: 0; transform: translate3d(0, 16px, 0); } }
      `}</style>
    </div>
  );
}
