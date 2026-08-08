// Chapter maths and mutations, kept pure so the editor screen is only UI and this is
// only rules. No IndexedDB, no React — the caller loads a novel, hands it here, and
// writes back whatever comes out.
//
// Type-only import of the models so `node` can strip types and run this directly.
import type { StoredChapter, StoredNovel } from './library';
import { slugify } from './reader/markdown.ts';

/** Adults read prose on screen at roughly this pace. Used for "6 min read", nothing else. */
const WPM = 238;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export const readingMinutes = (words: number): number => (words ? Math.max(1, Math.round(words / WPM)) : 0);

/** Chapters in reading order. Stored order is whatever IndexedDB felt like returning. */
export const orderedChapters = (novel: StoredNovel): StoredChapter[] =>
  [...novel.chapters].sort((a, b) => a.ordinal - b.ordinal);

export const chapterIndex = (novel: StoredNovel, slug: string): number =>
  orderedChapters(novel).findIndex(c => c.slug === slug);

/**
 * A slug for a chapter being written for the first time.
 *
 * It has to be decided on the *first* save, before the writer has necessarily typed a
 * title, and it can never change afterwards — it is the chapter's URL. So an untitled
 * chapter gets a stable throwaway id rather than waiting for a title that may never come
 * and would silently repoint the link if it did.
 */
export function draftSlug(title: string, taken: string[], now: number): string {
  const base = slugify(title) || `untitled-${now.toString(36)}`;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const tryIt = `${base}-${n}`;
    if (!taken.includes(tryIt)) return tryIt;
  }
}

export type Draft = { slug: string; title: string; body: string };

/**
 * Every mutator ends here: chapters come back in reading order with contiguous
 * ordinals, always. Returning the novel untouched on a no-op looked like a free
 * optimisation and was actually a trap — the caller then got storage order from one
 * branch and reading order from every other, depending on input it didn't control.
 */
const normalize = (novel: StoredNovel, list: StoredChapter[]): StoredNovel => ({
  ...novel,
  chapters: list.map((c, i) => ({ ...c, ordinal: i + 1 }))
});

/** Add or rewrite one chapter. An existing chapter keeps its position. */
export function upsertChapter(novel: StoredNovel, draft: Draft): StoredNovel {
  const title = draft.title.trim() || 'Untitled chapter';
  const words = countWords(draft.body);
  const list = orderedChapters(novel);
  const exists = list.some(c => c.slug === draft.slug);
  return normalize(
    novel,
    exists
      ? list.map(c => (c.slug === draft.slug ? { ...c, title, body: draft.body, words } : c))
      : [...list, { slug: draft.slug, title, body: draft.body, words, ordinal: list.length + 1 }]
  );
}

export function removeChapter(novel: StoredNovel, slug: string): StoredNovel {
  return normalize(novel, orderedChapters(novel).filter(c => c.slug !== slug));
}

/** Move a chapter to a new position. Out-of-range targets clamp rather than throw —
 *  a drag that overshoots the end of the list means "put it last". */
export function moveChapter(novel: StoredNovel, from: number, to: number): StoredNovel {
  const list = orderedChapters(novel);
  if (from < 0 || from >= list.length) return normalize(novel, list);
  const target = Math.min(list.length - 1, Math.max(0, to));
  if (target === from) return normalize(novel, list);
  const [moved] = list.splice(from, 1);
  list.splice(target, 0, moved);
  return normalize(novel, list);
}

/** Two-digit chapter label. Derived from position, never typed by the writer. */
export const chapterLabel = (index: number): string => `Chapter ${String(index + 1).padStart(2, '0')}`;
