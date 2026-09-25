'use client';
// A local novel's own page: what it is, where you are in it, every chapter, every mark.
// The published equivalent is /n/[slug]; this is the same room for a book that only
// exists on this device, so the reading flow is identical either way.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import Dialog from '@/components/Dialog';
import Cover from '@/components/Cover';
import Icon from '@/components/Icon';
import Menu from '@/components/Menu';
import ChapterList from '@/components/ChapterList';
import { toast } from '@/components/Toaster';
import {
  deleteBookmark, deleteNovel, getNovel, onLibraryChanged, getProgress, listBookmarks, putBookmark, putNovel,
  restore, setFavorite, snapshot, type Bookmark, type Progress, type StoredNovel
} from '@/lib/library';
import { chapterEditHref, chapterNewHref, localChapterHref } from '@/lib/routes';
import { linkState, refreshFromFolder, type LinkState } from '@/lib/import';
import { ago, isTyping, readTime } from '@/lib/ui';

function BookSkeleton() {
  return (
    <main className="bookpage" aria-busy="true">
      <span className="sr-only" role="status">Opening the book…</span>
      <div className="bookhero">
        <span className="skel" style={{ aspectRatio: '2/3', borderRadius: 'var(--r-cover)' }} />
        <div className="info">
          <span className="skel" style={{ width: '60%', height: '2.6rem' }} />
          <span className="skel" style={{ width: '30%', height: '1rem' }} />
          <span className="skel" style={{ width: '45%', height: '0.8rem' }} />
          <span className="skel" style={{ width: '10rem', height: '2.5rem', marginTop: '1rem', borderRadius: 'var(--r-md)' }} />
        </div>
      </div>
      <div className="booksec" style={{ display: 'grid', gap: '0.6rem' }}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="skel" style={{ height: '2.8rem' }} />)}
      </div>
    </main>
  );
}

