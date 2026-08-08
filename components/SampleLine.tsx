'use client';
import { useEffect, useRef, useState } from 'react';
import { weight } from '@/lib/reader/timing';

// The hero demo IS the product: the real word-weighting function drives the timing,
// so what a visitor sees here is exactly how the reader paces a sentence.
const TEXT = `"Where's my scholar," he said. Hands under my arms. Up. My feet came off the floor and the room swung.`;
const WORDS = TEXT.split(/\s+/);

export default function SampleLine() {
  const [i, setI] = useState(-1);
  const [running, setRunning] = useState(false);
  const timer = useRef<number>(0);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reduced motion: don't animate, but still SHOW the idea — one word marked,
    // held still. A blank card would teach the visitor nothing.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setI(2); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setRunning(true); io.disconnect(); } },
      { threshold: 0.5 }
    );
    if (host.current) io.observe(host.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    let k = 0;
    const total = WORDS.reduce((s, w) => s + weight(w), 0);
    const step = () => {
      if (k >= WORDS.length) {
        timer.current = window.setTimeout(() => { k = 0; setI(-1); step(); }, 2200);
        return;
      }
      setI(k);
      const ms = (weight(WORDS[k]) / total) * 6400;
      k++;
      timer.current = window.setTimeout(step, ms);
    };
    step();
    return () => clearTimeout(timer.current);
  }, [running]);

  return (
    <div ref={host} className="demo" data-live={i >= 0}>
      <p className="line">
        {WORDS.map((w, k) => (
          <span key={k} className={k === i ? 'w on' : k < i ? 'w past' : 'w'}>{w} </span>
        ))}
      </p>
      <div className="chrome-bar">
        <span className="dot" data-on={running || i >= 0} />
        <span className="caption">reading aloud — the page keeps up</span>
      </div>

      <style jsx>{`
        .demo {
          position: relative;
          margin-top: clamp(2.5rem, 6vw, 4rem);
          border: 1px solid var(--rule); border-radius: var(--r-sheet, 1.25rem);
          background: color-mix(in oklab, var(--ink) 4%, transparent);
          padding: clamp(1.25rem, 3vw, 2rem);
          max-width: 34rem;
          box-shadow: var(--e-3);
        }
        /* the card warms while it is speaking and cools when it stops —
           the only state this demo needs to advertise */
        .demo::before {
          content: ''; position: absolute; inset: -1px; border-radius: inherit;
          pointer-events: none; z-index: -1;
          background: radial-gradient(60% 80% at 50% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%);
          opacity: 0; transition: opacity 900ms ease-out;
        }
        .demo[data-live='true']::before { opacity: 1; }
        .line {
          font-family: var(--serif); font-size: clamp(1.05rem, 2.4vw, 1.28rem);
          line-height: 1.75; margin: 0 0 1.1rem; color: var(--ink-dim);
        }
        .w { border-radius: 0.18em; transition: background-color 110ms linear, color 110ms linear; }
        .w.past { color: var(--ink-dim); }
        .w.on {
          background: color-mix(in oklab, var(--accent) 26%, transparent);
          color: var(--ink);
          box-shadow: 0 0 0 0.14em color-mix(in oklab, var(--accent) 26%, transparent);
        }
        .chrome-bar { display: flex; align-items: center; gap: 0.55rem; }
        .dot {
          width: 0.5rem; height: 0.5rem; border-radius: 999px;
          background: var(--ink-faint); transition: background-color 300ms;
        }
        .dot[data-on='true'] { background: var(--accent); }
        @media (prefers-reduced-motion: reduce) { .w { transition: none; } }
      `}</style>
    </div>
  );
}
