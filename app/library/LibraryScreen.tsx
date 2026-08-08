'use client';
// The Library. Everything the reader has: folders they imported, published novels they
// opened, where they stopped, what they starred, what they marked.
//
// It reads IndexedDB through lib/library and shapes it through lib/library-select.
// Those two are the seam — when there's an account behind this, only the loader below
// changes, not the screen.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import NovelCard from '@/components/NovelCard';
import {
  deleteBookmark, ensureSeeded, listBookmarks, listNovels, listProgress,
  listSaved, putNovel, removeFromLibrary, setFavorite, usage,
  type Bookmark
} from '@/lib/library';
import { localNovelHref } from '@/lib/routes';
import {
  buildCards, continueReading, favorites, history, searchBookmarks, selectCards,
  type Card, type Sort, type StatusFilter
} from '@/lib/library-select';
import {
  importFromDrop, importFromFiles, importFromPicker, refreshAllLinked,
  supportsDirectoryPicker, type ImportResult
} from '@/lib/import';

type Tab = 'all' | 'favorites' | 'bookmarks' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All books' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'history', label: 'History' }
];
const isTab = (v: string | null): v is Tab => TABS.some(t => t.id === v);

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recently read' },
  { id: 'added', label: 'Recently added' },
  { id: 'title', label: 'Title' },
  { id: 'progress', label: 'Progress' }
];
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'reading', label: 'Reading' },
  { id: 'new', label: 'Not started' },
  { id: 'finished', label: 'Finished' }
];

const bytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} d ago` : new Date(t).toLocaleDateString();
}

function LibraryBody() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'all';

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<Card | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (): Promise<string[] | undefined> => {
    try {
      await ensureSeeded();
      const [novels, saved, progress, bookmarks, space] = await Promise.all([
        listNovels(), listSaved(), listProgress(), listBookmarks(), usage().catch(() => null)
      ]);
      setCards(buildCards(novels, saved, progress));
      setMarks(bookmarks);
      setSpace(space);
      setPhase('ready');
      return novels.map(n => n.id);
    } catch {
      setPhase('error');
    }
  }, []);

  /* Anything still linked to a folder gets refreshed on the way in — silently, and only
     where permission survived. A folder that needs a click is left alone until the
     reader opens that book; prompting on page load is how you train someone to say no. */
  useEffect(() => {
    let live = true;
    (async () => {
      const ids = await load();
      if (!live || !ids?.length) return;
      const changed = await refreshAllLinked(ids);
      if (!live || !changed) return;
      setNote(`Picked up new writing in ${changed} linked ${changed === 1 ? 'folder' : 'folders'}.`);
      await load();
    })();
    return () => { live = false; };
  }, [load]);

  const goTab = (id: Tab) => {
    // A tab is a place, so it gets a URL and a history entry — back returns to the
    // shelf you were on, and a link to /library?tab=bookmarks opens there.
    router.push(id === 'all' ? '/library' : `/library?tab=${id}`, { scroll: false });
  };

  const onFavorite = async (id: string, on: boolean) => {
    setCards(cs => cs.map(c => (c.id === id ? { ...c, favorite: on } : c)));   // optimistic
    try { await setFavorite(id, on); } catch { await load(); }
  };

  const onRemove = async (card: Card) => {
    setRemoving(null);
    setCards(cs => cs.filter(c => c.id !== card.id));
    try { await removeFromLibrary(card.id); } finally { await load(); }
  };

  const onDropBookmark = async (b: Bookmark) => {
    setMarks(m => m.filter(x => x.id !== b.id));
    try { await deleteBookmark(b.id); } catch { await load(); }
  };

  const settle = async (r: ImportResult | null) => {
    setBusy(false);
    if (!r) return;
    if ('error' in r) { setNote(r.error); return; }
    setNote(`Added “${r.novel.title}” — ${r.novel.chapters.length} chapters.`);
    await load();
  };

  const addFolder = async () => {
    if (!supportsDirectoryPicker()) { fileInput.current?.click(); return; }
    setBusy(true);
    await settle(await importFromPicker());
  };

  /** A book with nothing in it yet — for writing rather than importing. */
  const startBlank = async () => {
    const id = `untitled-${Date.now().toString(36)}`;
    try {
      await putNovel({ id, title: 'Untitled', addedAt: Date.now(), chapters: [] });
      router.push(localNovelHref(id));
    } catch {
      setNote('Could not create a book. This browser is blocking on-device storage.');
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setBusy(true);
    await settle(await importFromDrop(e));
  };

  const shown = useMemo(() => selectCards(cards, { q, status, sort }), [cards, q, status, sort]);
  const reading = useMemo(() => continueReading(cards), [cards]);
  const starred = useMemo(() => selectCards(favorites(cards), { q, status, sort }), [cards, q, status, sort]);
  const past = useMemo(() => selectCards(history(cards), { q, status, sort: 'recent' }), [cards, q, status]);
  const bookmarks = useMemo(() => searchBookmarks(marks, q), [marks, q]);

  const counts: Record<Tab, number> = {
    all: cards.length,
    favorites: cards.filter(c => c.favorite).length,
    bookmarks: marks.length,
    history: cards.filter(c => c.lastReadAt != null).length
  };

  /* ---- states before the shelves ---- */
  if (phase === 'loading') return <Skeleton />;

  if (phase === 'error')
    return (
      <div className="wrap">
        <EmptyState title="Your library didn’t open">
          <p className="caption">
            This browser is blocking on-device storage — usually private browsing, or a
            setting that clears site data. Reading still works; nothing will be remembered.
          </p>
          <button className="btn" data-variant="primary" onClick={() => { setPhase('loading'); void load(); }}>
            Try again
          </button>
        </EmptyState>
      </div>
    );

  const filtered = Boolean(q.trim()) || status !== 'all';
  const clearFilters = (
    <button className="btn" onClick={() => { setQ(''); setStatus('all'); }}>Clear search and filters</button>
  );

  return (
    <div
      className="screen"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
      data-dragging={dragging || undefined}
    >
      <header className="head">
        <div>
          <h1 className="display">Library</h1>
          <p className="caption sub">
            {cards.length
              ? `${cards.length} ${cards.length === 1 ? 'book' : 'books'} · ${counts.bookmarks} bookmark${counts.bookmarks === 1 ? '' : 's'}`
              : 'Nothing here yet.'}
          </p>
        </div>
        <div className="headtools">
          <button className="btn" data-variant="primary" onClick={addFolder} disabled={busy}>
            {busy ? 'Reading folder…' : 'Add a folder'}
          </button>
          <Link href="/publish" className="btn">Import files</Link>
          <button className="btn" onClick={startBlank}>Start blank</button>
          <input
            ref={fileInput} type="file" hidden multiple
            // @ts-expect-error non-standard, required for the Firefox/Safari path
            webkitdirectory="" directory=""
            onChange={async e => { setBusy(true); await settle(await importFromFiles(e.target.files)); }}
          />
        </div>
      </header>

      {note && (
        <p className="note caption" role="status">
          {note}
          <button className="linkish" onClick={() => setNote('')}>Dismiss</button>
        </p>
      )}

      {/* Continue reading — the shelf that earns the trip to this page. Only drawn
          when there is something half-finished on it. */}
      {reading.length > 0 && (
        <section className="rail" aria-labelledby="continue-h">
          <h2 id="continue-h" className="title sec">Continue reading</h2>
          <ul className="railrow">
            {reading.slice(0, 8).map(c => (
              <li key={c.id}>
                <Link href={c.resumeHref} className="resume">
                  <span className="rart" aria-hidden>
                    {c.cover ? <img src={c.cover} alt="" /> : <span className="rblank">{c.title.slice(0, 1)}</span>}
                  </span>
                  <span className="rtext">
                    <span className="rtitle">{c.title}</span>
                    <span className="caption rch">{c.chapterLabel ?? 'Chapter 1'}</span>
                    <span className="rbar" aria-hidden>
                      <span style={{ width: `${Math.max(3, Math.round(c.percent * 100))}%` }} />
                    </span>
                    <span className="caption rpct">
                      {Math.round(c.percent * 100)}% · {c.lastReadAt ? ago(c.lastReadAt) : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="controls">
        <nav className="tabs" aria-label="Library sections">
          {TABS.map(t => (
            <button
              key={t.id}
              className="tab"
              data-active={tab === t.id || undefined}
              aria-current={tab === t.id ? 'true' : undefined}
              onClick={() => goTab(t.id)}
            >
              {t.label} <span className="n caption mono">{counts[t.id]}</span>
            </button>
          ))}
        </nav>

        <div className="filters">
          <label className="search">
            <span className="sr">Search your library</span>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.4" /><path d="m16 16 4 4" />
            </svg>
            <input
              type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder={tab === 'bookmarks' ? 'Search bookmarks' : 'Search titles and authors'}
            />
          </label>

          {tab !== 'bookmarks' && (
            <>
              <label className="sel">
                <span className="sr">Sort by</span>
                <select value={sort} onChange={e => setSort(e.target.value as Sort)} disabled={tab === 'history'}>
                  {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <div className="chips" role="group" aria-label="Filter by status">
                {FILTERS.map(f => (
                  <button
                    key={f.id} className="chip" data-on={status === f.id || undefined}
                    aria-pressed={status === f.id} onClick={() => setStatus(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* The two card shelves are written out rather than shared through a helper:
          styled-jsx scopes only the JSX in this returned tree, and a `.grid` built in a
          function above would silently inherit the landing page's grid instead. */}
      {tab === 'all' && (shown.length ? (
        <ul className="grid">
          {shown.map(c => (
            <li key={c.id}><NovelCard card={c} onFavorite={onFavorite} onRemove={setRemoving} /></li>
          ))}
        </ul>
      ) : filtered ? (
        <EmptyState title="No books match">
          <p className="caption">Nothing in your library fits that search and filter.</p>
          {clearFilters}
        </EmptyState>
      ) : (
        <EmptyState title="Your library is empty">
          <p className="caption">
            Point the reader at a folder of markdown chapters — drop it anywhere on this
            page. Files stay on your device.
          </p>
          <span className="row">
            <button className="btn" data-variant="primary" onClick={addFolder}>Choose a folder</button>
            <Link href="/" className="btn">Browse published novels</Link>
          </span>
        </EmptyState>
      ))}

      {tab === 'favorites' && (starred.length ? (
        <ul className="grid">
          {starred.map(c => (
            <li key={c.id}><NovelCard card={c} onFavorite={onFavorite} onRemove={setRemoving} /></li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nothing starred yet">
          <p className="caption">Tap the star on any book and it lands here.</p>
          <button className="btn" onClick={() => goTab('all')}>Go to all books</button>
        </EmptyState>
      ))}

      {tab === 'bookmarks' && (
        bookmarks.length ? (
          <ul className="rows">
            {bookmarks.map(b => (
              <li key={b.id}>
                <Link href={b.href} className="row-main">
                  <span className="rowtop">
                    <span className="rowt">{b.chapterTitle}</span>
                    <span className="caption">{b.novelTitle} · {ago(b.at)}</span>
                  </span>
                  {b.note && <span className="quote">“{b.note}”</span>}
                </Link>
                <button className="rowx" aria-label={`Remove bookmark in ${b.chapterTitle}`} onClick={() => onDropBookmark(b)}>✕</button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={q ? 'No bookmarks match' : 'No bookmarks yet'}>
            <p className="caption">
              {q ? 'Try a different word.' : 'While reading, the bookmark button in the top bar saves your exact spot.'}
            </p>
            {q ? clearFilters : <button className="btn" onClick={() => goTab('all')}>Go to all books</button>}
          </EmptyState>
        )
      )}

      {tab === 'history' && (
        past.length ? (
          <ul className="rows">
            {past.map(c => (
              <li key={c.id}>
                <Link href={c.resumeHref} className="row-main">
                  <span className="rowtop">
                    <span className="rowt">{c.title}</span>
                    <span className="caption">
                      {c.lastReadAt ? ago(c.lastReadAt) : ''} · {Math.round(c.percent * 100)}%
                      {c.status === 'finished' ? ' · finished' : ''}
                    </span>
                  </span>
                  {c.chapterLabel && <span className="quote plain">{c.chapterLabel}</span>}
                </Link>
                <Link href={c.detailsHref} className="btn small">Details</Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing read yet">
            <p className="caption">Open any book and it starts keeping your place.</p>
            <button className="btn" onClick={() => goTab('all')}>Go to all books</button>
          </EmptyState>
        )
      )}

      {tab === 'all' && cards.length > 0 && (
        <p className="caption foot">
          {cards.filter(c => c.offline).length} of {cards.length} stored on this device and readable offline
          {space ? ` · ${bytes(space.used)} used of ${bytes(space.quota)} available` : ''}.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove “${removing?.title ?? ''}”?`}
        body={
          removing?.offline
            ? 'Every chapter, your place in the book and its bookmarks are deleted from this device. There is no undo.'
            : 'It leaves your shelf along with your place in it. The novel itself stays published, so you can open it again from Discover.'
        }
        onDismiss={() => setRemoving(null)}
        choices={[
          { label: 'Keep it', onPick: () => setRemoving(null), variant: 'primary' },
          { label: removing?.offline ? 'Delete from device' : 'Remove from library',
            onPick: () => { if (removing) void onRemove(removing); }, variant: 'danger' }
        ]}
      />

      <div className="dropveil" aria-hidden><span>Drop a folder of chapters</span></div>

      <style jsx>{`
        .screen { max-width: 68rem; margin-inline: auto; padding: clamp(1.5rem, 4vw, 2.5rem) 1.25rem 6rem; position: relative; }
        .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

        .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem 1.5rem; flex-wrap: wrap; }
        .head .sub { margin: 0.5rem 0 0; }
        .headtools { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .headtools :global(a) { text-decoration: none; }

        .note {
          margin: 1rem 0 0; padding: 0.6rem 0.85rem; border-radius: 0.7rem;
          border: 1px solid var(--rule); background: var(--ok-bg);
          color: var(--ink); display: flex; gap: 0.75rem; align-items: baseline; justify-content: space-between;
        }
        .linkish {
          background: none; border: 0; padding: 0; font: inherit; color: var(--accent);
          cursor: pointer; text-decoration: underline; text-underline-offset: 0.16em;
        }

        /* ---- continue reading rail ---- */
        .rail { margin-top: clamp(1.5rem, 4vw, 2.25rem); }
        .sec { margin: 0 0 0.85rem; }
        .railrow {
          list-style: none; margin: 0; padding: 0 0 0.35rem;
          display: grid; grid-auto-flow: column; grid-auto-columns: min(20rem, 78vw);
          gap: 0.75rem; overflow-x: auto; scroll-snap-type: x proximity;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
        }
        .railrow li { scroll-snap-align: start; }
        /* .resume and .row-main are <Link>s — styled-jsx scopes host elements only,
           so they are reached with :global() from the scoped list around them. */
        .railrow :global(.resume) {
          display: flex; gap: 0.8rem; padding: 0.7rem; height: 100%;
          border: 1px solid var(--rule); border-radius: var(--r-panel); text-decoration: none; color: var(--ink);
          background: color-mix(in oklab, var(--ink) 3%, transparent);
          transition: border-color var(--quick), background-color var(--quick), transform var(--quick);
        }
        .railrow :global(.resume:hover) { border-color: color-mix(in oklab, var(--accent) 40%, var(--rule)); }
        .railrow :global(.resume:active) { transform: scale(0.99); }
        .railrow :global(.resume:focus-visible) { outline: var(--focus); outline-offset: var(--focus-gap); }
        .railrow :global(.rart) { flex: none; width: 3.4rem; }
        .railrow :global(.rart img), .rblank {
          display: grid; place-items: center; width: 100%; aspect-ratio: 2/3; object-fit: cover;
          border-radius: 0.45rem; background: color-mix(in oklab, var(--ink) 8%, transparent);
          font-family: var(--serif); font-size: 1.35rem; color: var(--ink-faint);
        }
        .railrow :global(.rtext) { display: grid; gap: 0.18rem; align-content: start; min-width: 0; flex: 1; }
        .railrow :global(.rtitle) { font-size: 0.92rem; line-height: 1.25; }
        .railrow :global(.rch), .railrow :global(.rpct) {
          display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .railrow :global(.rbar) {
          display: block; height: 3px; border-radius: var(--r-round); margin: 0.35rem 0 0.1rem;
          background: color-mix(in oklab, var(--ink) 14%, transparent);
        }
        .railrow :global(.rbar span) { display: block; height: 100%; border-radius: var(--r-round); background: var(--accent); }
        .railrow :global(.rpct) { color: var(--ink-faint); }

        /* ---- controls ---- */
        .controls {
          position: sticky; top: 3.1rem; z-index: var(--z-sticky);
          margin: clamp(1.5rem, 4vw, 2.25rem) -1.25rem 0; padding: 0.6rem 1.25rem 0.7rem;
          background: var(--chrome);
          backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
          display: grid; gap: 0.6rem;
        }
        .tabs { display: flex; gap: 0.2rem; overflow-x: auto; scrollbar-width: none; }
        .tabs::-webkit-scrollbar { display: none; }
        .tab {
          flex: none; background: transparent; border: 0; cursor: pointer; font: inherit;
          font-size: 0.86rem; color: var(--ink-dim); padding: 0.42rem 0.7rem; border-radius: 0.6rem;
          transition: color var(--quick), background-color var(--quick);
        }
        .tab:hover { color: var(--ink); background: color-mix(in oklab, var(--ink) 6%, transparent); }
        .tab[data-active] { color: var(--accent); background: color-mix(in oklab, var(--accent) 12%, transparent); }
        .tab:focus-visible { outline: var(--focus); outline-offset: var(--focus-gap); }
        .tab .n { color: inherit; opacity: 0.6; }

        .filters { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
        .search {
          display: flex; align-items: center; gap: 0.45rem; flex: 1 1 12rem; min-width: 0;
          border: 1px solid var(--rule); border-radius: var(--r-control); padding: 0 var(--s-4);
          color: var(--ink-faint);
          transition: border-color var(--quick);
        }
        .search:focus-within { border-color: color-mix(in oklab, var(--accent) 55%, var(--rule)); }
        .search :global(input) {
          flex: 1; min-width: 0; background: transparent; border: 0; outline: none;
          color: var(--ink); font: inherit; font-size: 0.86rem; padding: 0.45rem 0;
        }
        .sel :global(select) {
          background: transparent; color: var(--ink); font: inherit; font-size: 0.84rem;
          border: 1px solid var(--rule); border-radius: 0.62rem; padding: 0.42rem 0.5rem; cursor: pointer;
        }
        .sel :global(select:disabled) { opacity: 0.45; cursor: default; }
        .chips { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .chip {
          background: transparent; border: 1px solid var(--rule); border-radius: var(--r-round);
          color: var(--ink-dim); font: inherit; font-size: 0.78rem; padding: 0.3rem 0.68rem;
          cursor: pointer; transition: color var(--quick), border-color var(--quick), background-color var(--quick);
        }
        .chip:hover { color: var(--ink); }
        .chip[data-on] {
          color: var(--accent); border-color: color-mix(in oklab, var(--accent) 45%, var(--rule));
          background: color-mix(in oklab, var(--accent) 10%, transparent);
        }
        .chip:focus-visible { outline: var(--focus); outline-offset: var(--focus-gap); }

        /* ---- shelves ---- */
        .grid {
          list-style: none; margin: 1.5rem 0 0; padding: 0;
          display: grid; gap: 1.75rem 1.2rem;
          grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
        }
        @media (max-width: 26rem) { .grid { grid-template-columns: repeat(2, 1fr); gap: 1.4rem 0.9rem; } }

        .rows { list-style: none; margin: 1.25rem 0 0; padding: 0; display: grid; gap: 1px; }
        .rows li {
          display: flex; align-items: center; gap: 0.5rem;
          border-top: 1px solid var(--rule);
        }
        .rows li:last-child { border-bottom: 1px solid var(--rule); }
        .rows :global(.row-main) {
          flex: 1; min-width: 0; display: grid; gap: 0.25rem; text-decoration: none; color: var(--ink);
          padding: 0.85rem 0.5rem; border-radius: 0.6rem;
          transition: background-color var(--quick);
        }
        .rows :global(.row-main:hover) { background: color-mix(in oklab, var(--ink) 5%, transparent); }
        .rows :global(.row-main:focus-visible) { outline: var(--focus); outline-offset: -2px; }
        .rows :global(.rowtop) {
          display: flex; gap: 0.75rem; align-items: baseline; justify-content: space-between; flex-wrap: wrap;
        }
        .rows :global(.rowt) { font-size: 0.98rem; }
        .rows :global(.quote) {
          font-family: var(--serif); color: var(--ink-dim); font-size: 0.92rem; font-style: italic;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .rows :global(.quote.plain) { font-style: normal; font-family: var(--ui); font-size: 0.82rem; }
        .rowx {
          flex: none; width: 2.2rem; height: 2.2rem; border-radius: 0.5rem; border: 0;
          background: transparent; color: var(--ink-dim); cursor: pointer; font-size: 0.9rem;
        }
        .rowx:hover { background: color-mix(in oklab, var(--ink) 10%, transparent); color: var(--ink); }
        .rowx:focus-visible { outline: var(--focus); outline-offset: -2px; }
        .rows :global(.small) { flex: none; font-size: 0.78rem; text-decoration: none; }

        .foot { margin: 2.5rem 0 0; color: var(--ink-faint); }

        /* ---- drop target: the whole page, announced only while dragging ---- */
        .dropveil {
          position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
          background: color-mix(in oklab, var(--paper) 78%, transparent);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          opacity: 0; pointer-events: none; transition: opacity var(--quick);
        }
        .screen[data-dragging] .dropveil { opacity: 1; }
        .dropveil span {
          border: 1px dashed color-mix(in oklab, var(--accent) 60%, var(--rule));
          border-radius: 1rem; padding: 2rem 3rem; font-size: 1.05rem;
        }
        code { font-family: ui-monospace, monospace; font-size: 0.9em; }
      `}</style>
    </div>
  );
}

