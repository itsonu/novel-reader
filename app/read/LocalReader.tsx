'use client';
// The local reader. Same reader, same voices, zero account, files never leave the device.
//
// The chapter you are on is in the URL — `/read?novel=<id>&chapter=<slug>`. That is what
// makes back, forward, refresh, and a link to a specific chapter all behave. Query
// params rather than path segments on purpose: a static export can only prerender routes
// it knows at build time, and a folder someone imports on Tuesday isn't one of them.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReaderShell from '@/components/ReaderShell';
import Icon from '@/components/Icon';
import { bodyWithoutTitle, md } from '@/lib/reader/markdown';
import { ensureSeeded, getNovel, getProgress, lastRead, listNovels, type StoredNovel } from '@/lib/library';
import { chapterEditHref, localChapterHref, localNovelHref } from '@/lib/routes';

export function ReaderSkeleton() {
  return (
    <main className="wrap" aria-busy="true">
      <span className="sr-only" role="status">Opening the chapter…</span>
      <div style={{ maxWidth: 'var(--measure)', margin: '0 auto', display: 'grid', gap: '0.9rem', justifyItems: 'center' }}>
        <span className="skel" style={{ width: '7rem', height: '0.7rem' }} />
        <span className="skel" style={{ width: '70%', height: '2.4rem', marginBottom: '2.5rem' }} />
        {[100, 96, 98, 60, 0, 100, 94, 97, 88, 40].map((w, i) => (
          <span key={i} className="skel" style={{ width: `${w}%`, height: w ? '1rem' : '0.6rem', justifySelf: 'start', opacity: w ? 1 : 0 }} />
        ))}
      </div>
    </main>
  );
}

export default function LocalReader() {
  const router = useRouter();
  const params = useSearchParams();
  const novelId = params.get('novel') ?? '';
  const chapterSlug = params.get('chapter') ?? '';

  const [novel, setNovel] = useState<StoredNovel | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');

  /* No novel in the URL: pick up exactly where they left off, whichever book that was.
     Nothing to pick up, and nothing on the device: the library is the honest landing. */
  useEffect(() => {
    if (novelId) return;
    (async () => {
      try {
        await ensureSeeded();
        const p = await lastRead();
        if (p) { router.replace(p.href); return; }
        const all = await listNovels();
        const pick = all.sort((a, b) => b.addedAt - a.addedAt)[0];
        const c = pick && [...pick.chapters].sort((x, y) => x.ordinal - y.ordinal)[0];
        router.replace(c ? localChapterHref(pick.id, c.slug) : '/library');
      } catch {
        router.replace('/library');
      }
    })();
  }, [novelId, router]);

  useEffect(() => {
    if (!novelId) return;
    (async () => {
      try {
        const n = await getNovel(novelId);
        if (!n) { setPhase('missing'); return; }
        setNovel(n);
        setPhase('ready');
      } catch { setPhase('missing'); }
    })();
  }, [novelId]);

  const chapters = useMemo(
    () => (novel ? [...novel.chapters].sort((a, b) => a.ordinal - b.ordinal) : []),
    [novel]
  );
  const index = chapters.findIndex(c => c.slug === chapterSlug);
  const rows = useMemo(
    () => chapters.map(c => ({ slug: c.slug, title: c.title, words: c.words, href: localChapterHref(novelId, c.slug) })),
    [chapters, novelId]
  );
  const ch = chapters[index];
  const html = useMemo(() => (ch ? md(bodyWithoutTitle(ch.body)) : ''), [ch]);

  /* An unknown or absent chapter resolves to where they were, then to chapter one —
     and the URL is corrected so refresh lands in the same place. */
  useEffect(() => {
    if (!novel || index >= 0 || !chapters.length) return;
    (async () => {
      const p = await getProgress(novel.id).catch(() => undefined);
      const slug = chapters.some(c => c.slug === p?.chapterSlug) ? p!.chapterSlug : chapters[0].slug;
      router.replace(localChapterHref(novel.id, slug));
    })();
  }, [novel, index, chapters, router]);

  if (phase === 'missing')
    return (
      <main className="wrap">
        <div className="empty">
          <span className="glyph"><Icon name="book" size={26} /></span>
          <h1 className="title">Not in your library</h1>
          <p>That book isn’t on this device. It may have been removed, or opened in a different browser.</p>
          <div className="actions">
            <Link href="/library" className="btn" data-variant="primary">Go to your library</Link>
            <Link href="/" className="btn">Discover</Link>
          </div>
        </div>
      </main>
    );

  if (novel && !chapters.length)
    return (
      <main className="wrap">
        <div className="empty">
          <span className="glyph"><Icon name="pen" size={26} /></span>
          <h1 className="title">Nothing to read yet</h1>
          <p>“{novel.title}” has no chapters. Write the first one and it will open here.</p>
          <div className="actions">
            <Link href={chapterEditHref(novel.id, 'new')} className="btn" data-variant="primary">Write chapter one</Link>
            <Link href={localNovelHref(novel.id)} className="btn">Back to the book</Link>
          </div>
        </div>
      </main>
    );

  if (phase === 'loading' || !novel || !ch) return <ReaderSkeleton />;

  return (
    <ReaderShell
      novel={{ id: novel.id, title: novel.title, author: novel.author, genre: novel.genre, href: localNovelHref(novel.id) }}
      chapters={rows}
      index={index}
      html={html}
      words={ch.words}
      editHref={chapterEditHref(novel.id, ch.slug)}
      tracker={{
        novelId: novel.id,
        novelTitle: novel.title,
        author: novel.author,
        chapters: chapters.length,
        chapterSlug: ch.slug,
        chapterTitle: ch.title,
        chapterIndex: index,
        href: localChapterHref(novel.id, ch.slug),
        scrollKey: `${novel.id}/${ch.slug}`
      }}
    />
  );
}
