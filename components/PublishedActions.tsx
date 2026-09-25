'use client';
// A published novel's Start/Continue button and its favourite toggle.
//
// The page around it is a server component rendered at build time, so it can't know
// whether this particular reader is halfway through. This can: it reads the same
// progress row the local reader writes, which is why "Continue" works identically on a
// novel you imported and one you found here.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getProgress, getSaved, listBookmarks, putSaved, setFavorite, type Progress } from '@/lib/library';
import ChapterList, { type ChapterRow } from './ChapterList';
import Icon from './Icon';
import { toast } from './Toaster';
import { publishedChapterHref, remoteId } from '@/lib/routes';

export type Props = {
  slug: string;
  title: string;
  author?: string;
  cover?: string;
  chapters: number;
  words: number;
  firstChapter?: string;
};

export default function PublishedActions(p: Props) {
  const id = remoteId(p.slug);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    getProgress(id).then(r => setProgress(r ?? null)).catch(() => {});
    getSaved(id).then(r => setFav(Boolean(r?.favorite))).catch(() => {});
  }, [id]);

  const start = p.firstChapter ? publishedChapterHref(p.slug, p.firstChapter) : undefined;
  const href = progress?.href ?? start;

  const toggle = async () => {
    const on = !fav;
    setFav(on);
    try {
      // Favouriting is also what puts the novel on the library shelf — there is no
      // separate "add to library", because there is no meaningful difference.
      const existing = await getSaved(id);
      await putSaved({
        id, slug: p.slug, title: p.title, author: p.author, cover: p.cover,
        chapters: p.chapters, words: p.words,
        favorite: on, addedAt: existing?.addedAt ?? Date.now()
      });
      await setFavorite(id, on);
    } catch {
      setFav(!on);   // storage blocked; don't claim it stuck
    }
  };

  return (
    <>
      {href && (
        <Link href={href} className="btn" data-variant="primary" data-size="lg">
          <Icon name="book" size={18} />
          {progress ? `Continue · chapter ${progress.chapterIndex + 1}` : 'Start reading'}
        </Link>
      )}
      <button className="btn" data-size="lg" aria-pressed={fav} onClick={async () => {
        await toggle();
        toast({ message: fav ? 'Removed from your library' : 'Saved to your library', tone: fav ? 'default' : 'ok' });
      }}>
        <Icon name={fav ? 'check' : 'plus'} size={17} />
        {fav ? 'In your library' : 'Save to library'}
      </button>
    </>
  );
}

/** The published book's chapter list, lit with this reader's own progress and marks. */
export function PublishedChapters({ slug, chapters }: { slug: string; chapters: ChapterRow[] }) {
  const id = remoteId(slug);
  const [at, setAt] = useState(-1);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  useEffect(() => {
    getProgress(id).then(p => setAt(p?.chapterIndex ?? -1)).catch(() => {});
    listBookmarks().then(all => setMarked(new Set(all.filter(b => b.novelId === id).map(b => b.chapterSlug)))).catch(() => {});
  }, [id]);
  return <ChapterList chapters={chapters} current={at} marked={marked} />;
}
