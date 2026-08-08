'use client';
// A published novel's Start/Continue button and its favourite toggle.
//
// The page around it is a server component rendered at build time, so it can't know
// whether this particular reader is halfway through. This can: it reads the same
// progress row the local reader writes, which is why "Continue" works identically on a
// novel you imported and one you found here.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getProgress, getSaved, putSaved, setFavorite, type Progress } from '@/lib/library';
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
    <div className="acts">
      {href && (
        <Link href={href} className="btn" data-variant="primary">
          {progress ? `Continue · chapter ${progress.chapterIndex + 1}` : 'Start reading'}
        </Link>
      )}
      <button className="btn" aria-pressed={fav} onClick={toggle}>
        {fav ? '★ In your library' : '☆ Save to library'}
      </button>

      <style jsx>{`
        .acts { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .acts :global(a) { text-decoration: none; }
      `}</style>
    </div>
  );
}
