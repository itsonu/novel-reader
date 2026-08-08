'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Reveal on first scroll into view. One IntersectionObserver, one transform.
 * ponytail: not a scroll-linked animation — those run every frame and fight the
 * reader's own scrolling. Fires once, then stops observing.
 */
export default function Reveal({
  children, delay = 0
}: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { rootMargin: '0px 0px -12% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-shown={shown} style={{ transitionDelay: `${delay}ms` }} className="reveal">
      {children}
      <style jsx>{`
        .reveal {
          opacity: 0;
          transform: translate3d(0, 14px, 0);
          transition: opacity 620ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      transform 620ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: opacity, transform;
        }
        .reveal[data-shown='true'] { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
        }
      `}</style>
    </div>
  );
}
