'use client';
// A small action menu: one trigger, a popover of choices. Keyboard follows the ARIA
// menu-button pattern — Enter/Space/↓ opens onto the first item, ↑/↓ move, Home/End
// jump, Escape closes back onto the trigger, Tab leaves.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import { usePresence } from '@/lib/ui';

export type MenuItem =
  | { label: string; icon?: IconName; onSelect: () => void; tone?: 'danger'; hint?: string; disabled?: boolean; checked?: boolean }
  | { label: string; icon?: IconName; href: string; hint?: string }
  | 'sep';

export default function Menu({
  label, items, trigger, placement = 'bottom-end', className, iconOnly, variant
}: {
  /** Accessible name of the trigger. */
  label: string;
  items: MenuItem[];
  /** Trigger contents; defaults to a "more" icon. */
  trigger?: React.ReactNode;
  placement?: 'bottom-end' | 'bottom-start' | 'top-end';
  className?: string;
  /** The trigger is a glyph, so it needs the label as its accessible name. */
  iconOnly?: boolean;
  /** Button variant for a text trigger. */
  variant?: 'primary' | 'ghost' | 'tinted';
}) {
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open, 140);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const itemsEls = () => [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Open onto the current choice where there is one (a chapter switcher opens on
    // the chapter you're in), otherwise onto the first item.
    requestAnimationFrame(() => {
      const els = itemsEls();
      (els.find(e => e.getAttribute('aria-checked') === 'true') ?? els[0])?.focus();
    });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, close]);

  const onKey = (e: React.KeyboardEvent) => {
    const els = itemsEls();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <div className={`menu-root ${className ?? ''}`}>
      <button
        ref={btn}
        className={trigger && !iconOnly ? 'btn' : 'icon-btn'}
        data-variant={variant}
        aria-label={trigger && !iconOnly ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        {trigger ?? <Icon name="more" />}
      </button>

      {mounted && (
        <ul
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className="menu popover"
          data-placement={placement}
          data-closing={closing || undefined}
          onKeyDown={onKey}
        >
          {items.map((it, k) =>
            it === 'sep' ? (
              <li key={k} role="separator" className="menu-sep" />
            ) : (
              <li key={k} role="none">
                {'href' in it ? (
                  <Link href={it.href} role="menuitem" tabIndex={-1} className="menu-item" onClick={() => close(false)}>
                    {it.icon && <Icon name={it.icon} size={18} />}
                    <span className="grow">{it.label}</span>
                    {it.hint && <span className="caption">{it.hint}</span>}
                  </Link>
                ) : (
                  <button
                    role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={it.checked}
                    tabIndex={-1}
                    className="menu-item"
                    data-tone={it.tone}
                    aria-disabled={it.disabled || undefined}
                    onClick={() => { if (it.disabled) return; close(false); it.onSelect(); }}
                  >
                    {it.icon && <Icon name={it.icon} size={18} />}
                    <span className="grow">{it.label}</span>
                    {it.hint && <span className="caption">{it.hint}</span>}
                    {it.checked && <Icon name="check" size={16} className="tick" />}
                  </button>
                )}
              </li>
            )
          )}
        </ul>
      )}

      <style jsx>{`
        .menu-root { position: relative; display: inline-flex; }
        ul {
          position: absolute; z-index: var(--z-sheet); top: calc(100% + 6px); right: 0;
          max-height: min(60vh, 28rem); overflow-y: auto; overscroll-behavior: contain;
          transform-origin: top right;
          animation: menu-in var(--dur-2) var(--ease-spring) both;
        }
        ul[data-placement='bottom-start'] { right: auto; left: 0; transform-origin: top left; }
        ul[data-placement='top-end'] { top: auto; bottom: calc(100% + 6px); transform-origin: bottom right; }
        ul[data-closing] { animation: menu-out 140ms var(--ease-out) both; }
        ul :global(.menu-item[aria-disabled='true']) { opacity: 0.45; cursor: default; }
        ul :global(.tick) { color: var(--accent) !important; }
        @keyframes menu-in { from { opacity: 0; transform: scale(0.96) translate3d(0, -4px, 0); } }
        @keyframes menu-out { to { opacity: 0; transform: scale(0.98); } }
      `}</style>
    </div>
  );
}