function NovelBody() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [novel, setNovel] = useState<StoredNovel | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState<LinkState>('none');
  const [syncing, setSyncing] = useState(false);

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

  useEffect(() => { void load(); return onLibraryChanged(() => void load()); }, [load]);

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
      toast({ message: r.note, tone: 'ok' });
      await load();
    })();
    return () => { live = false; };
  }, [link, id, load]);

  /* N writes a new chapter (and Cmd/Ctrl+N where the browser lets a page have it). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector('[aria-modal="true"]')) return;
      if (e.key.toLowerCase() !== 'n' || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.push(chapterNewHref(id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, id]);

  const chapters = useMemo(() => (novel ? [...novel.chapters].sort((a, b) => a.ordinal - b.ordinal) : []), [novel]);
  const rows = useMemo(() => chapters.map(c => ({
    slug: c.slug, title: c.title, words: c.words,
    href: localChapterHref(id, c.slug), editHref: chapterEditHref(id, c.slug)
  })), [chapters, id]);
  const markedSlugs = useMemo(() => new Set(marks.map(m => m.chapterSlug)), [marks]);

  if (phase === 'loading') return <BookSkeleton />;

  if (phase === 'missing' || !novel)
    return (
      <main className="wrap">
        <div className="empty">
          <span className="glyph"><Icon name="book" size={26} /></span>
          <h1 className="title">Not in your library</h1>
          <p>That book isn’t on this device — it may have been removed, or opened in a different browser.</p>
          <div className="actions">
            <Link href="/library" className="btn" data-variant="primary">Go to your library</Link>
            <Link href="/" className="btn">Discover</Link>
          </div>
        </div>
      </main>
    );

  const words = chapters.reduce((s, c) => s + c.words, 0);
  const at = progress?.chapterIndex ?? -1;
  const pct = Math.round((progress?.percent ?? 0) * 100);
  const resume = progress?.href ?? (chapters[0] ? localChapterHref(novel.id, chapters[0].slug) : chapterNewHref(novel.id));

  const toggleFav = async () => {
    const on = !novel.favorite;
    setNovel({ ...novel, favorite: on });
    try {
      await setFavorite(novel.id, on);
      toast({ message: on ? 'Added to favourites' : 'Removed from favourites' });
    } catch { await load(); }
  };

  const remove = async () => {
    setConfirming(false);
    const snap = await snapshot(novel.id);
    await deleteNovel(novel.id);
    router.push('/library');
    toast({
      message: `Removed “${novel.title}”`,
      action: { label: 'Undo', onClick: async () => { await restore(snap); router.push(`/novel?id=${encodeURIComponent(novel.id)}`); } }
    });
  };

  /* Must run straight off the click: renewing folder permission is only allowed
     inside a user gesture, so this can never be moved into an effect. */
  const sync = async () => {
    setSyncing(true);
    const r = await refreshFromFolder(novel.id, true);
    setSyncing(false);
    if (!r) { toast({ message: 'This book has no folder linked to it.' }); return; }
    toast({ message: 'error' in r ? r.error : r.note, tone: 'error' in r ? 'err' : 'ok' });
    setLink(await linkState(novel.id));
    if (!('error' in r)) await load();
  };

  const dropMark = async (b: Bookmark) => {
    setMarks(m => m.filter(x => x.id !== b.id));
    try {
      await deleteBookmark(b.id);
      toast({
        message: 'Bookmark removed',
        action: { label: 'Undo', onClick: async () => { await putBookmark(b); setMarks(m => [b, ...m].sort((x, y) => y.at - x.at)); } }
      });
    } catch { await load(); }
  };

  return (
    <>
      <main className="bookpage">
        <nav className="backline" aria-label="Breadcrumb">
          <Link href="/library" className="btn" data-variant="ghost" data-size="sm"><Icon name="back" size={16} /> Library</Link>
        </nav>

        <header className="bookhero">
          <Cover title={novel.title} author={novel.author} size="lg" />
          <div className="info">
            {novel.genre && <p className="eyebrow">{novel.genre}</p>}
            <h1 className="display">{novel.title}</h1>
            <p className="byline">{novel.author || 'On this device'}</p>
            <p className="facts">
              <span>{chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}</span>
              <span>{words.toLocaleString()} words</span>
              {words > 0 && <span><Icon name="clock" size={14} />{readTime(words)}</span>}
              <span><Icon name="download" size={14} />Offline</span>
            </p>

            {/* Says what is actually true of this book's folder, including the cases
                where reconnecting is impossible. */}
            {link !== 'none' && (
              <p className="caption" style={{ margin: 0, color: link === 'needs-permission' ? 'var(--warn)' : 'var(--ink-3)' }}>
                <Icon name="folder" size={14} className="inl" />{' '}
                {link === 'linked' && 'Linked to a folder — new chapters appear automatically.'}
                {link === 'needs-permission' && 'Linked to a folder. Your browser needs one click to read it again.'}
                {link === 'unsupported' && 'Saved as a copy. This browser can’t keep a live folder link.'}
              </p>
            )}

            <div className="actions">
              <Link href={resume} className="btn" data-variant="primary" data-size="lg">
                <Icon name={chapters.length ? 'book' : 'pen'} size={18} />
                {!chapters.length ? 'Write chapter one' : pct > 0 ? 'Continue reading' : 'Start reading'}
              </Link>
              <button
                className="icon-btn" data-bordered data-size="lg" aria-pressed={Boolean(novel.favorite)} onClick={toggleFav}
                aria-label={novel.favorite ? 'Remove from favourites' : 'Add to favourites'} title="Favourite"
              >
                <Icon name="star" fill={Boolean(novel.favorite)} />
              </button>
              {(link === 'linked' || link === 'needs-permission') && (
                <button className="btn" data-size="lg" onClick={sync} data-loading={syncing || undefined}>
                  <Icon name="refresh" size={17} />
                  {link === 'needs-permission' ? 'Reconnect folder' : 'Refresh'}
                </button>
              )}
              <Menu
                label="More actions"
                items={[
                  { label: 'New chapter', icon: 'plus', href: chapterNewHref(novel.id), hint: 'N' },
                  { label: 'Edit details', icon: 'edit', onSelect: () => setEditing(true) },
                  'sep',
                  { label: 'Remove from device', icon: 'trash', tone: 'danger', onSelect: () => setConfirming(true) }
                ]}
              />
            </div>

            {progress && pct > 0 && (
              <Link href={progress.href} className="resume" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="rt"><span>Chapter {at + 1} of {chapters.length}</span><span>{pct}% · {ago(progress.at)}</span></span>
                <p className="rc">{progress.chapterTitle}</p>
                <span className="meter" style={{ ['--p' as string]: pct / 100 }} />
              </Link>
            )}
          </div>
        </header>

        <section className="booksec" aria-labelledby="ch-h">
          <div className="sechead">
            <h2 id="ch-h" className="title">Chapters</h2>
            {chapters.length > 0 && (
              <Link href={chapterNewHref(novel.id)} className="btn" data-size="sm"><Icon name="plus" size={15} /> New chapter</Link>
            )}
          </div>
          {chapters.length ? (
            <ChapterList chapters={rows} current={at} marked={markedSlugs} />
          ) : (
            <div className="empty" style={{ marginTop: 0 }}>
              <span className="glyph"><Icon name="pen" size={24} /></span>
              <h3 className="title-3">No chapters yet</h3>
              <p>Start with the first one and build the book a page at a time.</p>
              <div className="actions">
                <Link href={chapterNewHref(novel.id)} className="btn" data-variant="primary">Write the first chapter</Link>
              </div>
            </div>
          )}
        </section>

        {marks.length > 0 && (
          <section className="booksec" aria-labelledby="bm-h">
            <div className="sechead"><h2 id="bm-h" className="title">Bookmarks</h2></div>
            <ul className="marks">
              {marks.map(b => (
                <li key={b.id}>
                  <Link href={b.href} className="mark">
                    <span className="mt"><Icon name="bookmark" size={14} fill /> {b.chapterTitle} <span className="caption">· {ago(b.at)}</span></span>
                    {b.note && <span className="mq">“{b.note}”</span>}
                  </Link>
                  <button className="icon-btn" data-size="sm" aria-label={`Remove bookmark in ${b.chapterTitle}`} onClick={() => dropMark(b)}>
                    <Icon name="close" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <DetailsDialog
        open={editing}
        novel={novel}
        onClose={() => setEditing(false)}
        onSave={async patch => {
          const next = { ...novel, ...patch };
          try {
            await putNovel(next);
            setNovel(next);
            setEditing(false);
            toast({ message: 'Details saved', tone: 'ok' });
          } catch {
            toast({ message: 'Couldn’t save — this browser is blocking storage.', tone: 'err' });
          }
        }}
      />

      <ConfirmDialog
        open={confirming}
        title={`Remove “${novel.title}”?`}
        body="Every chapter, your place in the book and its bookmarks are deleted from this device. You’ll have a few seconds to undo."
        onDismiss={() => setConfirming(false)}
        choices={[
          { label: 'Keep it', onPick: () => setConfirming(false), variant: 'primary' },
          { label: 'Remove from device', onPick: remove, variant: 'danger' }
        ]}
      />

      <style jsx>{`
        .marks { list-style: none; margin: 0; padding: 0; display: grid; }
        .marks li { display: flex; align-items: center; gap: var(--s-2); }
        .marks li + li { box-shadow: 0 -1px 0 var(--rule); }
        .marks :global(.mark) {
          flex: 1; min-width: 0; display: grid; gap: var(--s-1); padding: var(--s-4) var(--s-3);
          color: var(--ink); text-decoration: none; border-radius: var(--r-sm);
          transition: background-color var(--dur-2);
        }
        .marks :global(.mark:hover) { background: var(--fill); }
        .marks :global(.mt) { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-callout); font-weight: 500; }
        .marks :global(.mt svg) { color: var(--accent); }
        .marks :global(.mq) {
          font-family: var(--font-serif); font-style: italic; color: var(--ink-2); font-size: 0.95rem; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        :global(.inl) { display: inline; vertical-align: -2px; }
      `}</style>
    </>
  );
}

function DetailsDialog({
  open, novel, onClose, onSave
}: {
  open: boolean; novel: StoredNovel; onClose: () => void;
  onSave: (p: Pick<StoredNovel, 'title' | 'author' | 'genre'>) => void;
}) {
  const [title, setTitle] = useState(novel.title);
  const [author, setAuthor] = useState(novel.author ?? '');
  const [genre, setGenre] = useState(novel.genre ?? '');
  useEffect(() => {
    if (open) { setTitle(novel.title); setAuthor(novel.author ?? ''); setGenre(novel.genre ?? ''); }
  }, [open, novel]);
  const bad = !title.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Book details"
      size="md"
      footer={
        <>
          <button className="btn" data-variant="ghost" onClick={onClose}>Cancel</button>
          <button className="btn" data-variant="primary" form="details-form" type="submit" disabled={bad}>Save</button>
        </>
      }
    >
      <form
        id="details-form"
        style={{ display: 'grid', gap: 'var(--s-5)' }}
        onSubmit={e => {
          e.preventDefault();
          if (bad) return;
          onSave({ title: title.trim(), author: author.trim() || undefined, genre: genre.trim() || undefined });
        }}
      >
        <label className="field">
          <span className="label">Title</span>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} data-autofocus aria-invalid={bad || undefined} required />
          {bad && <span className="hint" style={{ color: 'var(--err)' }}>A book needs a title.</span>}
        </label>
        <label className="field">
          <span className="label">Author</span>
          <input className="input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Optional" />
        </label>
        <label className="field">
          <span className="label">Genre</span>
          <input className="input" value={genre} onChange={e => setGenre(e.target.value)} placeholder="e.g. fantasy — also tunes cinematic effects" />
        </label>
      </form>
    </Dialog>
  );
}

export default function NovelScreen() {
  return (
    <Suspense fallback={<BookSkeleton />}>
      <NovelBody />
    </Suspense>
  );
}
