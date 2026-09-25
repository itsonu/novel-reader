'use client';
// The writing side of a book: every chapter, drafts included, in the order a reader will
// meet them — and the place to change that order.
//
// The book page is for reading (continue, contents, bookmarks). This page is for the
// person writing it: open a chapter to edit, start a new one, duplicate, mark as draft,
// move up or down, delete with Undo. A row opens the editor; reading is one menu away.
//
// Reorder is a mode rather than always-on handles: a list you mostly scan shouldn't be
// fenced with arrows. In the mode, ↑/↓ buttons move a row one place, and Alt+↑/↓ does
// the same from the keyboard with focus kept on the chapter that moved.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import Icon from '@/components/Icon';
import Menu from '@/components/Menu';
import { toast } from '@/components/Toaster';
import { notifyChanged, putNovel, type StoredChapter } from '@/lib/library';
import { duplicateChapter, moveChapter, orderedChapters, removeChapter, setDraft } from '@/lib/chapters';
import {
  chapterEditHref, chapterNewHref, localChapterHref, localNovelHref
} from '@/lib/routes';
import { useLocalNovel } from '@/lib/useNovel';
import { isTyping, readTime } from '@/lib/ui';

type Filter = 'all' | 'ready' | 'draft';

function ChaptersSkeleton() {
  return (
    <main className="managepage" aria-busy="true">
      <span className="sr-only" role="status">Opening chapters…</span>
      <span className="skel" style={{ width: '8rem', height: '0.8rem' }} />
      <span className="skel" style={{ width: '12rem', height: '2.2rem', margin: '1rem 0 2.5rem' }} />
      {Array.from({ length: 6 }, (_, i) => <span key={i} className="skel" style={{ height: '3.25rem', marginBottom: '0.5rem' }} />)}
    </main>
  );
}

