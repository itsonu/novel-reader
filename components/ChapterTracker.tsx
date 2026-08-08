'use client';
// Everything the library needs to know about a chapter being read, written from the
// one place that actually knows it: the chapter page. Both readers mount this — the
// local one and the published one — so "Continue reading" works across both without
// the Library page ever asking where a novel came from.
//
// It also owns the bookmark button, because a bookmark is a scroll position and this
// is the component already watching the scroll position.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  putBookmark, putSaved, saveProgress, listBookmarks, deleteBookmark, getProgress,
  type Bookmark
} from '@/lib/library';
import { novelPercent } from '@/lib/library-select';

export type TrackerProps = {
  novelId: string;
  novelTitle: string;
  author?: string;
  /** Total chapters in the novel — the denominator for whole-novel progress. */
  chapters: number;
  chapterSlug: string;
  chapterTitle: string;
  chapterIndex: number;          // 0-based
  href: string;                  // this exact chapter
  /** Must match the Reader's chapterKey — both sides key the same sessionStorage entry,
   *  and a mismatch would make every navigation look like a fresh session. */
  scrollKey: string;
  remote?: boolean;
  /** Published novels only: enough to draw a library card without a network call. */
  saved?: { slug: string; cover?: string; words?: number };
};

/** How far through the prose the viewport bottom has reached, 0..1.
 *  Measured against the article's *content* end, not the document end — the reader
 *  leaves a tall tail below the last line so a chapter can scroll clear of the player,
 *  and counting that tail would cap every finished chapter at about 70%. */
function chapterFraction(): number {
  const el = document.querySelector<HTMLElement>('.prose');
  const doc = document.documentElement;
  if (!el) {
    const max = doc.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, window.scrollY / max) : 1;
  }
  const tail = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  const top = el.offsetTop;
  const span = el.offsetHeight - tail;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (window.scrollY + window.innerHeight - top) / span));
}

