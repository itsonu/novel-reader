'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '@/lib/reader/usePlayer';
import Player from './Player';
import FxLayer, { type FxHandle } from './FxLayer';
import { detect, thin, type FxEvent } from '@/lib/fx/lexicon';

export default function Reader({
  html, title, subtitle, chapterKey, genre
}: { html: string; title: string; subtitle?: string; chapterKey: string; genre?: string }) {
  const ref = useRef<HTMLElement>(null);
  const fx = useRef<FxHandle>(null);
  const events = useRef<Map<number, FxEvent>>(new Map());
  const [cinematic, setCinematic] = useState(false);
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
    setCinematic(localStorage.getItem('nr:fx') === '1');
  }, []);

  /* Detect events once per chapter, off the rendered tokens. Thinned so the page
     stays calm — the spec's 90/10 rule is enforced here, not hoped for. */
  useEffect(() => {
    events.current.clear();
    fx.current?.clear();
    const spans = ref.current?.querySelectorAll<HTMLElement>('.w');
    if (!spans?.length) return;
    const tokens = [...spans].map(s => s.textContent ?? '');
    for (const e of thin(detect(tokens, genre), tokens.length)) events.current.set(e.token, e);
  }, [html, genre]);

  /* Fire on the NARRATED word — the reason this exists at all. The hit lands on the
     syllable the voice is speaking, not on a scroll position. */
  useEffect(() => {
    const i = player.state.spoken;
    if (i < 0 || !cinematic) return;
    const e = events.current.get(i);
    if (!e) return;
    fx.current?.fire(e);
    const el = ref.current?.querySelector<HTMLElement>(`.w[data-i="${i}"]`);
    if (el) {
      el.classList.add('fx-hit');
      setTimeout(() => el.classList.remove('fx-hit'), 700);
    }
  }, [player.state.spoken, cinematic]);

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
        <div className="titles">
          <h1>{title}</h1>
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

      <FxLayer ref={fx} enabled={cinematic} />

      <Player
        state={player.state}
        voiceIds={player.voiceIds}
        onToggle={player.toggle}
        onJump={player.jump}
        onRate={player.setRate}
        onVoice={player.setVoice}
        onUpgrade={player.upgradeVoice}
        onSeek={player.seekToFraction}
        timing={player.timing}
        cinematic={cinematic}
        onCinematic={v => {
          setCinematic(v);
          localStorage.setItem('nr:fx', v ? '1' : '0');
          if (!v) fx.current?.clear();
        }}
      />

      <style jsx>{`
        /* A chapter title is a label, not a poster. Capping it keeps the first
           paragraph near the top of the fold instead of three lines below it. */
        .head {
          max-width: var(--measure); margin: 0 auto;
          padding: clamp(1.75rem, 4vw, 3rem) 1.25rem 1.25rem;
          display: flex; align-items: baseline; justify-content: space-between; gap: 1.5rem;
          border-bottom: 1px solid var(--rule);
        }
        .titles { min-width: 0; }
        .head h1 {
          font-family: var(--serif);
          font-size: clamp(1.4rem, 1.1rem + 1vw, 1.85rem);
          line-height: 1.18; letter-spacing: -0.016em; font-weight: 600;
          margin: 0; text-wrap: balance;
        }
        .sub { margin: 0.35rem 0 0; }
        .tools { display: flex; gap: 0.3rem; flex: none; }
        .tools :global(.icon-btn) { width: 2rem; height: 2rem; }
        .tools :global(.icon-btn:first-child) { font-size: 0.7rem; }
        .tools :global(.icon-btn:nth-child(2)) { font-size: 0.95rem; }
        article { padding: 2rem 1.25rem 45vh; }
      `}</style>
    </>
  );
}
