'use client';
// Everything the library needs to know about a chapter being read, written from the
// one place that actually knows it: the chapter page. Both readers use this — the
// local one and the published one — so "Continue reading" works across both without
// the Library page ever asking where a novel came from.
//
// It also owns bookmarks, because a bookmark is a scroll position and this is the
// code already watching the scroll position.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  putBookmark, putSaved, saveProgress, listBookmarks, deleteBookmark, getProgress,
  type Bookmark
} from '@/lib/library';
import { novelPercent } from '@/lib/library-select';
import { toast } from './Toaster';

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

/** How far through the prose the viewport bottom has reached, 0..1. Measured against
 *  the article itself, not the document — the end-of-chapter panel below it would
 *  otherwise cap every finished chapter short of 100%. */
export function chapterFraction(): number {
  const el = document.querySelector<HTMLElement>('.prose');
  const doc = document.documentElement;
  if (!el) {
    const max = doc.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, window.scrollY / max) : 1;
  }
  const r = el.getBoundingClientRect();
  const tail = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  const span = r.height - tail;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (window.innerHeight - r.top) / span));
}

/** The line the reader is looking at, for a bookmark they'll recognise later. */
function visibleLine(): string {
  const spans = document.querySelectorAll<HTMLElement>('.prose .w');
  const anchor = [...spans].find(s => s.getBoundingClientRect().top > window.innerHeight * 0.2);
  const para = (anchor ?? spans[0])?.closest('p, h1, h2, blockquote');
  const text = (para?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 110 ? `${text.slice(0, text.lastIndexOf(' ', 110))}…` : text;
}

export function useChapterTracker(p: TrackerProps) {
  const [marks, setMarks] = useState<Bookmark[]>([]);
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

  const toggle = useCallback(async () => {
    try {
      if (marked) {
        const near = [...marks].sort(
          (a, b) => Math.abs(a.scroll - window.scrollY) - Math.abs(b.scroll - window.scrollY)
        )[0];
        await deleteBookmark(near.id);
        setMarks(m => m.filter(b => b.id !== near.id));
        toast({
          message: 'Bookmark removed',
          action: {
            label: 'Undo',
            onClick: async () => { await putBookmark(near).catch(() => {}); setMarks(m => [...m, near]); }
          }
        });
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
        toast({ message: 'Bookmarked — find it in your library', tone: 'ok' });
      }
    } catch {
      toast({ message: 'This browser is blocking storage, so bookmarks can’t be saved.', tone: 'err' });
    }
  }, [marked, marks, p.novelId, p.novelTitle, p.chapterSlug, p.chapterTitle, p.href]);

  return { marked, toggle };
}
