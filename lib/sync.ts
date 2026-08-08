// Merging a fresh scan of a linked folder into the copy already on the device.
//
// Pure, because the alternative to getting this right is deleting someone's writing.
// The one rule that matters: a chapter missing from disk is reported, never removed.
// Files get renamed, moved, and temporarily unmounted; a novel is not a mirror of a
// directory, it is a thing the reader owns that a directory happens to feed.
import type { StoredChapter, StoredNovel } from './library';
import { countWords, orderedChapters } from './chapters.ts';

/** One markdown file, already parsed. Ordinal is its position in the scan. */
export type Scanned = { slug: string; title: string; body: string; ordinal: number };

export type Merge = {
  novel: StoredNovel;
  added: number;
  updated: number;
  /** On the device but no longer in the folder. Kept, and worth telling the reader. */
  missing: number;
};

export function mergeScan(novel: StoredNovel, scanned: Scanned[]): Merge {
  const stored = new Map(novel.chapters.map(c => [c.slug, c]));
  const seen = new Set(scanned.map(c => c.slug));
  let added = 0;
  let updated = 0;

  const fromDisk: StoredChapter[] = scanned.map(s => {
    const was = stored.get(s.slug);
    if (!was) {
      added += 1;
      return { slug: s.slug, title: s.title, body: s.body, words: countWords(s.body), ordinal: 0 };
    }
    // Compare the text, not the timestamp: a file touched by a backup tool or a git
    // checkout has a new mtime and identical bytes, and re-saving it would churn the
    // word counts and the "updated" number for nothing.
    if (was.body === s.body && was.title === s.title) return was;
    updated += 1;
    return { ...was, title: s.title, body: s.body, words: countWords(s.body) };
  });

  // Chapters written in the app, or whose file went missing, keep their order and sit
  // after everything the folder still knows about.
  const kept = orderedChapters(novel).filter(c => !seen.has(c.slug));

  return {
    novel: { ...novel, chapters: [...fromDisk, ...kept].map((c, i) => ({ ...c, ordinal: i + 1 })) },
    added,
    updated,
    missing: kept.length
  };
}

/** What to tell the reader after a refresh. Plain counts, no jargon, no "0 items synced".
 *
 *  The missing-files note is built first and reported on its own when nothing else
 *  changed — deleting three files and being told "Already up to date" is the one
 *  outcome here that would actively mislead. */
export function describeMerge(m: Merge): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const gone = m.missing
    ? `${n(m.missing, 'chapter')} ${m.missing === 1 ? 'is' : 'are'} no longer in the folder — kept on this device.`
    : '';

  const bits: string[] = [];
  if (m.added) bits.push(`Added ${n(m.added, 'new chapter')}`);
  if (m.updated) bits.push(`${n(m.updated, 'chapter')} updated`);

  if (!bits.length) return gone || 'Already up to date.';
  return gone ? `${bits.join(' · ')}. ${gone}` : `${bits.join(' · ')}.`;
}
