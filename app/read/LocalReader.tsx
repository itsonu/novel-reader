'use client';
// The local reader. Same reader, same voices, zero account, files never leave the device.
//
// The chapter you are on is in the URL — `/read?novel=<id>&chapter=<slug>`. That is what
// makes back, forward, refresh, and a link to a specific chapter all behave. Query
// params rather than path segments on purpose: a static export can only prerender routes
// it knows at build time, and a folder someone imports on Tuesday isn't one of them.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Reader from '@/components/Reader';
import ChapterTracker from '@/components/ChapterTracker';
import { bodyWithoutTitle, md } from '@/lib/reader/markdown';
import { ensureSeeded, getNovel, getProgress, lastRead, listNovels, type StoredNovel } from '@/lib/library';
import { localChapterHref, localNovelHref } from '@/lib/routes';
import { runTour, tourSeen } from '@/lib/tour';

export default function LocalReader() {
  const router = useRouter();
  const params = useSearchParams();
  const novelId = params.get('novel') ?? '';
  const chapterSlug = params.get('chapter') ?? '';

  const [novel, setNovel] = useState<StoredNovel | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [nav, setNav] = useState(false);

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

  const go = useCallback(
    (slug: string) => { router.push(localChapterHref(novelId, slug)); setNav(false); },
    [router, novelId]
  );

  /* The tour points at controls that only exist once a chapter is on screen. */
  useEffect(() => {
    if (phase === 'ready' && index >= 0 && !tourSeen()) {
      const t = setTimeout(() => void runTour(), 1200);
      return () => clearTimeout(t);
    }
  }, [phase, index]);

  if (phase === 'missing')
    return (
      <main className="wrap">
        <h1 className="display">Not in your library</h1>
        <p className="lede">That book isn&apos;t on this device. It may have been removed.</p>
        <div className="cta">
          <Link href="/library" className="btn" data-variant="primary">Go to your library</Link>
          <Link href="/" className="btn">Browse published novels</Link>
        </div>
      </main>
    );

  if (phase === 'loading' || !novel || index < 0)
    return <main className="wrap"><p className="caption" aria-live="polite">Opening…</p></main>;

  const ch = chapters[index];
  const prev = chapters[index - 1];
  const next = chapters[index + 1];

  return (
    <div className="shell">
      <aside className={nav ? 'open' : ''} id="chapter-list">
        <div className="lib">
          <Link href={localNovelHref(novel.id)} className="up" data-tour="library">
            <span className="caption">‹ {novel.title}</span>
          </Link>
        </div>
        <ol>
          {chapters.map((c, k) => (
            <li key={c.slug}>
              <button className={k === index ? 'current' : ''} onClick={() => go(c.slug)}>
                <span className="caption mono">{String(k + 1).padStart(2, '0')}</span>
                <span>{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {/* Scrim only exists while the drawer is open — on a phone the chapter list is a
          modal, and tapping the page it covers should close it. */}
      {nav && <button className="scrim" aria-label="Close chapters" onClick={() => setNav(false)} />}

      <main>
        <nav className="crumb chrome" aria-label="Breadcrumb">
          <button
            className="icon-btn menu" onClick={() => setNav(v => !v)}
            aria-label="Chapters" aria-expanded={nav} aria-controls="chapter-list"
          >☰</button>
          <Link href={localNovelHref(novel.id)} className="btn" data-variant="ghost">← {novel.title}</Link>
          <span className="spacer" />
          <span className="caption mono">{index + 1} / {chapters.length}</span>
          <ChapterTracker
            novelId={novel.id}
            novelTitle={novel.title}
            author={novel.author}
            chapters={chapters.length}
            chapterSlug={ch.slug}
            chapterTitle={ch.title}
            chapterIndex={index}
            href={localChapterHref(novel.id, ch.slug)}
            scrollKey={`${novel.id}/${ch.slug}`}
          />
        </nav>

        <Reader
          html={md(bodyWithoutTitle(ch.body))}
          title={ch.title}
          subtitle={`${novel.title} · ${ch.words.toLocaleString()} words`}
          chapterKey={`${novel.id}/${ch.slug}`}
          genre={novel.genre}
        />

        <nav className="pager">
          {prev
            ? <Link href={localChapterHref(novel.id, prev.slug)} className="btn" rel="prev">← {prev.title}</Link>
            : <Link href={localNovelHref(novel.id)} className="btn">← {novel.title}</Link>}
          {next
            ? <Link href={localChapterHref(novel.id, next.slug)} className="btn" data-variant="primary" rel="next">{next.title} →</Link>
            : <Link href="/library" className="btn" data-variant="primary">Finished · back to library</Link>}
        </nav>
      </main>

      <style jsx>{`
        /* Sidebar is anchored to the viewport edge — centring the whole shell floated
           it off the left and read as broken. The reading column does the centring,
           inside main, which is what the eye actually wants aligned. */
        .shell { display: grid; grid-template-columns: 16rem minmax(0, 1fr); min-height: 100dvh; }
        @media (min-width: 100rem) { .shell { grid-template-columns: 18rem minmax(0, 1fr); } }
        aside {
          position: sticky; top: 0; height: 100dvh; overflow-y: auto;
          border-inline-end: 1px solid var(--rule);
          padding: 1rem 0.75rem 6rem;
          background: color-mix(in oklab, var(--paper) 96%, var(--ink));
        }
        .lib { padding: 0 .35rem .75rem; }
        /* <Link>: scoped through its container, styled-jsx marks host elements only. */
        .lib :global(.up) { text-decoration: none; display: block; border-radius: var(--r-tight); padding: 0.2rem; }
        .lib :global(.up:hover .caption) { color: var(--ink); }
        .lib :global(.up:focus-visible) { outline: var(--focus); outline-offset: var(--focus-gap); }
        aside ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
        aside button {
          width: 100%; text-align: start; display: flex; gap: 0.6rem; align-items: baseline;
          background: transparent; border: 0; color: var(--ink-dim);
          font: inherit; font-size: 0.85rem; padding: 0.5rem 0.55rem;
          border-radius: 0.5rem; cursor: pointer;
          transition: color var(--quick), background-color var(--quick);
        }
        aside button:hover { color: var(--ink); background: color-mix(in oklab, var(--ink) 5%, transparent); }
        aside button.current { color: var(--accent); background: color-mix(in oklab, var(--accent) 10%, transparent); }
        aside button:focus-visible { outline: var(--focus); outline-offset: -2px; }
        main { position: relative; min-width: 0; }
        .crumb :global(a) { text-decoration: none; }
        .spacer { flex: 1; }
        .menu { display: none; }
        .scrim { display: none; }
        @media (max-width: 860px) {
          .shell { grid-template-columns: 1fr; }
          aside {
            position: fixed; inset: 0 auto 0 0; width: min(84vw, 20rem); z-index: var(--z-nav);
            transform: translateX(-100%); transition: transform var(--settle);
            box-shadow: 0 0 60px #0007;
          }
          aside.open { transform: none; }
          .menu { display: grid; width: 2rem; height: 2rem; flex: none; }
          .scrim {
            display: block; position: fixed; inset: 0; z-index: var(--z-scrim);
            background: #0007; border: 0; padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