/** Every empty shelf looks the same and says something different. A shared frame keeps
 *  "nothing here" from reading like "something broke". */
function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="state">
      <h2 className="title">{title}</h2>
      {children}
      <style jsx>{`
        .state {
          display: grid; justify-items: center; gap: 0.7rem; text-align: center;
          margin: 2.5rem auto 0; padding: clamp(2rem, 7vw, 3.5rem) 1.5rem;
          max-width: 32rem; border: 1px dashed var(--rule); border-radius: 1rem;
        }
        .state h2 { margin: 0; }
        .state :global(p) { margin: 0; max-width: 26rem; }
        .state :global(.row) { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
        .state :global(a) { text-decoration: none; }
      `}</style>
    </div>
  );
}

/** Shelf-shaped placeholders, so the page doesn't reflow when the data lands. */
function Skeleton() {
  return (
    <div className="screen" aria-busy="true" aria-live="polite">
      <span className="sr">Loading your library</span>
      <div className="bar w1" />
      <div className="bar w2" />
      <ul className="grid">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <div className="art" />
            <div className="bar w3" />
            <div className="bar w4" />
          </li>
        ))}
      </ul>
      <style jsx>{`
        .screen { max-width: 68rem; margin-inline: auto; padding: clamp(1.5rem, 4vw, 2.5rem) 1.25rem 6rem; }
        .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        .bar, .art {
          background: color-mix(in oklab, var(--ink) 8%, transparent);
          border-radius: 0.4rem; animation: pulse 1.6s ease-in-out infinite;
        }
        .art { aspect-ratio: 2/3; border-radius: 0.7rem; margin-bottom: 0.6rem; }
        .w1 { height: 2.4rem; width: 9rem; }
        .w2 { height: 0.9rem; width: 13rem; margin: 0.7rem 0 2.5rem; }
        .w3 { height: 0.85rem; width: 80%; }
        .w4 { height: 0.7rem; width: 55%; margin-top: 0.4rem; }
        .grid {
          list-style: none; margin: 0; padding: 0;
          display: grid; gap: 1.75rem 1.2rem;
          grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
        }
        @media (max-width: 26rem) { .grid { grid-template-columns: repeat(2, 1fr); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        /* Reduced motion gets a held placeholder, not a dead grey page. */
        @media (prefers-reduced-motion: reduce) { .bar, .art { animation: none; opacity: 0.7; } }
      `}</style>
    </div>
  );
}

export default function LibraryScreen() {
  // useSearchParams needs a boundary to prerender — the static build renders the
  // skeleton into the HTML and swaps in the real shelves on hydration.
  return (
    <Suspense fallback={<Skeleton />}>
      <LibraryBody />
    </Suspense>
  );
}
