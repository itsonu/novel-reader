'use client';
// A local novel's own page: what it is, where you are in it, every chapter, every mark.
// The published equivalent is /n/[slug]; this is the same room for a book that only
// exists on this device, so the reading flow is identical either way.

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  deleteBookmark, deleteNovel, getNovel, getProgress, listBookmarks, setFavorite,
  type Bookmark, type Progress, type StoredNovel
} from '@/lib/library';
import { chapterEditHref, chapterNewHref, localChapterHref } from '@/lib/routes';
import { linkState, refreshFromFolder, type LinkState } from '@/lib/import';

function NovelBody() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [novel, setNovel] = useState<StoredNovel | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [link, setLink] = useState<LinkState>('none');
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!id) { setPhase('missing'); return; }
    try {
      const n = await getNovel(id);
      if (!n) { setPhase('missing'); return; }
      setNovel(n);
      setProgress((await getProgress(id)) ?? null);
      setMarks((await listBookmarks()).filter(b => b.novelId === id).sort((a, b) => b.at - a.at));
      setPhase('ready');
    } catch {
      setPhase('missing');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /* Is this book still wired to a folder on disk, and may we read it without asking? */
  useEffect(() => { if (id) linkState(id).then(setLink).catch(() => setLink('none')); }, [id]);

  /* Permission survived, so pick up anything written to the folder since last time —
     quietly, and only saying something when there was actually something to say. */
  useEffect(() => {
    if (link !== 'linked' || !id) return;
    let live = true;
    (async () => {
      const r = await refreshFromFolder(id, false);
      if (!live || !r || !('note' in r) || r.note === 'Already up to date.') return;
      setNote(r.note);
      await load();
    })();
    return () => { live = false; };
  }, [link, id, load]);

  /* Cmd/Ctrl+N writes a new chapter. Same destination as both Add buttons — one
     editor, three ways in. Skipped while typing so it can't fire from a text field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'n' || e.shiftKey) return;
      if ((e.target as HTMLElement).matches('input, textarea')) return;
      e.preventDefault();
      router.push(chapterNewHref(id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, id]);

  if (phase === 'loading')
    return <main className="wrap"><p className="caption" aria-live="polite">Opening…</p></main>;

  if (phase === 'missing' || !novel)
    return (
      <main className="wrap">
        <h1 className="display">Not in your library</h1>
        <p className="lede">
          That book isn&apos;t on this device — it may have been removed, or opened in a
          different browser.
        </p>
        <div className="cta">
          <Link href="/library" className="btn" data-variant="primary">Go to your library</Link>
          <Link href="/" className="btn">Browse published novels</Link>
        </div>
      </main>
    );

  const chapters = [...novel.chapters].sort((a, b) => a.ordinal - b.ordinal);
  const words = chapters.reduce((s, c) => s + c.words, 0);
  const at = progress?.chapterIndex ?? -1;
  const pct = Math.round((progress?.percent ?? 0) * 100);
  const resume = progress?.href ?? (chapters[0] ? localChapterHref(novel.id, chapters[0].slug) : '/library');

  const toggleFav = async () => {
    const on = !novel.favorite;
    setNovel({ ...novel, favorite: on });
    try { await setFavorite(novel.id, on); } catch { await load(); }
  };

  const remove = async () => {
    setConfirming(false);
    await deleteNovel(novel.id);
    router.push('/library');
  };

  /* Must run straight off the click: renewing folder permission is only allowed
     inside a user gesture, so this can never be moved into an effect. */
  const sync = async () => {
    setSyncing(true);
    setNote('');
    const r = await refreshFromFolder(novel.id, true);
    setSyncing(false);
    if (!r) { setNote('This book has no folder linked to it.'); return; }
    setNote('error' in r ? r.error : r.note);
    setLink(await linkState(novel.id));
    if (!('error' in r)) await load();
  };

  return (
    <>
      <nav className="crumb chrome" aria-label="Breadcrumb">
        <Link href="/library" className="btn" data-variant="ghost">← Library</Link>
        <span className="caption mono">{chapters.length} chapters</span>
      </nav>

      <main className="wrap">
        <header className="hero">
          <span className="cover" aria-hidden>{novel.title.slice(0, 1)}</span>
          <div className="det">
            <h1 className="display">{novel.title}</h1>
            <p className="title byline">{novel.author || 'On this device'}</p>
            <p className="caption meta mono">
              {chapters.length} chapters · {words.toLocaleString()} words · offline
            </p>

            {/* Says what is actually true of this book's folder, including the cases
                where reconnecting is impossible. */}
            {link !== 'none' && (
              <p className="caption folder" data-state={link}>
                {link === 'linked' && 'Linked to a folder on this device — refreshes automatically.'}
                {link === 'needs-permission' &&
                  'Linked to a folder. Your browser needs one click to read it again.'}
                {link === 'unsupported' &&
                  'Saved as a copy on this device. This browser can’t keep a live folder link.'}
              </p>
            )}

            {note && (
              <p className="caption sync" role="status">
                {note}
                <button className="linkish" onClick={() => setNote('')}>Dismiss</button>
              </p>
            )}

            {pct > 0 && (
              <div className="prog">
                <span className="track" aria-hidden><span style={{ width: `${Math.max(3, pct)}%` }} /></span>
                <p className="caption">
                  {pct}% · {progress ? `Chapter ${progress.chapterIndex + 1} · ${progress.chapterTitle}` : ''}
                </p>
              </div>
            )}

            <div className="cta">
              <Link href={resume} className="btn" data-variant="primary">
                {pct > 0 ? 'Continue reading' : 'Start reading'}
              </Link>
              <button className="btn" aria-pressed={Boolean(novel.favorite)} onClick={toggleFav}>
                {novel.favorite ? '★ Favourited' : '☆ Favourite'}
              </button>
              <Link href={chapterNewHref(novel.id)} className="btn">Add chapter</Link>
              {/* Only offered when it can actually do something. A browser with no
                  handle API, or a book that was never linked, gets no dead button. */}
              {(link === 'linked' || link === 'needs-permission') && (
                <button className="btn" onClick={sync} disabled={syncing}>
                  {syncing
                    ? 'Reading folder…'
                    : link === 'needs-permission' ? 'Reconnect folder' : 'Refresh from folder'}
                </button>
              )}
              <button className="btn danger" onClick={() => setConfirming(true)}>Remove</button>
            </div>
          </div>
        </header>

        <div className="sechead">
          <h2 className="sech title">Chapters</h2>
          {chapters.length > 0 && (
            <Link href={chapterNewHref(novel.id)} className="btn small">+ Add</Link>
          )}
        </div>

        {chapters.length ? (
          <ol className="toc">
            {chapters.map((c, i) => (
              <li key={c.slug}>
                {/* The row reads; editing is its own affordance. A chapter list in a
                    reading app that opens the editor on tap would be a trap. */}
                <Link href={localChapterHref(novel.id, c.slug)} data-current={i === at || undefined}>
                  <span className="caption mono n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="t">{c.title}</span>
                  <span className="caption mono w">
                    {i === at ? 'reading' : i < at ? 'read' : `${c.words.toLocaleString()} words`}
                  </span>
                </Link>
                <Link
                  href={chapterEditHref(novel.id, c.slug)}
                  className="edit"
                  aria-label={`Edit ${c.title}`}
                  title="Edit"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                  </svg>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="blank">
            <p className="title">No chapters yet</p>
            <p className="caption">
              Start with the first one and build the book a page at a time.
            </p>
            <Link href={chapterNewHref(novel.id)} className="btn" data-variant="primary">
              Add the first chapter
            </Link>
          </div>
        )}

        {marks.length > 0 && (
          <>
            <h2 className="sech title">Bookmarks</h2>
            <ul className="marks">
              {marks.map(b => (
                <li key={b.id}>
                  <Link href={b.href} className="mark">
                    <span className="mt">{b.chapterTitle}</span>
                    {b.note && <span className="mq">“{b.note}”</span>}
                  </Link>
                  <button
                    className="mx"
                    aria-label={`Remove bookmark in ${b.chapterTitle}`}
                    onClick={async () => {
                      setMarks(m => m.filter(x => x.id !== b.id));
                      await deleteBookmark(b.id).catch(() => load());
                    }}
                  >✕</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirming}
        title={`Remove “${novel.title}”?`}
        body="Every chapter, your place in the book and its bookmarks are deleted from this device. There is no undo."
        onDismiss={() => setConfirming(false)}
        choices={[
          { label: 'Keep it', onPick: () => setConfirming(false), variant: 'primary' },
          { label: 'Remove from device', onPick: remove, variant: 'danger' }
        ]}
      />

      <style jsx>{`
        .hero .cover {
          display: grid; place-items: center;
          width: clamp(7rem, 20vw, 11rem); aspect-ratio: 2/3;
          border-radius: var(--r-panel); font-family: var(--serif); font-size: 3rem; color: var(--ink-faint);
          background: color-mix(in oklab, var(--ink) 6%, transparent);
          box-shadow: var(--e-3);
        }
        .det { flex: 1 1 20rem; min-width: 0; }
        .folder { margin: 0 0 var(--s-4); color: var(--ink-faint); }
        .folder[data-state='needs-permission'] { color: var(--warn); }
        .sync {
          margin: 0 0 var(--s-4); padding: var(--s-3) var(--s-4);
          border: 1px solid var(--rule); border-radius: var(--r-control);
          background: var(--ok-bg); color: var(--ink);
          display: flex; gap: var(--s-4); align-items: baseline; justify-content: space-between;
          max-width: 34rem;
        }
        .prog { margin: 0 0 1.25rem; max-width: 22rem; }
        .track {
          display: block; height: 4px; border-radius: var(--r-round); margin-bottom: 0.4rem;
          background: color-mix(in oklab, var(--ink) 14%, transparent);
        }
        .track :global(span) { display: block; height: 100%; border-radius: var(--r-round); background: var(--accent); }
        .cta :global(a) { text-decoration: none; }
        .danger { color: var(--err); }
        .danger:hover { border-color: var(--err); background: var(--err-bg); }
        .sechead {
          display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-5);
          margin: clamp(2.5rem, 6vw, 3.5rem) 0 var(--s-4);
        }
        .sechead :global(.small) { flex: none; font-size: 0.78rem; text-decoration: none; }
        .sech { margin: clamp(2.5rem, 6vw, 3.5rem) 0 var(--s-4); }
        .sechead .sech { margin: 0; }

        /* Row = read, trailing button = edit. Overriding the global .toc grid, which
           assumes the link is the whole row. */
        .toc li { display: flex; align-items: stretch; gap: var(--s-1); }
        .toc :global(a:not(.edit)) { flex: 1; min-width: 0; }
        .toc :global(.edit) {
          flex: none; display: grid; place-items: center; width: 2.4rem;
          color: var(--ink-faint); border-radius: var(--r-tight); text-decoration: none;
          transition: color var(--quick), background-color var(--quick);
        }
        .toc :global(.edit:hover) { color: var(--ink); background: color-mix(in oklab, var(--ink) 8%, transparent); }
        .toc :global(.edit:focus-visible) { outline: var(--focus); outline-offset: -2px; }

        .blank {
          display: grid; justify-items: center; gap: var(--s-3); text-align: center;
          padding: clamp(var(--s-7), 7vw, var(--s-8)) var(--s-5);
          border: 1px dashed var(--rule); border-radius: var(--r-panel);
        }
        .blank p { margin: 0; max-width: 24rem; }
        .blank :global(a) { margin-top: var(--s-2); text-decoration: none; }
        .toc :global(a[data-current]) { background: color-mix(in oklab, var(--accent) 10%, transparent); }
        .toc :global(a[data-current] .t) { color: var(--accent); }
        .none { padding: 1rem 0.5rem; border-top: 1px solid var(--rule); }
        .linkish {
          background: none; border: 0; padding: 0; font: inherit; color: var(--accent);
          cursor: pointer; text-decoration: underline; text-underline-offset: 0.16em;
        }
        .marks { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
        .marks li { display: flex; align-items: center; gap: 0.4rem; border-top: 1px solid var(--rule); }
        .marks li:last-child { border-bottom: 1px solid var(--rule); }
        /* <Link> again: scoped from the list, since styled-jsx only marks host elements. */
        .marks :global(.mark) {
          flex: 1; min-width: 0; display: grid; gap: 0.2rem; padding: 0.8rem 0.5rem;
          color: var(--ink); text-decoration: none; border-radius: 0.6rem;
          transition: background-color var(--quick);
        }
        .marks :global(.mark:hover) { background: color-mix(in oklab, var(--ink) 5%, transparent); }
        .marks :global(.mt) { font-size: 0.95rem; }
        .marks :global(.mq) {
          font-family: var(--serif); font-style: italic; color: var(--ink-dim); font-size: 0.92rem;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .mx {
          flex: none; width: 2.2rem; height: 2.2rem; border-radius: 0.5rem; border: 0;
          background: transparent; color: var(--ink-dim); cursor: pointer;
        }
        .mx:hover { background: color-mix(in oklab, var(--ink) 10%, transparent); color: var(--ink); }
      `}</style>
    </>
  );
}

export default function NovelScreen() {
  return (
    <Suspense fallback={<main className="wrap"><p className="caption">Opening…</p></main>}>
      <NovelBody />
    </Suspense>
  );
}
