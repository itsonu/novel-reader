'use client';
import { useCallback, useEffect, useId, useRef } from 'react';
import { useModal } from '@/lib/ui';

/**
 * Bottom sheet with real gesture physics.
 *
 * Apple's rules, applied: track the pointer 1:1 from the grab offset; resist past the
 * top edge instead of hard-stopping; decide dismiss from the *projected* landing point
 * (velocity), not from where the finger happened to stop; hand the release velocity to
 * the settle animation so there's no seam; stay interruptible — grabbing a settling
 * sheet re-grabs it from its live position.
 *
 * Every way out (Done, Escape, the scrim, a flick) goes through the same spring, so a
 * sheet never just blinks out. On wide screens it becomes a popover anchored where its
 * trigger lives: above the transport ('player') or under the top bar ('top').
 *
 * ponytail: hand-rolled rather than pulling in a sheet library. The spring below is the
 * only physics in the app.
 */
export default function Sheet({
  open, onClose, title, children, placement = 'player'
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
  placement?: 'player' | 'top';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startY: 0, startOffset: 0, y: 0, vy: 0, lastT: 0, lastY: 0 });
  const anim = useRef(0);
  const id = useId();

  const height = () => panel.current?.offsetHeight || 1;
  const isPopover = () => matchMedia('(min-width: 48rem)').matches;
  const setY = (y: number) => {
    if (!panel.current) return;
    if (isPopover()) {
      // A popover doesn't travel the height of the screen; it settles in place.
      const k = Math.min(1, Math.max(0, y / height()));
      panel.current.style.transform = `translate3d(0, ${k * (placement === 'top' ? -10 : 10)}px, 0) scale(${1 - k * 0.03})`;
      panel.current.style.opacity = String(1 - k);
    } else {
      panel.current.style.transform = `translate3d(0, ${y}px, 0)`;
      panel.current.style.opacity = '1';
    }
    // scrim tops out at 0.5 — a full-black overlay hides the page it's dimming
    if (scrim.current) scrim.current.style.opacity = String(Math.max(0, 1 - y / height()) * 0.5);
  };

  /** Critically damped spring; carries release velocity so drag→settle has no seam. */
  const springTo = useCallback((target: number, velocity = 0, then?: () => void) => {
    cancelAnimationFrame(anim.current);
    const stiffness = 220, damping = 2 * Math.sqrt(stiffness); // damping ratio 1.0
    let y = drag.current.y, v = velocity, last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const a = -stiffness * (y - target) - damping * v;
      v += a * dt;
      y += v * dt;
      if (Math.abs(y - target) < 0.5 && Math.abs(v) < 20) {
        y = target; drag.current.y = y; setY(y); then?.(); return;
      }
      drag.current.y = y; setY(y);
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /** The one way out: spring off, then tell the parent. */
  const dismiss = useCallback((velocity = 0) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { closeRef.current(); return; }
    springTo(height(), velocity, () => closeRef.current());
  }, [springTo]);

  useModal(panel, open, () => dismiss());

  /* Open animation keys on `open` ALONE.
     It used to depend on onClose, whose identity changes every parent render — so
     picking any option re-ran this effect, which reset the panel to off-screen and
     re-animated it. The option had in fact been applied; the sheet just slid back
     over it, which read as "nothing happens". */
  useEffect(() => {
    if (!open || !panel.current) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    drag.current.y = reduce ? 0 : height();
    setY(drag.current.y);
    requestAnimationFrame(() => (reduce ? setY(0) : springTo(0)));
    return () => cancelAnimationFrame(anim.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Drag lives on the grip/header only. Capturing the pointer on the whole panel
  // retargets subsequent events to it and swallows the click on every row inside —
  // which is exactly how the options stopped responding.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;   // Done is a button, not a grip
    cancelAnimationFrame(anim.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      active: true, startY: e.clientY, startOffset: drag.current.y,
      y: drag.current.y, vy: 0, lastT: performance.now(), lastY: e.clientY
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const raw = d.startOffset + (e.clientY - d.startY);
    // rubber-band above the top edge: resistance grows the further you pull
    const y = raw < 0 ? (raw * height() * 0.55) / (height() + 0.55 * Math.abs(raw)) : raw;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.vy = ((e.clientY - d.lastY) / dt) * 1000;   // px/s
    d.lastT = now; d.lastY = e.clientY; d.y = y;
    setY(y);
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    // project where the flick is going (Apple's deceleration form), then decide
    const projected = d.y + (d.vy / 1000) * 0.998 / (1 - 0.998);
    if (projected > height() * 0.4) dismiss(d.vy);
    else springTo(0, d.vy);
  };

  if (!open) return null;

  return (
    <div className="root" data-placement={placement}>
      <div ref={scrim} className="scrim" aria-hidden onClick={() => dismiss()} />
      <div
        ref={panel}
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
      >
        <div
          className="dragzone"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="grip" aria-hidden />
          <header>
            <h2 id={`${id}-t`} className="title-3">{title}</h2>
            <button className="btn" data-variant="ghost" data-size="sm" onClick={() => dismiss()}>Done</button>
          </header>
        </div>
        <div className="body" data-sheet-scroll>{children}</div>
      </div>

      <style jsx>{`
        .root { position: fixed; inset: 0; z-index: var(--z-sheet); }
        .scrim { position: absolute; inset: 0; background: #000; opacity: 0; }
        .panel {
          position: absolute; left: 0; right: 0; bottom: 0;
          width: min(34rem, 100%); margin-inline: auto;
          transform: translate3d(0, 100%, 0);
          background: var(--surface-2);
          border-radius: var(--r-xl) var(--r-xl) 0 0;
          max-height: min(82dvh, 44rem); display: flex; flex-direction: column;
          will-change: transform; outline: none;
          box-shadow: 0 -1px 0 var(--rule), var(--e-4);
        }
        /* Desktop: a popover anchored where its trigger is, not a drawer across the screen. */
        @media (min-width: 48rem) {
          .panel {
            left: auto; right: var(--s-5); bottom: 5.5rem;
            width: min(24rem, calc(100vw - 2rem)); margin-inline: 0;
            border-radius: var(--r-xl); max-height: min(72vh, 36rem);
            box-shadow: var(--shadow-3);
            transform-origin: bottom right;
          }
          .root[data-placement='top'] .panel { bottom: auto; top: calc(3.5rem + var(--s-2)); transform-origin: top right; }
          .scrim { background: transparent; }
          .grip { display: none; }
          .dragzone { cursor: default; }
        }
        .dragzone { touch-action: none; cursor: grab; flex: none; }
        .dragzone:active { cursor: grabbing; }
        .grip {
          width: 2.25rem; height: 0.3rem; border-radius: 999px; margin: 0.55rem auto 0;
          background: color-mix(in oklab, var(--ink) 24%, transparent);
        }
        header {
          display: flex; align-items: center; justify-content: space-between;
          padding: var(--s-3) var(--s-4) var(--s-3) var(--s-6);
        }
        header h2 { margin: 0; }
        .body {
          overflow-y: auto; overscroll-behavior: contain;
          padding: 0 var(--s-4) calc(var(--s-5) + env(safe-area-inset-bottom));
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </div>
  );
}
