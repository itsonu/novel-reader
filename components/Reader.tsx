'use client';
// The chapter itself: prose, narration, cinematic layer. The chrome around it — top
// bar, contents, reading settings — belongs to ReaderShell; this component only knows
// how to show one chapter and read it aloud.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '@/lib/reader/usePlayer';
import Player from './Player';
import FxLayer, { type FxHandle } from './FxLayer';
import { detect, thin, type FxEvent } from '@/lib/fx/lexicon';
import { loadReading, saveReading, SIZE_STEP } from '@/lib/reading';
import { isTyping } from '@/lib/ui';

/** Any open modal owns the keyboard; the page's shortcuts stand down. */
const overlayOpen = () => Boolean(document.querySelector('[aria-modal="true"]'));

export default function Reader({
  html, chapterKey, genre, before, after, direction = 0, onTap
}: {
  html: string;
  chapterKey: string;
  genre?: string;
  /** Rendered above the prose (the chapter heading). Not tokenised, not narrated. */
  before?: React.ReactNode;
  /** Rendered below the prose (end-of-chapter navigation). */
  after?: React.ReactNode;
  /** -1 arrived from the next chapter, 1 from the previous, 0 fresh — steers the entrance. */
  direction?: -1 | 0 | 1;
  /** A tap on the page that isn't asking narration to do anything. */
  onTap?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const fx = useRef<FxHandle>(null);
  const events = useRef<Map<number, FxEvent>>(new Map());
  const pointer = useRef<string>('mouse');
  const [cinematic, setCinematic] = useState(false);
  const [sfx, setSfx] = useState(0.7);
  // keyed on html — that is what determines the DOM the tokeniser walks
  const player = usePlayer(ref, [html]);

  // MUST be memoised. React compares dangerouslySetInnerHTML by OBJECT IDENTITY,
  // so a fresh {__html} literal each render re-writes innerHTML on every re-render
  // and destroys the word spans the tokeniser just created.
  const htmlProp = useMemo(() => ({ __html: html }), [html]);

  /* remembered prefs */
  useEffect(() => {
    setCinematic(localStorage.getItem('nr:fx') === '1');
    const v = parseFloat(localStorage.getItem('nr:sfx') ?? '');
    if (!Number.isNaN(v)) setSfx(v);
  }, []);

  /* Chapter entrance. The page slides in from the side it came from — forwards from
     the right, back from the left — so the direction of travel is felt, not read.
     Web Animations, on the page wrapper only: the fixed player must never sit inside
     a transformed ancestor. */
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = page.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { opacity: 0, transform: `translate3d(${direction * 28}px, ${direction ? 0 : 10}px, 0)` },
        { opacity: 1, transform: 'none' }
      ],
      { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }, [chapterKey, direction]);

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

  /* restore + persist scroll per chapter */
  useEffect(() => {
    const key = `nr:scroll:${chapterKey}`;
    const y = parseFloat(sessionStorage.getItem(key) ?? '0');
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
    const save = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener('scroll', save, { passive: true });
    return () => { save(); window.removeEventListener('scroll', save); };
  }, [chapterKey]);

  const narrating = player.state.playing || player.state.spoken >= 0;

  /* A word click reads from there — with a mouse always, on touch only once narration
     is running. On a phone a tap on idle text is someone asking for the controls, and
     starting a voice at them would be a hostile answer. */
  const onClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;   // they were selecting text, not tapping
    const el = target.closest('.w') as HTMLElement | null;
    const touch = pointer.current !== 'mouse';
    if (el?.dataset.i && (!touch || narrating)) { player.seekToToken(+el.dataset.i); return; }
    if (touch) onTap?.();
  }, [player, narrating, onTap]);

  /* keyboard: narration and text size. Chapter-level keys live in ReaderShell. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e) || overlayOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('[role="slider"]')) return;
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      else if (e.key === 'j') player.jump(1);
      else if (e.key === 'k') player.jump(-1);
      else if (e.key === '+' || e.key === '=') { const r = loadReading(); saveReading({ ...r, size: r.size + SIZE_STEP }); }
      else if (e.key === '-' || e.key === '_') { const r = loadReading(); saveReading({ ...r, size: r.size - SIZE_STEP }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [player]);

  return (
    <div className="reader" data-narrating={narrating || undefined} data-playing={(player.state.playing && !player.state.paused) || undefined}>
      <div ref={page} className="page">
        {before}
        <article
          ref={ref}
          className="prose"
          onPointerDown={e => { pointer.current = e.pointerType; }}
          onClick={onClick}
          dangerouslySetInnerHTML={htmlProp}
        />
        {after}
      </div>

      <FxLayer ref={fx} enabled={cinematic} volume={sfx} />

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
        sfx={sfx}
        onSfx={v => { setSfx(v); localStorage.setItem('nr:sfx', String(v)); }}
      />

      <style jsx>{`
        .page { padding-inline: var(--gutter); }
        article { padding: 0 0 var(--s-8); }
      `}</style>
    </div>
  );
}
