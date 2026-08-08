// Pure library logic: merge the stores into one card shape, then search/filter/sort it.
//
// Kept free of IndexedDB and React on purpose — this is the part with real branching,
// so it is the part worth running a check over (`npm run check`). It is also the seam
// where a future API replaces IndexedDB: swap what feeds buildCards(), not this file.
//
// Type-only imports so `node` can strip types and run it directly.
import type { Bookmark, Progress, SavedNovel, StoredNovel } from './library';
import { localChapterHref, localNovelHref, publishedNovelHref } from './routes.ts';

export type Status = 'new' | 'reading' | 'finished';

export type Card = {
  id: string;
  title: string;
  author?: string;
  cover?: string;
  chapters: number;
  words: number;
  addedAt: number;
  favorite: boolean;
  remote: boolean;
  /** True when the whole text lives on this device and works with no connection. */
  offline: boolean;
  detailsHref: string;
  /** Where "Continue" goes: the chapter they were on, or chapter one. */
  resumeHref: string;
  percent: number;         // 0..1
  status: Status;
  lastReadAt?: number;
  chapterLabel?: string;   // "Chapter 3 of 12 · The Storm"
};

export type Sort = 'recent' | 'title' | 'progress' | 'added';
export type StatusFilter = 'all' | Status;
export type Query = { q?: string; status?: StatusFilter; sort?: Sort };

/** Finished is a judgement call: the last chapter opened and mostly scrolled. */
const FINISHED = 0.98;

export function statusOf(percent: number): Status {
  if (percent >= FINISHED) return 'finished';
  return percent > 0 ? 'reading' : 'new';
}

/**
 * One card list from three stores. Progress is joined in by id, so a novel with no
 * progress row is simply "new" rather than missing — no separate query, no null holes.
 */
export function buildCards(
  novels: StoredNovel[],
  saved: SavedNovel[],
  progress: Progress[]
): Card[] {
  const byId = new Map(progress.map(p => [p.novelId, p]));

  const local: Card[] = novels.map(n => {
    const p = byId.get(n.id);
    const words = n.chapters.reduce((s, c) => s + c.words, 0);
    const first = [...n.chapters].sort((a, b) => a.ordinal - b.ordinal)[0];
    const percent = p?.percent ?? 0;
    return {
      id: n.id,
      title: n.title,
      author: n.author,
      chapters: n.chapters.length,
      words,
      addedAt: n.addedAt,
      favorite: Boolean(n.favorite),
      remote: false,
      offline: true,
      detailsHref: localNovelHref(n.id),
      resumeHref: p?.href ?? (first ? localChapterHref(n.id, first.slug) : localNovelHref(n.id)),
      percent,
      status: statusOf(percent),
      lastReadAt: p?.at,
      chapterLabel: p && `Chapter ${p.chapterIndex + 1} of ${p.chapters} · ${p.chapterTitle}`
    };
  });

  const remote: Card[] = saved.map(n => {
    const p = byId.get(n.id);
    const percent = p?.percent ?? 0;
    return {
      id: n.id,
      title: n.title,
      author: n.author,
      cover: n.cover,
      chapters: n.chapters,
      words: n.words ?? 0,
      addedAt: n.addedAt,
      favorite: Boolean(n.favorite),
      remote: true,
      offline: false,
      detailsHref: publishedNovelHref(n.slug),
      resumeHref: p?.href ?? publishedNovelHref(n.slug),
      percent,
      status: statusOf(percent),
      lastReadAt: p?.at,
      chapterLabel: p && `Chapter ${p.chapterIndex + 1} of ${p.chapters} · ${p.chapterTitle}`
    };
  });

  return [...local, ...remote];
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Title or author, case- and accent-insensitive, substring — a library is tens of
 *  books, so fuzzy matching would only add ways to be surprised. */
export function matches(card: Card, q: string): boolean {
  const needle = norm(q.trim());
  if (!needle) return true;
  return norm(card.title).includes(needle) || norm(card.author ?? '').includes(needle);
}

const byTitle = (a: Card, b: Card) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

const SORTS: Record<Sort, (a: Card, b: Card) => number> = {
  // Never read sorts below everything read, rather than jumping to the top on 0.
  recent: (a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0) || b.addedAt - a.addedAt || byTitle(a, b),
  title: byTitle,
  progress: (a, b) => b.percent - a.percent || byTitle(a, b),
  added: (a, b) => b.addedAt - a.addedAt || byTitle(a, b)
};

export function selectCards(cards: Card[], { q = '', status = 'all', sort = 'recent' }: Query = {}): Card[] {
  return cards
    .filter(c => (status === 'all' || c.status === status) && matches(c, q))
    .sort(SORTS[sort] ?? SORTS.recent);
}

/** "Continue reading": started, not finished, most recent first. */
export function continueReading(cards: Card[]): Card[] {
  return cards
    .filter(c => c.status === 'reading')
    .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
}

/** Everything ever opened, newest first — including books already finished. */
export function history(cards: Card[]): Card[] {
  return cards
    .filter(c => c.lastReadAt != null)
    .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
}

export const favorites = (cards: Card[]): Card[] => cards.filter(c => c.favorite).sort(byTitle);

export function searchBookmarks(list: Bookmark[], q: string): Bookmark[] {
  const needle = norm(q.trim());
  const hit = (b: Bookmark) =>
    !needle ||
    norm(b.novelTitle).includes(needle) ||
    norm(b.chapterTitle).includes(needle) ||
    norm(b.note).includes(needle);
  return list.filter(hit).sort((a, b) => b.at - a.at);
}

/** Chapter index -> whole-novel fraction, counting the current chapter as read once
 *  it is scrolled. Chapter 1 of 10 at the top is 0%, not 10%. */
export function novelPercent(chapterIndex: number, chapters: number, chapterFraction: number): number {
  if (chapters <= 0) return 0;
  const f = Math.min(1, Math.max(0, chapterFraction));
  return Math.min(1, (chapterIndex + f) / chapters);
}
