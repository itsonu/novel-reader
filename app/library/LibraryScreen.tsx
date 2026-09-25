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
import Cover from '@/components/Cover';
import Icon from '@/components/Icon';
import Menu from '@/components/Menu';
import { toast } from '@/components/Toaster';
import {
  deleteBookmark, ensureSeeded, listBookmarks, listNovels, listProgress,
  listSaved, onLibraryChanged, putBookmark, putNovel, removeFromLibrary, restore, setFavorite, snapshot, usage,
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
import { ago } from '@/lib/ui';

type Tab = 'all' | 'favorites' | 'bookmarks' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
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
const VIEW_KEY = 'nr:libview';

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
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<Card | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch { /* default */ }
  }, []);
  const pickView = (v: 'grid' | 'list') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* per visit */ }
  };

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
      toast({ message: `Picked up new writing in ${changed} linked ${changed === 1 ? 'folder' : 'folders'}.`, tone: 'ok' });
      await load();
    })();
    const off = onLibraryChanged(() => void load());
    return () => { live = false; off(); };
  }, [load]);

  /* "/" jumps to search, the way it does on most of the web. */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || (e.target as HTMLElement).matches('input, textarea, select')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault(); search.current?.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const goTab = (id: Tab) => {
    // A tab is a place, so it gets a URL and a history entry — back returns to the
    // shelf you were on, and a link to /library?tab=bookmarks opens there.
    router.push(id === 'all' ? '/library' : `/library?tab=${id}`, { scroll: false });
  };

  const onFavorite = async (id: string, on: boolean) => {
    setCards(cs => cs.map(c => (c.id === id ? { ...c, favorite: on } : c)));   // optimistic
    try {
      await setFavorite(id, on);
      toast({ message: on ? 'Added to favourites' : 'Removed from favourites' });
    } catch { await load(); }
  };

  /** Remove now, keep everything needed to put it back for as long as the toast lives. */
  const onRemove = async (card: Card) => {
    setRemoving(null);
    setCards(cs => cs.filter(c => c.id !== card.id));
    try {
      const snap = await snapshot(card.id);
      await removeFromLibrary(card.id);
      toast({
        message: `Removed “${card.title}”`,
        action: { label: 'Undo', onClick: async () => { await restore(snap); await load(); } }
      });
    } catch {
      toast({ message: 'Couldn’t remove that book.', tone: 'err' });
    } finally { await load(); }
  };
  /* A published book costs nothing to remove — it's still published — so no dialog, just Undo. */
  const askRemove = (card: Card) => (card.offline ? setRemoving(card) : void onRemove(card));

  const onDropBookmark = async (b: Bookmark) => {
    setMarks(m => m.filter(x => x.id !== b.id));
    try {
      await deleteBookmark(b.id);
      toast({ message: 'Bookmark removed', action: { label: 'Undo', onClick: async () => { await putBookmark(b); setMarks(m => [...m, b]); } } });
    } catch { await load(); }
  };

  const settle = async (r: ImportResult | null) => {
    setBusy(false);
    if (!r) return;
    if ('error' in r) { toast({ message: r.error, tone: 'err' }); return; }
    toast({ message: `Added “${r.novel.title}” — ${r.novel.chapters.length} chapters.`, tone: 'ok',
      action: { label: 'Open', onClick: () => router.push(localNovelHref(r.novel.id)) } });
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
      await putNovel({ id, title: 'Untitled book', addedAt: Date.now(), chapters: [] });
      router.push(localNovelHref(id));
    } catch {
      toast({ message: 'Could not create a book. This browser is blocking on-device storage.', tone: 'err' });
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

  if (phase === 'loading') return <Skeleton />;

  if (phase === 'error')
    return (
      <div className="wrap">
        <div className="empty">
          <span className="glyph"><Icon name="alert" size={26} /></span>
          <h1 className="title">Your library didn’t open</h1>
          <p>
            This browser is blocking on-device storage — usually private browsing, or a setting
            that clears site data. Reading still works; nothing will be remembered.
          </p>
          <div className="actions">
            <button className="btn" data-variant="primary" onClick={() => { setPhase('loading'); void load(); }}>
              <Icon name="refresh" size={16} /> Try again
            </button>
          </div>
        </div>
      </div>
    );

  const filtered = Boolean(q.trim()) || status !== 'all';
  const clearFilters = (
    <button className="btn" onClick={() => { setQ(''); setStatus('all'); }}>Clear search and filters</button>
  );
  const featured = tab === 'all' && !filtered ? reading[0] : undefined;
  const addMenu = (
    <Menu
      label="Add books"
      variant="primary"
      trigger={<><Icon name="plus" size={17} /> {busy ? 'Reading folder…' : 'Add'}</>}
      items={[
        { label: 'Open a folder of chapters', icon: 'folder', onSelect: () => void addFolder() },
        { label: 'Import markdown files', icon: 'file', href: '/publish' },
        'sep',
        { label: 'Start a blank book', icon: 'pen', onSelect: () => void startBlank() }
      ]}
    />
  );

  const shelf = (list: Card[]) =>
    view === 'grid' ? (
      <ul className="libgrid stagger">
        {list.map((c, i) => (
          <li key={c.id} style={{ ['--i' as string]: i }}>
            <NovelCard card={c} onFavorite={onFavorite} onRemove={askRemove} />
          </li>
        ))}
      </ul>
    ) : (
      <ul className="liblist stagger">
        {list.map((c, i) => (
          <li key={c.id} style={{ ['--i' as string]: i }}>
            <NovelCard card={c} onFavorite={onFavorite} onRemove={askRemove} view="list" />
          </li>
        ))}
      </ul>
    );

  return (
    <div
      className="screen"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
      data-dragging={dragging || undefined}
    >
      <header className="pagehead">
        <div>
          <h1 className="display">Library</h1>
          <p className="caption sub">
            {cards.length
              ? `${cards.length} ${cards.length === 1 ? 'book' : 'books'} · ${counts.bookmarks} bookmark${counts.bookmarks === 1 ? '' : 's'}`
              : 'Nothing here yet.'}
          </p>
        </div>
        <div className="acts">
          {addMenu}
          <input
            ref={fileInput} type="file" hidden multiple
            // @ts-expect-error non-standard, required for the Firefox/Safari path
            webkitdirectory="" directory=""
            onChange={async e => { setBusy(true); await settle(await importFromFiles(e.target.files)); }}
          />
        </div>
      </header>

      {/* Continue reading — the reason to come to this page. The latest book gets the
          stage; the rest queue beside it. Only drawn when something is half-finished. */}
      {featured && (
        <section className="continue" aria-labelledby="continue-h">
          <h2 id="continue-h" className="sr-only">Continue reading</h2>
          <Link href={featured.resumeHref} className="feature">
            <Cover title={featured.title} author={featured.author} src={featured.cover} size="sm" />
            <span className="ft">
              <span className="eyebrow">Continue reading</span>
              <span className="ftt">{featured.title}</span>
              <span className="caption ftc">{featured.chapterLabel ?? 'Chapter 1'}</span>
              <span className="ftm">
                <span className="meter" style={{ ['--p' as string]: featured.percent }} />
                <span className="caption mono">{Math.round(featured.percent * 100)}%{featured.lastReadAt ? ` · ${ago(featured.lastReadAt)}` : ''}</span>
              </span>
            </span>
            <span className="fgo btn" data-variant="primary" aria-hidden><Icon name="book" size={17} /> Resume</span>
          </Link>
          {reading.length > 1 && (
            <ul className="railrow">
              {reading.slice(1, 7).map(c => (
                <li key={c.id}>
                  <Link href={c.resumeHref} className="mini">
                    <Cover title={c.title} author={c.author} src={c.cover} size="xs" />
                    <span className="mt">
                      <span className="mtt">{c.title}</span>
                      <span className="meter" data-size="sm" style={{ ['--p' as string]: c.percent }} />
                      <span className="caption mono">{Math.round(c.percent * 100)}%</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="controls">
        <div className="row1">
          <div className="seg tabs" role="tablist" aria-label="Library sections">
            {TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => goTab(t.id)}
              >
                {t.label}<span className="n mono">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          {(tab === 'all' || tab === 'favorites') && (
            <div className="seg views" role="radiogroup" aria-label="View">
              <button role="radio" aria-checked={view === 'grid'} aria-label="Grid" title="Grid" onClick={() => pickView('grid')}><Icon name="grid" size={16} /></button>
              <button role="radio" aria-checked={view === 'list'} aria-label="List" title="List" onClick={() => pickView('list')}><Icon name="rows" size={16} /></button>
            </div>
          )}
        </div>

        <div className="row2">
          <label className="search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search your library</span>
            <input
              ref={search} className="input" type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder={tab === 'bookmarks' ? 'Search bookmarks' : 'Search titles and authors'}
              aria-keyshortcuts="/"
            />
          </label>
          {tab !== 'bookmarks' && (
            <>
              <label>
                <span className="sr-only">Sort by</span>
                <select className="select" value={sort} onChange={e => setSort(e.target.value as Sort)} disabled={tab === 'history'}>
                  {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <div className="chips" role="group" aria-label="Filter by status">
                {FILTERS.map(f => (
                  <button key={f.id} className="chip" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shelves" role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label}>
        {tab === 'all' && (shown.length ? shelf(shown) : filtered ? (
          <div className="empty">
            <span className="glyph"><Icon name="search" size={24} /></span>
            <h2 className="title">No books match</h2>
            <p>Nothing in your library fits that search and filter.</p>
            <div className="actions">{clearFilters}</div>
          </div>
        ) : (
          <div className="empty">
            <span className="glyph"><Icon name="library" size={26} /></span>
            <h2 className="title">Your library is empty</h2>
            <p>Point the reader at a folder of markdown chapters — or drop one anywhere on this page. Files stay on your device.</p>
            <div className="actions">
              <button className="btn" data-variant="primary" onClick={addFolder}><Icon name="folder" size={17} /> Choose a folder</button>
              <button className="btn" onClick={startBlank}><Icon name="pen" size={17} /> Start writing</button>
            </div>
          </div>
        ))}

        {tab === 'favorites' && (starred.length ? shelf(starred) : (
          <div className="empty">
            <span className="glyph"><Icon name="star" size={24} /></span>
            <h2 className="title">Nothing starred yet</h2>
            <p>Star a book from its page or its ··· menu and it lands here.</p>
            <div className="actions"><button className="btn" onClick={() => goTab('all')}>Go to all books</button></div>
          </div>
        ))}

        {tab === 'bookmarks' && (
          bookmarks.length ? (
            <ul className="rows stagger">
              {bookmarks.map((b, i) => (
                <li key={b.id} style={{ ['--i' as string]: i }}>
                  <Link href={b.href} className="row-main">
                    <span className="rowtop">
                      <span className="rowt"><Icon name="bookmark" size={14} fill className="bmi" />{b.chapterTitle}</span>
                      <span className="caption">{b.novelTitle} · {ago(b.at)}</span>
                    </span>
                    {b.note && <span className="quote">“{b.note}”</span>}
                  </Link>
                  <button className="icon-btn" data-size="sm" aria-label={`Remove bookmark in ${b.chapterTitle}`} onClick={() => onDropBookmark(b)}>
                    <Icon name="close" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <span className="glyph"><Icon name="bookmark" size={24} /></span>
              <h2 className="title">{q ? 'No bookmarks match' : 'No bookmarks yet'}</h2>
              <p>{q ? 'Try a different word.' : 'While reading, the bookmark button in the top bar (or B) saves your exact spot.'}</p>
              <div className="actions">{q ? clearFilters : <button className="btn" onClick={() => goTab('all')}>Go to all books</button>}</div>
            </div>
          )
        )}

        {tab === 'history' && (
          past.length ? (
            <ul className="rows stagger">
              {past.map((c, i) => (
                <li key={c.id} style={{ ['--i' as string]: i }}>
                  <Link href={c.resumeHref} className="row-main hist">
                    <Cover title={c.title} author={c.author} src={c.cover} size="xs" />
                    <span className="ht">
                      <span className="rowtop">
                        <span className="rowt">{c.title}</span>
                        <span className="caption">{c.lastReadAt ? ago(c.lastReadAt) : ''}</span>
                      </span>
                      <span className="caption">
                        {c.chapterLabel}{c.status === 'finished' ? ' · Finished' : ` · ${Math.round(c.percent * 100)}%`}
                      </span>
                    </span>
                  </Link>
                  <Link href={c.detailsHref} className="btn" data-variant="ghost" data-size="sm">Details</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <span className="glyph"><Icon name="clock" size={24} /></span>
              <h2 className="title">Nothing read yet</h2>
              <p>Open any book and it starts keeping your place.</p>
              <div className="actions"><button className="btn" onClick={() => goTab('all')}>Go to all books</button></div>
            </div>
          )
        )}
      </div>

      {tab === 'all' && cards.length > 0 && (
        <p className="caption foot">
          <Icon name="download" size={14} className="inl" />{' '}
          {cards.filter(c => c.offline).length} of {cards.length} stored on this device and readable offline
          {space ? ` · ${bytes(space.used)} used` : ''}. Drop a folder anywhere to add it.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove “${removing?.title ?? ''}”?`}
        body="Every chapter, your place in the book and its bookmarks are deleted from this device. You’ll have a few seconds to undo."
        onDismiss={() => setRemoving(null)}
        choices={[
          { label: 'Keep it', onPick: () => setRemoving(null), variant: 'primary' },
          { label: 'Remove from device', onPick: () => { if (removing) void onRemove(removing); }, variant: 'danger' }
        ]}
      />

      <div className="dropveil" aria-hidden>
        <span><Icon name="folder" size={28} /> Drop a folder of chapters</span>
      </div>

      <style jsx>{`
        .screen { max-width: var(--page-max); margin-inline: auto; padding: clamp(1.25rem, 4vw, 2.5rem) var(--gutter) 6rem; position: relative; }

        /* ---- continue ---- */
        .continue { margin-top: clamp(1.5rem, 4vw, 2.5rem); display: grid; gap: var(--s-4); }
        .continue :global(.feature) {
          display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) auto; align-items: center; gap: var(--s-6);
          padding: var(--s-5) var(--s-6) var(--s-5) var(--s-5);
          border-radius: var(--r-xl); background: var(--surface); border: 1px solid var(--rule);
          color: var(--ink); text-decoration: none;
          transition: border-color var(--dur-2), box-shadow var(--dur-3) var(--ease-out), transform var(--dur-1) var(--ease-spring);
        }
        .continue :global(.feature:hover) { border-color: color-mix(in oklab, var(--accent) 40%, var(--rule)); box-shadow: var(--shadow-2); }
        .continue :global(.feature:active) { transform: scale(0.995); }
        .ft { display: grid; gap: var(--s-1); min-width: 0; }
        .ftt { font-family: var(--font-serif); font-size: clamp(1.35rem, 1.1rem + 1vw, 1.8rem); font-weight: 500; line-height: 1.15; letter-spacing: -0.015em; }
        .ftc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ftm { display: grid; grid-template-columns: minmax(6rem, 16rem) auto; align-items: center; gap: var(--s-4); margin-top: var(--s-3); }
        .railrow {
          list-style: none; margin: 0; padding: 0 0 var(--s-1);
          display: grid; grid-auto-flow: column; grid-auto-columns: min(16rem, 72vw); gap: var(--s-3);
          overflow-x: auto; scroll-snap-type: x proximity; overscroll-behavior-x: contain; scrollbar-width: none;
        }
        .railrow::-webkit-scrollbar { display: none; }
        .railrow li { scroll-snap-align: start; }
        .railrow :global(.mini) {
          display: flex; gap: var(--s-4); align-items: center; padding: var(--s-3);
          border-radius: var(--r-lg); border: 1px solid var(--rule); color: var(--ink); text-decoration: none;
          transition: background-color var(--dur-2), transform var(--dur-1) var(--ease-spring);
        }
        .railrow :global(.mini:hover) { background: var(--fill); }
        .railrow :global(.mini:active) { transform: scale(0.98); }
        .railrow :global(.mini .cover) { width: 2.4rem; }
        .mt { flex: 1; min-width: 0; display: grid; gap: var(--s-2); }
        .mtt { font-size: var(--t-callout); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ---- controls ---- */
        .controls {
          position: sticky; top: 3.5rem; z-index: var(--z-sticky);
          margin: clamp(1.75rem, 4vw, 2.5rem) calc(var(--gutter) * -1) 0; padding: var(--s-3) var(--gutter) var(--s-4);
          background: var(--chrome);
          backdrop-filter: blur(20px) saturate(170%); -webkit-backdrop-filter: blur(20px) saturate(170%);
          display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-3);
        }
        .row1 { display: flex; justify-content: space-between; gap: var(--s-4); align-items: center; }
        .tabs { overflow-x: auto; scrollbar-width: none; flex: 0 1 auto; min-width: 0; }
        .row1 > :global(.views) { flex: none; }
        .tabs::-webkit-scrollbar { display: none; }
        .tabs button { flex: none; }
        .tabs .n { margin-left: 0.15rem; color: var(--ink-3); font-weight: 500; }
        .views button { padding: 0 var(--s-3); }
        .row2 { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; }
        .row2 :global(.search) { flex: 1 1 14rem; }
        .chips { display: flex; gap: var(--s-2); flex-wrap: wrap; }

        /* ---- shelves ---- */
        .shelves { margin-top: var(--s-5); }

        .rows { list-style: none; margin: 0; padding: 0; display: grid; }
        .rows li { display: flex; align-items: center; gap: var(--s-2); }
        .rows li + li { box-shadow: 0 -1px 0 var(--rule); }
        .rows :global(.row-main) {
          flex: 1; min-width: 0; display: grid; gap: var(--s-1); text-decoration: none; color: var(--ink);
          padding: var(--s-4) var(--s-3); border-radius: var(--r-md);
          transition: background-color var(--dur-2);
        }
        .rows :global(.row-main:hover) { background: var(--fill); }
        .rows :global(.row-main.hist) { grid-template-columns: 2.4rem minmax(0, 1fr); align-items: center; gap: var(--s-4); }
        .ht { display: grid; gap: 0.1rem; min-width: 0; }
        .rowtop { display: flex; gap: var(--s-4); align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
        .rowt { display: inline-flex; align-items: center; gap: var(--s-2); font-size: var(--t-body); font-weight: 600; }
        .rowt :global(.bmi) { color: var(--accent); }
        .quote {
          font-family: var(--font-serif); color: var(--ink-2); font-size: 0.98rem; font-style: italic; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }

        .foot { margin: var(--s-8) 0 0; color: var(--ink-3); }
        .foot :global(.inl) { display: inline; vertical-align: -2px; }

        /* ---- drop target: the whole page, announced only while dragging ---- */
        .dropveil {
          position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
          background: color-mix(in oklab, var(--bg) 80%, transparent);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          opacity: 0; pointer-events: none; transition: opacity var(--dur-2);
        }
        .screen[data-dragging] .dropveil { opacity: 1; }
        .dropveil span {
          display: flex; align-items: center; gap: var(--s-4);
          border: 2px dashed color-mix(in oklab, var(--accent) 60%, var(--rule)); color: var(--ink);
          border-radius: var(--r-xl); padding: var(--s-7) var(--s-8); font-size: 1.1rem; font-weight: 500;
          background: var(--surface);
          transform: scale(0.96); transition: transform var(--dur-3) var(--ease-spring);
        }
        .screen[data-dragging] .dropveil span { transform: none; }

        @media (max-width: 40rem) {
          .controls { top: 3.25rem; }
          .continue :global(.feature) { grid-template-columns: 4.25rem minmax(0, 1fr); gap: var(--s-4); padding: var(--s-4); }
          .fgo { display: none !important; }
          .ftm { grid-template-columns: 1fr auto; }
          .chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; width: 100%; }
          .row2 :global(.search) { flex-basis: 100%; }
          .row2 > label:not(.search) { flex: 1; }
          .row2 :global(.select) { width: 100%; }
          .tabs button { padding: 0 var(--s-3); }
        }
      `}</style>
    </div>
  );
}

/** Shelf-shaped placeholders, so the page doesn't reflow when the data lands. */
function Skeleton() {
  return (
    <div className="screen" aria-busy="true">
      <span className="sr-only" role="status">Loading your library</span>
      <span className="skel" style={{ width: '10rem', height: '2.6rem' }} />
      <span className="skel" style={{ width: '8rem', height: '0.8rem', margin: '0.75rem 0 2.5rem' }} />
      <span className="skel" style={{ height: '8rem', borderRadius: 'var(--r-xl)', marginBottom: '2rem' }} />
      <ul className="libgrid">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <span className="skel" style={{ aspectRatio: '2/3', borderRadius: 'var(--r-cover)', marginBottom: '0.8rem' }} />
            <span className="skel" style={{ height: '0.85rem', width: '80%' }} />
            <span className="skel" style={{ height: '0.7rem', width: '50%', marginTop: '0.45rem' }} />
          </li>
        ))}
      </ul>
      <style jsx>{`
        .screen { max-width: var(--page-max); margin-inline: auto; padding: clamp(1.25rem, 4vw, 2.5rem) var(--gutter) 6rem; }
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
