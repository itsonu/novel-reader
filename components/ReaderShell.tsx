'use client';
// The reading room. One component for both kinds of novel — local and published — so
// the two readers can't drift apart.
//
// Immersive by default: the top bar and transport slide away as you read down the page
// and come back the moment you scroll up, reach the end, move the mouse to the top
// edge, or tap the page. While the narrator is speaking the transport stays, because
// you'll want to pause it. Focus mode (F) goes further: fullscreen where the browser
// allows it, and chrome only on request.
//
// Keys: ← → chapters · C contents · T type · B bookmark · F focus · ? all keys.
// On touch: swipe left or right across the page for the next or previous chapter.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Reader from './Reader';
import Icon from './Icon';
import Cover from './Cover';
import ChapterList, { type ChapterRow } from './ChapterList';
import ReadingSettings from './ReadingSettings';
import Shortcuts from './Shortcuts';
import { chapterFraction, useChapterTracker, type TrackerProps } from './ChapterTracker';
import { listBookmarks } from '@/lib/library';
import { isTyping, readTime, useModal, usePresence } from '@/lib/ui';
import { runTour, tourSeen } from '@/lib/tour';

export type ShellNovel = { id: string; title: string; author?: string; href: string; genre?: string; cover?: string };

const overlayOpen = () => Boolean(document.querySelector('[aria-modal="true"]'));