/** The line the reader is looking at, for a bookmark they'll recognise later. */
function visibleLine(): string {
  const spans = document.querySelectorAll<HTMLElement>('.prose .w');
  const anchor = [...spans].find(s => s.getBoundingClientRect().top > window.innerHeight * 0.2);
  const para = (anchor ?? spans[0])?.closest('p, h1, h2, blockquote');
  const text = (para?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 110 ? `${text.slice(0, text.lastIndexOf(' ', 110))}…` : text;
}

export default function ChapterTracker(p: TrackerProps) {
  const [marks, setMarks] = useState<Bookmark[]>([]);
  const [flash, setFlash] = useState('');
  // Props change on every chapter; keep the writer reading the latest without
  // re-subscribing the scroll listener each time.
  const latest = useRef(p);
  latest.current = p;

  const write = useCallback(async () => {
    const c = latest.current;
    try {
      await saveProgress({
        novelId: c.novelId,
        title: c.novelTitle,
        author: c.author,
        chapterSlug: c.chapterSlug,
        chapterTitle: c.chapterTitle,
        chapterIndex: c.chapterIndex,
        chapters: c.chapters,
        scroll: window.scrollY,
        percent: novelPercent(c.chapterIndex, c.chapters, chapterFraction()),
        at: Date.now(),
        href: c.href,
        remote: c.remote
      });
      if (c.remote && c.saved) {
        await putSaved({
          id: c.novelId, slug: c.saved.slug, title: c.novelTitle, author: c.author,
          cover: c.saved.cover, chapters: c.chapters, words: c.saved.words, addedAt: Date.now()
        });
      }
    } catch { /* private browsing blocks storage; reading still works */ }
  }, []);

  /* One write on arrival so an opened-but-unscrolled chapter still counts as started,
     then a lazy flush — a scroll listener that hits IndexedDB per frame would be the
     one thing in this app that stutters. */
  useEffect(() => {
    let live = true;
    let dirty = false;
    const mark = () => { dirty = true; };
    const flush = () => { if (dirty) { dirty = false; void write(); } };

    (async () => {
      // Reader keeps a same-session scroll position in sessionStorage, which dies with
      // the tab. The progress row outlives the browser, so when there's no session entry
      // — a fresh launch, a restored tab, another window — resume from that instead.
      // Restore *before* the first write, or the write would stamp scroll 0 over it.
      const key = `nr:scroll:${p.scrollKey}`;
      if (!sessionStorage.getItem(key)) {
        const saved = await getProgress(p.novelId).catch(() => undefined);
        if (live && saved?.chapterSlug === p.chapterSlug && saved.scroll > 0) {
          requestAnimationFrame(() => window.scrollTo(0, saved.scroll));
        }
      }
      if (live) void write();
    })();

    const timer = setInterval(flush, 2000);
    window.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('pagehide', flush);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('scroll', mark);
      window.removeEventListener('pagehide', flush);
      void write();
    };
  }, [write, p.href, p.novelId, p.chapterSlug, p.scrollKey]);

  useEffect(() => {
    listBookmarks()
      .then(all => setMarks(all.filter(b => b.novelId === p.novelId && b.chapterSlug === p.chapterSlug)))
      .catch(() => setMarks([]));
  }, [p.novelId, p.chapterSlug]);

  // Pressed means "this chapter is bookmarked". Deliberately not "this exact pixel is
  // bookmarked" — that would leave the button unpressed two lines below the mark the
  // reader just made, which reads as the button having failed.
  const marked = marks.length > 0;

  const toggle = async () => {
    try {
      if (marked) {
        const near = [...marks].sort(
          (a, b) => Math.abs(a.scroll - window.scrollY) - Math.abs(b.scroll - window.scrollY)
        )[0];
        await deleteBookmark(near.id);
        setMarks(m => m.filter(b => b.id !== near.id));
        setFlash('Bookmark removed');
      } else {
        const b: Bookmark = {
          id: `${p.novelId}::${p.chapterSlug}::${Date.now()}`,
          novelId: p.novelId, novelTitle: p.novelTitle,
          chapterSlug: p.chapterSlug, chapterTitle: p.chapterTitle,
          note: visibleLine(), scroll: Math.round(window.scrollY),
          href: p.href, at: Date.now()
        };
        await putBookmark(b);
        setMarks(m => [...m, b]);
        setFlash('Saved to your library');
      }
    } catch {
      setFlash('Storage is blocked in this browser');
    }
    setTimeout(() => setFlash(''), 2400);
  };

  return (
    <>
      <button
        className="icon-btn mark"
        onClick={toggle}
        aria-pressed={marked}
        aria-label={marked ? 'Remove bookmark' : 'Bookmark this spot'}
        title={marked ? 'Remove bookmark' : 'Bookmark this spot'}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" strokeWidth="1.6"
             strokeLinejoin="round" fill={marked ? 'currentColor' : 'none'} aria-hidden>
          <path d="M6.5 3.75h11a.75.75 0 0 1 .75.75v15.4a.4.4 0 0 1-.63.33L12 16.2l-5.62 4.03a.4.4 0 0 1-.63-.33V4.5a.75.75 0 0 1 .75-.75Z" />
        </svg>
      </button>

      {/* Announced, not just drawn — the button's own label changes state silently. */}
      <p className="flash caption" role="status" aria-live="polite" data-on={flash ? '' : undefined}>
        {flash}
      </p>

      <style jsx>{`
        .mark { width: 2rem; height: 2rem; color: var(--ink-dim); flex: none; }
        .mark:hover { color: var(--ink); border-color: color-mix(in oklab, var(--accent) 45%, var(--rule)); }
        .mark[aria-pressed='true'] { color: var(--accent); border-color: color-mix(in oklab, var(--accent) 55%, var(--rule)); }
        .mark:focus-visible { outline: var(--focus); outline-offset: var(--focus-gap); }
        .flash {
          position: fixed; left: 50%; bottom: 6.5rem; z-index: var(--z-toast);
          transform: translate(-50%, 0.4rem); opacity: 0; pointer-events: none;
          background: var(--paper); color: var(--ink);
          border: 1px solid var(--rule); border-radius: var(--r-round);
          padding: var(--s-2) var(--s-4); margin: 0;
          box-shadow: var(--e-2);
          transition: opacity var(--quick), transform var(--quick);
        }
        .flash[data-on] { opacity: 1; transform: translate(-50%, 0); }
      `}</style>
    </>
  );
}
