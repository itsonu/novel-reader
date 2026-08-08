'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '@/lib/reader/usePlayer';
import Player from './Player';

export default function Reader({
  html, title, subtitle, chapterKey
}: { html: string; title: string; subtitle?: string; chapterKey: string }) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState(1.19);
  // keyed on html — that is what determines the DOM the tokeniser walks
  const player = usePlayer(ref, [html]);

  // MUST be memoised. React compares dangerouslySetInnerHTML by OBJECT IDENTITY,
  // so a fresh {__html} literal each render re-writes innerHTML on every re-render
  // and destroys the word spans the tokeniser just created.
  const htmlProp = useMemo(() => ({ __html: html }), [html]);

  /* remembered prefs */
  useEffect(() => {
    const s = parseFloat(localStorage.getItem('nr:size') ?? '');
    if (s) { setSize(s); document.documentElement.style.setProperty('--prose', `${s}rem`); }
    const t = localStorage.getItem('nr:theme');
    if (t) document.documentElement.dataset.theme = t;
  }, []);

  const bump = (d: number) => {
    const s = Math.min(1.6, Math.max(0.95, +(size + d).toFixed(2)));
    setSize(s);
    document.documentElement.style.setProperty('--prose', `${s}rem`);
    localStorage.setItem('nr:size', String(s));
  };

  /* restore + persist scroll per chapter */
  useEffect(() => {
    const key = `nr:scroll:${chapterKey}`;
    const y = parseFloat(sessionStorage.getItem(key) ?? '0');
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
    const save = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener('scroll', save, { passive: true });
    return () => { save(); window.removeEventListener('scroll', save); };
  }, [chapterKey]);

  /* click a word to read from there */
  const onClick = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.w') as HTMLElement | null;
    if (el?.dataset.i) player.seekToToken(+el.dataset.i);
  }, [player]);

  /* keyboard */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,select,textarea')) return;
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      if (e.key === 'j') player.jump(1);
      if (e.key === 'k') player.jump(-1);
      if (e.key === '+' || e.key === '=') bump(0.04);
      if (e.key === '-') bump(-0.04);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <>
      <div className="head">
        <div>
          <h1 className="display">{title}</h1>
          {subtitle && <p className="caption sub">{subtitle}</p>}
        </div>
        <div className="tools">
          <button className="icon-btn" onClick={() => bump(-0.04)} aria-label="Smaller text">A</button>
          <button className="icon-btn" onClick={() => bump(0.04)} aria-label="Larger text">A</button>
          <button
            className="icon-btn"
            onClick={() => {
              const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
              document.documentElement.dataset.theme = t;
              localStorage.setItem('nr:theme', t);
            }}
            aria-label="Toggle theme"
          >◐</button>
        </div>
      </div>

      <article
        ref={ref}
        className="prose"
        onClick={onClick}
        dangerouslySetInnerHTML={htmlProp}
      />

      <Player
        state={player.state}
        voiceIds={player.voiceIds}
        onToggle={player.toggle}
        onJump={player.jump}
        onRate={player.setRate}
        onVoice={player.setVoice}
        onUpgrade={player.upgradeVoice}
      />

      <style jsx>{`
        .head {
          max-width: var(--measure); margin: 0 auto;
          padding: clamp(2.5rem, 7vw, 5rem) 1.25rem 1.75rem;
          display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem;
        }
        .sub { margin: 0.5rem 0 0; }
        .tools { display: flex; gap: 0.35rem; }
        .tools :global(.icon-btn:first-child) { font-size: 0.72rem; }
        .tools :global(.icon-btn:nth-child(2)) { font-size: 1rem; }
        article { padding: 0 1.25rem 40vh; }
      `}</style>
    </>
  );
}
