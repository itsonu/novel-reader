'use client';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Bottom sheet with real gesture physics.
 *
 * Apple's rules, applied: track the pointer 1:1 from the grab offset; resist past the
 * top edge instead of hard-stopping; decide dismiss from the *projected* landing point
 * (velocity), not from where the finger happened to stop; hand the release velocity to
 * the settle animation so there's no seam; stay interruptible — grabbing a settling
 * sheet re-grabs it from its live position.
 *
 * ponytail: hand-rolled rather than pulling in a sheet library. ~120 lines, and the
 * spring below is the only physics in the app.
 */
export default function Sheet({
  open, onClose, title, children
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startY: 0, startOffset: 0, y: 0, vy: 0, lastT: 0, lastY: 0 });
  const anim = useRef(0);

  const height = () => panel.current?.offsetHeight || 1;
  const setY = (y: number) => {
    if (!panel.current) return;
    panel.current.style.transform = `translate3d(0, ${y}px, 0)`;
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
  }, []);

  /* Open/close animation keys on `open` ALONE.
     It used to depend on onClose, whose identity changes every parent render — so
     picking any option re-ran this effect, which reset the panel to off-screen and
     re-animated it. The option had in fact been applied; the sheet just slid back
     over it, which read as "nothing happens". */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !panel.current) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    drag.current.y = reduce ? 0 : height();
    setY(drag.current.y);
    requestAnimationFrame(() => (reduce ? setY(0) : springTo(0)));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Drag lives on the grip/header only. Capturing the pointer on the whole panel
  // retargets subsequent events to it and swallows the click on every row inside —
  // which is exactly how the options stopped responding.
  const onPointerDown = (e: React.PointerEvent) => {
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
    if (projected > height() * 0.4) springTo(height(), d.vy, onClose);
    else springTo(0, d.vy);
  };

  if (!open) return null;

  return (
    <div className="root" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={scrim} className="scrim" onClick={onClose} />
      <div ref={panel} className="panel chrome">
        <div
          className="dragzone"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="grip" aria-hidden />
          <header>
            <h2 className="title">{title}</h2>
            <button className="btn" data-variant="ghost" onClick={onClose}>Done</button>
          </header>
        </div>
        <div className="body" data-sheet-scroll>{children}</div>
      </div>

      <style jsx>{`
        .root { position: fixed; inset: 0; z-index: 90; }
        .scrim { position: absolute; inset: 0; background: #000; opacity: 0; }
        .panel {
          position: absolute; left: 0; right: 0; bottom: 0;
          width: min(34rem, 100%); margin-inline: auto;
          transform: translate3d(0, 100%, 0);
          border-radius: 1.25rem 1.25rem 0 0;
          max-height: min(78vh, 40rem); display: flex; flex-direction: column;
          will-change: transform;
          box-shadow: 0 -1px 0 color-mix(in oklab, var(--ink) 12%, transparent),
                      0 -30px 60px -20px #000a;
        }
        /* Desktop: a popover anchored bottom-right above the control bar, the way a
           media player puts its settings — not a modal drawer across the whole screen. */
        @media (min-width: 48rem) {
          .panel {
            left: auto; right: 1rem; bottom: 5.25rem;
            width: min(23rem, calc(100vw - 2rem)); margin-inline: 0;
            border-radius: 1rem; max-height: min(70vh, 32rem);
            box-shadow: 0 1px 0 color-mix(in oklab, var(--ink) 10%, transparent) inset,
                        0 24px 60px -12px #000c;
          }
          .scrim { background: transparent; }
          .grip { display: none; }
        }
        .dragzone { touch-action: none; cursor: grab; flex: none; }
        .dragzone:active { cursor: grabbing; }
        .grip {
          width: 2.25rem; height: 0.25rem; border-radius: 999px; margin: 0.6rem auto 0;
          background: color-mix(in oklab, var(--ink) 26%, transparent);
        }
        header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.7rem 1rem 0.55rem;
        }
        header h2 { margin: 0; }
        .body {
          overflow-y: auto; overscroll-behavior: contain;
          padding: 0 0.6rem calc(1rem + env(safe-area-inset-bottom));
          -webkit-overflow-scrolling: touch;
        }
        @media (prefers-reduced-motion: reduce) {
          .panel { transition: none; }
        }
      `}</style>
    </div>
  );
}
