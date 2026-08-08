'use client';
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { compile, degrade, type FxCommand } from '@/lib/fx/engine';
import { play as playSfx, setVolume } from '@/lib/fx/audio';
import type { FxEvent } from '@/lib/fx/lexicon';

export type FxHandle = { fire: (e: FxEvent) => void; clear: () => void };

/**
 * Two fixed layers above the page: a tint/flash plane and a vignette plane.
 * Nothing here is in the text's layout path, so an effect can never reflow prose
 * mid-sentence — the single worst thing a reading app could do.
 */
const FxLayer = forwardRef<FxHandle, { enabled: boolean; volume?: number }>(
  function FxLayer({ enabled, volume = 0.7 }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState<FxCommand | null>(null);
  const timer = useRef<number>(0);
  const reduce = useRef(false);

  useEffect(() => { setVolume(volume); }, [volume]);

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    reduce.current = mq.matches;
    const on = () => (reduce.current = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useImperativeHandle(ref, () => ({
    fire(e) {
      if (!enabled) return;
      const c = degrade(compile(e), reduce.current);
      clearTimeout(timer.current);
      setCmd(c);
      // sound rides the same event; reduced motion silences motion, not audio
      if (volume > 0) playSfx(e.kind, e.intensity);
      // the shake lives on <html> so the whole page moves, text included
      if (c.tier === 'camera' || c.tier === 'screen') {
        document.documentElement.style.setProperty('--fx-shake', c.vars['--fx-shake']);
        document.documentElement.classList.add('fx-shaking');
      }
      timer.current = window.setTimeout(() => {
        setCmd(null);
        document.documentElement.classList.remove('fx-shaking');
      }, c.duration);
    },
    clear() {
      clearTimeout(timer.current);
      setCmd(null);
      document.documentElement.classList.remove('fx-shaking');
    }
  }), [enabled]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    document.documentElement.classList.remove('fx-shaking');
  }, []);

  return (
    <div
      ref={root}
      className={cmd ? `fx ${cmd.className} fx-on` : 'fx'}
      style={cmd ? (cmd.vars as React.CSSProperties) : undefined}
      aria-hidden
    />
  );
});

export default FxLayer;