export default function ReaderShell({
  novel, chapters, index, html, words, tracker, editHref, libraryHref = '/library'
}: {
  novel: ShellNovel;
  chapters: ChapterRow[];
  index: number;
  html: string;
  words: number;
  tracker: TrackerProps;
  /** Local novels only: where the pencil goes. */
  editHref?: string;
  libraryHref?: string;
}) {
  const router = useRouter();
  const ch = chapters[index];
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  const chapterKey = tracker.scrollKey;

  const [hidden, setHidden] = useState(false);
  const [focus, setFocus] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [type, setType] = useState(false);
  const [keys, setKeys] = useState(false);
  const [past, setPast] = useState(false);        // scrolled past the chapter heading
  const [left, setLeft] = useState(readTime(words));
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [canFullscreen, setCanFullscreen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const { marked: here, toggle: toggleMark } = useChapterTracker(tracker);
  const focusRef = useRef(false);
  focusRef.current = focus;

  /* Direction of travel, for the page entrance. */
  const lastIndex = useRef(index);
  const direction: -1 | 0 | 1 = index > lastIndex.current ? 1 : index < lastIndex.current ? -1 : 0;
  useEffect(() => { lastIndex.current = index; }, [index]);

  useEffect(() => { setCanFullscreen(Boolean(document.fullscreenEnabled)); }, []);

  /* Bookmarked chapters, for the contents list. Refreshed when this chapter's own mark flips. */
  useEffect(() => {
    listBookmarks()
      .then(all => setMarked(new Set(all.filter(b => b.novelId === novel.id).map(b => b.chapterSlug))))
      .catch(() => {});
  }, [novel.id, here]);

  /* ---- scroll: progress hairline, minutes left, and the chrome's comings and goings ---- */
  useEffect(() => {
    let lastY = window.scrollY, raf = 0, lastLeft = '';
    const tick = () => {
      raf = 0;
      const y = window.scrollY;
      const f = chapterFraction();
      bar.current?.style.setProperty('--p', f.toFixed(4));
      const l = f >= 0.995 ? 'Done' : `${readTime(words * (1 - f))} left`;
      if (l !== lastLeft) { lastLeft = l; setLeft(l); }

      const dy = y - lastY;
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 48;
      if (y < 64 || atEnd) setHidden(false);
      else if (dy > 10) setHidden(true);
      else if (dy < -10 && !focusRef.current) setHidden(false);
      if (Math.abs(dy) > 10) lastY = y;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [words, chapterKey]);

  /* Heading out of view → the bar takes over the chapter title. */
  useEffect(() => {
    const el = heading.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-56px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [chapterKey]);

  /* The pointer at the top edge asks for the bar. */
  useEffect(() => {
    const on = (e: PointerEvent) => { if (e.pointerType === 'mouse' && e.clientY < 72) setHidden(false); };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, []);

  /* ---- focus mode ---- */
  const toggleFocus = useCallback(async () => {
    const on = !focusRef.current;
    setFocus(on);
    setHidden(on);
    try {
      if (on && document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* fullscreen refused (iframe, iOS): focus mode still hides the chrome */ }
  }, []);
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement && focusRef.current) { setFocus(false); setHidden(false); } };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const go = useCallback((c?: ChapterRow) => { if (c) router.push(c.href); }, [router]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (overlayOpen()) return;
      if ((e.target as HTMLElement).closest('[role="slider"]')) return;
      const k = e.key;
      if (k === 'ArrowRight') { if (next) { e.preventDefault(); go(next); } }
      else if (k === 'ArrowLeft') { if (prev) { e.preventDefault(); go(prev); } }
      else if (k === 'c' || k === 'C') setDrawer(true);
      else if (k === 't' || k === 'T') setType(true);
      else if (k === 'b' || k === 'B') void toggleMark();
      else if (k === 'f' || k === 'F') void toggleFocus();
      else if (k === 'e' && editHref) router.push(editHref);
      else if (k === '?') setKeys(true);
      else if (k === 'Escape' && focusRef.current) void toggleFocus();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [next, prev, go, toggleMark, toggleFocus, editHref, router]);

  /* ---- swipe between chapters (touch only) ---- */
  useEffect(() => {
    let sx = 0, sy = 0, st = 0, armed = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      armed = e.touches.length === 1
        && !(e.target as HTMLElement).closest('.rbar, .player, .drawer, button, a, input')
        && t.clientX > 24 && t.clientX < window.innerWidth - 24;   // leave the system back gesture alone
      sx = t.clientX; sy = t.clientY; st = performance.now();
    };
    const end = (e: TouchEvent) => {
      if (!armed || overlayOpen()) return;
      armed = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 2 && performance.now() - st < 600) {
        if (dx < 0) go(next); else go(prev);
      }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchend', end); };
  }, [go, next, prev]);

  /* The tour points at controls that only exist once a chapter is on screen. */
  useEffect(() => {
    if (tourSeen()) return;
    const t = setTimeout(() => void runTour(), 1400);
    return () => clearTimeout(t);
  }, []);

  const pct = Math.round(((index + 1) / chapters.length) * 100);

  const headingNode = useMemo(() => (
    <header className="chead">
      <p className="eyebrow">Chapter {index + 1}<span className="of"> of {chapters.length}</span></p>
      <h1 ref={heading} className="ctitle">{ch.title}</h1>
      <p className="cmeta">
        <span>{novel.title}</span>
        {novel.author && <span>{novel.author}</span>}
        <span>{readTime(words)} read</span>
      </p>
    </header>
  ), [index, chapters.length, ch.title, novel.title, novel.author, words]);

  const endNode = (
    <footer className="cend" aria-label="End of chapter">
      <p className="fin"><Icon name="scene" size={22} /><span className="sr-only">End of chapter {index + 1}</span></p>
      {next ? (
        <Link href={next.href} className="nextcard" rel="next">
          <span className="eyebrow">Next · Chapter {index + 2}</span>
          <span className="nt">{next.title}</span>
          <span className="caption">{readTime(next.words)}</span>
          <span className="go" aria-hidden><Icon name="arrowRight" size={20} /></span>
        </Link>
      ) : (
        <div className="finished">
          <p className="eyebrow">The end</p>
          <p className="ft">You’ve finished <em>{novel.title}</em>.</p>
          <div className="acts">
            <Link href={novel.href} className="btn" data-variant="primary">Back to the book</Link>
            <Link href={libraryHref} className="btn">Your library</Link>
          </div>
        </div>
      )}
      <nav className="sub" aria-label="Chapter navigation">
        {prev
          ? <Link href={prev.href} className="btn" data-variant="ghost" data-size="sm" rel="prev"><Icon name="arrowLeft" size={16} /> Previous</Link>
          : <span />}
        <button className="btn" data-variant="ghost" data-size="sm" onClick={() => setDrawer(true)}>
          <Icon name="list" size={16} /> All chapters
        </button>
      </nav>
    </footer>
  );

  const chromeHidden = hidden && !drawer && !type;

  return (
    <div className="shell" data-chrome={chromeHidden ? 'hidden' : 'shown'} data-focus={focus || undefined}>
      <header className="rbar chrome" onFocusCapture={() => setHidden(false)}>
        <div className="side">
          <Link href={novel.href} className="icon-btn" aria-label={`Back to ${novel.title}`} title={novel.title}>
            <Icon name="back" />
          </Link>
          <button
            className="icon-btn" onClick={() => setDrawer(true)} data-tour="library"
            aria-label="Contents" aria-haspopup="dialog" aria-expanded={drawer} aria-keyshortcuts="C" title="Contents (C)"
          >
            <Icon name="list" />
          </button>
        </div>

        <div className="mid" data-past={past || undefined}>
          <span className="m1">{novel.title}</span>
          <span className="m2" aria-hidden={!past}>
            <span className="m2t">{ch.title}</span>
            <span className="m2l mono">{left}</span>
          </span>
        </div>

        <div className="side end">
          {editHref && (
            <Link href={editHref} className="icon-btn hide-sm" aria-label="Edit this chapter" title="Edit (E)">
              <Icon name="edit" />
            </Link>
          )}
          <button className="icon-btn" onClick={() => setType(true)} data-tour="type"
                  aria-label="Reading settings" aria-haspopup="dialog" aria-expanded={type} aria-keyshortcuts="T" title="Reading settings (T)">
            <Icon name="type" />
          </button>
          <button className="icon-btn" onClick={() => void toggleMark()} aria-pressed={here}
                  aria-label={here ? 'Remove bookmark' : 'Bookmark this spot'} aria-keyshortcuts="B" title="Bookmark (B)">
            <Icon name="bookmark" fill={here} />
          </button>
          <button className={`icon-btn ${canFullscreen ? '' : 'hide-sm'}`} onClick={() => void toggleFocus()} aria-pressed={focus}
                  aria-label={focus ? 'Leave focus mode' : 'Focus mode'} aria-keyshortcuts="F" title="Focus mode (F)">
            <Icon name={focus ? 'collapse' : 'expand'} />
          </button>
        </div>

        <div ref={bar} className="hair" role="progressbar" aria-label="Chapter progress" aria-valuemin={0} aria-valuemax={100}>
          <span />
        </div>
      </header>

      <main className="stage">
        <Reader
          html={html}
          chapterKey={chapterKey}
          genre={novel.genre}
          before={headingNode}
          after={endNode}
          direction={direction}
          onTap={() => setHidden(h => !h)}
        />
      </main>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        novel={novel}
        chapters={chapters}
        index={index}
        marked={marked}
        pct={pct}
        editHref={editHref}
      />
      <ReadingSettings open={type} onClose={() => setType(false)} />
      <Shortcuts
        open={keys}
        onClose={() => setKeys(false)}
        groups={[
          { name: 'Reading', items: [
            { keys: ['←'], label: 'Previous chapter' }, { keys: ['→'], label: 'Next chapter' },
            { keys: ['C'], label: 'Contents' }, { keys: ['T'], label: 'Reading settings' },
            { keys: ['B'], label: 'Bookmark' }, { keys: ['F'], label: 'Focus mode' },
            { keys: ['+'], label: 'Larger text' }, { keys: ['−'], label: 'Smaller text' },
            ...(editHref ? [{ keys: ['E'], label: 'Edit chapter' }] : [])
          ] },
          { name: 'Listening', items: [
            { keys: ['Space'], label: 'Play / pause' }, { keys: ['J'], label: 'Next paragraph' },
            { keys: ['K'], label: 'Previous paragraph' }
          ] },
          { name: 'Anywhere', items: [{ keys: ['⌘', 'K'], label: 'Search' }, { keys: ['?'], label: 'This list' }] }
        ]}
      />

      <style jsx>{`
        .shell { min-height: 100dvh; }
        .rbar {
          position: fixed; inset: 0 0 auto 0; z-index: var(--z-crumb);
          display: grid; grid-template-columns: 1fr minmax(0, auto) 1fr; align-items: center; gap: var(--s-3);
          height: calc(3.5rem + env(safe-area-inset-top, 0px));
          padding: env(safe-area-inset-top, 0px) max(var(--s-3), env(safe-area-inset-right)) 0 max(var(--s-3), env(safe-area-inset-left));
          transition: transform var(--dur-3) var(--ease-spring), opacity var(--dur-3) var(--ease-out);
        }
        .shell[data-chrome='hidden'] .rbar { transform: translate3d(0, -100%, 0); opacity: 0; pointer-events: none; }
        .side { display: flex; align-items: center; gap: var(--s-1); min-width: 0; }
        .side.end { justify-content: flex-end; }
        .mid { position: relative; min-width: 0; height: 2.6rem; display: grid; place-items: center; text-align: center; overflow: hidden; }
        .m1, .m2 {
          grid-area: 1 / 1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: opacity var(--dur-3) var(--ease-out), transform var(--dur-3) var(--ease-spring);
        }
        .m1 { font-size: var(--t-caption); font-weight: 500; color: var(--ink-2); letter-spacing: 0.01em; }
        .m2 { display: grid; line-height: 1.2; opacity: 0; transform: translate3d(0, 60%, 0); }
        .m2t { font-size: var(--t-callout); font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
        .m2l { font-size: var(--t-micro); color: var(--ink-3); }
        .mid[data-past] .m1 { opacity: 0; transform: translate3d(0, -60%, 0); }
        .mid[data-past] .m2 { opacity: 1; transform: none; }

        .hair { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--rule); }
        .hair span {
          position: absolute; inset: 0; background: var(--accent); transform-origin: left center;
          transform: scaleX(var(--p, 0));
        }
        .stage { padding-top: calc(3.5rem + env(safe-area-inset-top, 0px)); }

        /* The transport leaves with the bar — unless it's speaking. */
        .shell :global(.player) { transition: transform var(--dur-3) var(--ease-spring), opacity var(--dur-3) var(--ease-out); }
        .shell[data-chrome='hidden'] :global(.reader:not([data-playing]) .player) { transform: translate3d(0, 110%, 0); opacity: 0; pointer-events: none; }

        @media (max-width: 40rem) {
          .rbar { grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--s-1); }
          .rbar :global(.hide-sm) { display: none; }
        }
      `}</style>
    </div>
  );
}

function Drawer({
  open, onClose, novel, chapters, index, marked, pct, editHref
}: {
  open: boolean; onClose: () => void; novel: ShellNovel; chapters: ChapterRow[]; index: number;
  marked: Set<string>; pct: number; editHref?: string;
}) {
  const { mounted, closing } = usePresence(open, 220);
  const panel = useRef<HTMLDivElement>(null);
  useModal(panel, open, onClose);
  if (!mounted) return null;
  return (
    <div className="droot" data-closing={closing || undefined}>
      <div className="scrim" aria-hidden onClick={onClose} />
      <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label="Contents" tabIndex={-1}>
        <header className="dh">
          <Link href={novel.href} className="book" onClick={onClose}>
            <Cover title={novel.title} author={novel.author} src={novel.cover} size="sm" />
            <span className="bt">
              <span className="btt">{novel.title}</span>
              {novel.author && <span className="caption">{novel.author}</span>}
              <span className="prog">
                <span className="meter" data-size="sm" style={{ ['--p' as string]: pct / 100 }} />
                <span className="caption mono">Chapter {index + 1} of {chapters.length}</span>
              </span>
            </span>
          </Link>
          <button className="icon-btn" aria-label="Close contents" onClick={onClose} data-autofocus>
            <Icon name="close" size={18} />
          </button>
        </header>
        {editHref && (
          <div className="dacts">
            <Link href={editHref} className="btn" data-size="sm" onClick={onClose}><Icon name="edit" size={15} /> Edit this chapter</Link>
          </div>
        )}
        <div className="dl">
          <ChapterList chapters={chapters} current={index} marked={marked} variant="compact" onNavigate={onClose} />
        </div>
      </div>
      <style jsx>{`
        .droot { position: fixed; inset: 0; z-index: var(--z-sheet); }
        .scrim { position: absolute; inset: 0; background: var(--scrim); animation: fade-in var(--dur-3) var(--ease-out) both; }
        .drawer {
          position: absolute; inset: 0 auto 0 0; width: min(24rem, 90vw);
          display: flex; flex-direction: column; outline: none;
          background: var(--surface-2); box-shadow: var(--shadow-3);
          padding-top: env(safe-area-inset-top, 0px); padding-left: env(safe-area-inset-left, 0px);
          animation: slide-in var(--dur-3) var(--ease-spring) both;
        }
        [data-closing] .scrim { animation: fade-out 220ms var(--ease-out) both; }
        [data-closing] .drawer { animation: slide-out 220ms var(--ease-in-out) both; }
        .dh { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-5) var(--s-3) var(--s-4) var(--s-5); border-bottom: 1px solid var(--rule); }
        .dh :global(.book) { flex: 1; min-width: 0; display: flex; gap: var(--s-4); text-decoration: none; color: var(--ink); border-radius: var(--r-md); }
        .dh :global(.cover) { width: 3.25rem; }
        .bt { display: grid; gap: 0.15rem; align-content: start; min-width: 0; }
        .btt { font-family: var(--font-serif); font-size: 1.05rem; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
        .prog { display: grid; gap: var(--s-2); margin-top: var(--s-2); }
        .dacts { padding: var(--s-3) var(--s-5) 0; }
        .dl { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: var(--s-3) var(--s-3) calc(var(--s-6) + env(safe-area-inset-bottom)); }
        @keyframes fade-in { from { opacity: 0; } }
        @keyframes fade-out { to { opacity: 0; } }
        @keyframes slide-in { from { transform: translate3d(-100%, 0, 0); } }
        @keyframes slide-out { to { transform: translate3d(-100%, 0, 0); } }
      `}</style>
    </div>
  );
}