function ChaptersBody() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const { phase, novel, commit } = useLocalNovel(id);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [reorder, setReorder] = useState(false);
  const [removing, setRemoving] = useState<StoredChapter | null>(null);
  const [said, setSaid] = useState('');         // screen-reader announcement for moves
  const list = useRef<HTMLOListElement>(null);
  const refocus = useRef<{ slug: string; dir: 'up' | 'down' } | null>(null);

  const chapters = useMemo(() => (novel ? orderedChapters(novel) : []), [novel]);
  const drafts = chapters.filter(c => c.draft).length;
  const words = chapters.reduce((s, c) => s + c.words, 0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return chapters
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => {
        if (filter === 'draft' && !c.draft) return false;
        if (filter === 'ready' && c.draft) return false;
        if (!needle) return true;
        return String(i + 1) === needle || c.title.toLowerCase().includes(needle);
      });
  }, [chapters, q, filter]);

  /* After a move, keep focus on the chapter that moved — its row was re-rendered. */
  useEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    const row = list.current?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(r.slug)}"]`);
    (row?.querySelector<HTMLElement>(`[data-move="${r.dir}"]:not([disabled])`) ?? row?.querySelector<HTMLElement>('.cm-open'))?.focus();
  }, [novel]);

  /* N starts a chapter; the list is the place you'd reach for it. */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); router.push(chapterNewHref(id)); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [router, id]);

  if (phase === 'loading') return <ChaptersSkeleton />;
  if (phase === 'missing' || !novel)
    return (
      <main className="wrap">
        <div className="empty">
          <span className="glyph"><Icon name="book" size={26} /></span>
          <h1 className="title">Not in your library</h1>
          <p>That book isn’t on this device — it may have been removed, or opened in a different browser.</p>
          <div className="actions"><Link href="/library" className="btn" data-variant="primary">Go to your library</Link></div>
        </div>
      </main>
    );

  const move = async (c: StoredChapter, from: number, to: number) => {
    if (to < 0 || to >= chapters.length) return;
    refocus.current = { slug: c.slug, dir: to < from ? 'up' : 'down' };
    const ok = await commit(moveChapter(novel, from, to));
    if (ok) setSaid(`${c.title} moved to position ${to + 1} of ${chapters.length}.`);
    else toast({ message: 'Couldn’t save the new order — storage is blocked.', tone: 'err' });
  };

  const duplicate = async (c: StoredChapter) => {
    const r = duplicateChapter(novel, c.slug, Date.now());
    if (!(await commit(r.novel))) { toast({ message: 'Couldn’t duplicate — storage is blocked.', tone: 'err' }); return; }
    toast({
      message: `Duplicated as a draft: “${c.title} (copy)”`, tone: 'ok',
      action: { label: 'Edit', onClick: () => router.push(chapterEditHref(novel.id, r.slug)) }
    });
  };

  const toggleDraft = async (c: StoredChapter) => {
    const next = !c.draft;
    if (!(await commit(setDraft(novel, c.slug, next)))) return;
    toast({ message: next ? `“${c.title}” is a draft — hidden from readers` : `“${c.title}” is ready to read` });
  };

  const remove = async (c: StoredChapter) => {
    setRemoving(null);
    const before = novel;
    if (!(await commit(removeChapter(novel, c.slug)))) { toast({ message: 'Couldn’t delete — storage is blocked.', tone: 'err' }); return; }
    toast({
      message: `Deleted “${c.title}”`,
      action: { label: 'Undo', onClick: async () => { await putNovel(before); notifyChanged(); } }
    });
  };

  const filtered = Boolean(q.trim()) || filter !== 'all';

  return (
    <main className="managepage">
      <nav className="backline" aria-label="Breadcrumb">
        <Link href={localNovelHref(novel.id)} className="btn" data-variant="ghost" data-size="sm">
          <Icon name="back" size={16} /> {novel.title}
        </Link>
      </nav>

      <header className="pagehead">
        <div>
          <h1 className="title-1">Chapters</h1>
          <p className="caption sub">
            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
            {drafts > 0 && ` · ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`}
            {words > 0 && ` · ${words.toLocaleString()} words`}
          </p>
        </div>
        <div className="acts">
          {chapters.length > 1 && (
            <button className="btn" aria-pressed={reorder} onClick={() => { setReorder(r => !r); setQ(''); setFilter('all'); }}>
              <Icon name={reorder ? 'check' : 'sort'} size={16} /> {reorder ? 'Done reordering' : 'Reorder'}
            </button>
          )}
          <Link href={chapterNewHref(novel.id)} className="btn" data-variant="primary" aria-keyshortcuts="N">
            <Icon name="plus" size={16} /> New chapter
          </Link>
        </div>
      </header>

      {chapters.length > 0 && !reorder && (
        <div className="cm-tools">
          <label className="search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search chapters</span>
            <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title or number" />
          </label>
          {drafts > 0 && (
            <div className="seg" role="radiogroup" aria-label="Show">
              {(['all', 'ready', 'draft'] as Filter[]).map(f => (
                <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'ready' ? 'Ready' : 'Drafts'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {reorder && (
        <p className="cm-hint caption">
          Move a chapter with its arrows, or focus one and press <kbd>Alt</kbd> <kbd>↑</kbd> / <kbd>↓</kbd>. Changes save as you go.
        </p>
      )}

      {chapters.length === 0 ? (
        <div className="empty">
          <span className="glyph"><Icon name="pen" size={24} /></span>
          <h2 className="title">No chapters yet</h2>
          <p>Start with the first one. It saves as you type.</p>
          <div className="actions"><Link href={chapterNewHref(novel.id)} className="btn" data-variant="primary">Write chapter one</Link></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <h2 className="title-3">No chapters match</h2>
          <p>{q ? <>Nothing called “{q}”. Try a chapter number.</> : 'Nothing in this view.'}</p>
          <div className="actions"><button className="btn" onClick={() => { setQ(''); setFilter('all'); }}>Show all chapters</button></div>
        </div>
      ) : (
        <ol ref={list} className="cm-list" data-reorder={reorder || undefined} aria-label={`Chapters of ${novel.title}`}>
          {shown.map(({ c, i }) => (
            <li
              key={c.slug}
              data-slug={c.slug}
              className="cm-row"
              data-draft={c.draft || undefined}
              onKeyDown={e => {
                if (!reorder || !e.altKey) return;
                if (e.key === 'ArrowUp') { e.preventDefault(); void move(c, i, i - 1); }
                if (e.key === 'ArrowDown') { e.preventDefault(); void move(c, i, i + 1); }
              }}
            >
              <Link href={chapterEditHref(novel.id, c.slug)} className="cm-open">
                <span className="cm-num mono">{i + 1}</span>
                <span className="cm-txt">
                  <span className="cm-t">{c.title}</span>
                  <span className="cm-meta">
                    {c.draft && <span className="cm-draft">Draft</span>}
                    {c.words ? `${c.words.toLocaleString()} words · ${readTime(c.words)}` : 'Empty'}
                  </span>
                </span>
              </Link>
              {reorder ? (
                <span className="cm-move">
                  <button className="icon-btn" data-move="up" disabled={i === 0} onClick={() => void move(c, i, i - 1)}
                          aria-label={`Move “${c.title}” up`}><Icon name="up" size={18} /></button>
                  <button className="icon-btn" data-move="down" disabled={i === chapters.length - 1} onClick={() => void move(c, i, i + 1)}
                          aria-label={`Move “${c.title}” down`}><Icon name="down" size={18} /></button>
                </span>
              ) : (
                <Menu
                  label={`Actions for “${c.title}”`}
                  items={[
                    { label: 'Edit', icon: 'edit', href: chapterEditHref(novel.id, c.slug) },
                    ...(!c.draft ? [{ label: 'Read', icon: 'book' as const, href: localChapterHref(novel.id, c.slug) }] : []),
                    { label: 'Duplicate', icon: 'file', onSelect: () => void duplicate(c) },
                    { label: c.draft ? 'Mark as ready' : 'Mark as draft', icon: c.draft ? 'check' : 'pen', onSelect: () => void toggleDraft(c) },
                    'sep',
                    { label: 'Move up', icon: 'up', disabled: i === 0 || filtered, onSelect: () => void move(c, i, i - 1) },
                    { label: 'Move down', icon: 'down', disabled: i === chapters.length - 1 || filtered, onSelect: () => void move(c, i, i + 1) },
                    'sep',
                    { label: 'Delete', icon: 'trash', tone: 'danger', onSelect: () => setRemoving(c) }
                  ]}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="sr-only" role="status" aria-live="polite">{said}</p>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Delete “${removing?.title ?? ''}”?`}
        body="The chapter’s text is removed from this device. You’ll have a few seconds to undo."
        onDismiss={() => setRemoving(null)}
        choices={[
          { label: 'Keep it', onPick: () => setRemoving(null), variant: 'primary' },
          { label: 'Delete chapter', onPick: () => { if (removing) void remove(removing); }, variant: 'danger' }
        ]}
      />
    </main>
  );
}

export default function ChaptersScreen() {
  return (
    <Suspense fallback={<ChaptersSkeleton />}>
      <ChaptersBody />
    </Suspense>
  );
}
