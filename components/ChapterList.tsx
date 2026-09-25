'use client';
// Every chapter of a book, as a list that still works at chapter 1,400.
//
// Dense rows rather than cards: number, title, length, and where you are. Search takes
// a title or a number ("212" finds chapter 212). Past sixty chapters the list folds into
// ranges of fifty, with the range you're reading in already open, and every row outside
// the viewport skips layout via content-visibility — so a long serial renders like a
// short one.
//
// Used twice: the novel page (full) and the reader's contents drawer (compact).

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { readTime } from '@/lib/ui';

export type ChapterRow = { slug: string; title: string; words: number; href: string; editHref?: string };
type Filter = 'all' | 'unread' | 'read' | 'marked';

const GROUP = 50;
const GROUP_AFTER = 60;
const SEARCH_AFTER = 12;

export default function ChapterList({
  chapters, current = -1, marked, variant = 'full', onNavigate, label = 'Chapters'
}: {
  chapters: ChapterRow[];
  /** Index of the chapter the reader is on (or last read); earlier ones count as read. */
  current?: number;
  marked?: Set<string>;
  variant?: 'full' | 'compact';
  onNavigate?: () => void;
  label?: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [desc, setDesc] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const compact = variant === 'compact';

  const rows = useMemo(() => chapters.map((c, i) => ({ ...c, i })), [chapters]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter(r => {
      if (filter === 'read' && !(r.i < current)) return false;
      if (filter === 'unread' && r.i < current) return false;
      if (filter === 'marked' && !marked?.has(r.slug)) return false;
      if (!needle) return true;
      return String(r.i + 1) === needle || r.title.toLowerCase().includes(needle);
    });
    if (desc) out = [...out].reverse();
    return out;
  }, [rows, q, filter, desc, current, marked]);

  const grouped = !q.trim() && filter === 'all' && rows.length > GROUP_AFTER;
  const groups = useMemo(() => {
    if (!grouped) return [];
    const out: { from: number; to: number; items: typeof shown }[] = [];
    for (let k = 0; k < shown.length; k += GROUP) {
      const items = shown.slice(k, k + GROUP);
      out.push({ from: items[0].i + 1, to: items[items.length - 1].i + 1, items });
    }
    return out;
  }, [grouped, shown]);

  /* The drawer opens scrolled to where you are, not to chapter one. */
  useEffect(() => {
    if (!compact || current < 0) return;
    const el = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ block: 'center' });
  }, [compact, current]);

  const hasProgress = current > 0;
  const hasMarks = Boolean(marked?.size);

  const row = (r: (typeof shown)[number]) => {
    const state = r.i === current ? 'current' : r.i < current ? 'read' : 'unread';
    return (
      <li key={r.slug} className="row" data-state={state}>
        <Link
          href={r.href}
          className="main"
          aria-current={r.i === current && compact ? 'page' : undefined}
          onClick={onNavigate}
        >
          <span className="num mono">{r.i + 1}</span>
          <span className="txt">
            <span className="t">{r.title}</span>
            {!compact && (
              <span className="meta">
                {readTime(r.words)}
                {state === 'current' && <span className="here"> · Reading</span>}
              </span>
            )}
          </span>
          <span className="status">
            {marked?.has(r.slug) && <Icon name="bookmark" size={14} fill className="bm" label="Bookmarked" />}
            {state === 'read' && <Icon name="check" size={15} className="done" label="Read" />}
            {state === 'current' && <span className="dot" role="img" aria-label="Reading now" />}
          </span>
        </Link>
        {r.editHref && !compact && (
          <Link href={r.editHref} className="edit icon-btn" data-size="sm" aria-label={`Edit ${r.title}`} title="Edit">
            <Icon name="edit" size={15} />
          </Link>
        )}
      </li>
    );
  };

  return (
    <div className="chlist" data-variant={variant} ref={list}>
      {(rows.length > SEARCH_AFTER || (!compact && (current > 0 || Boolean(marked?.size)))) && (
        <div className="tools">
          {rows.length > SEARCH_AFTER && (
            <label className="search">
              <Icon name="search" size={16} />
              <span className="sr-only">Search chapters</span>
              <input
                className="input" type="search" value={q} onChange={e => setQ(e.target.value)}
                placeholder={`Search ${rows.length} chapters`}
              />
            </label>
          )}
          {!compact && (hasProgress || hasMarks) && (
            <div className="chips" role="group" aria-label="Show">
              {(['all', 'unread', 'read', ...(hasMarks ? ['marked'] : [])] as Filter[]).map(f => (
                <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'read' ? 'Read' : 'Bookmarked'}
                </button>
              ))}
            </div>
          )}
          {!compact && rows.length > SEARCH_AFTER && (
            <button
              className="btn sortbtn" data-variant="ghost" data-size="sm"
              onClick={() => setDesc(d => !d)} title="Reverse the order"
            >
              <Icon name="sort" size={15} />{desc ? 'Newest first' : 'Oldest first'}
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="none">
          <p className="title-3">No chapters match</p>
          <p className="caption">
            {q ? <>Nothing called “{q}”. Try a chapter number.</> : 'Nothing in this view yet.'}
          </p>
          <button className="btn" data-size="sm" onClick={() => { setQ(''); setFilter('all'); }}>Show all chapters</button>
        </div>
      ) : grouped ? (
        groups.map(g => {
          const hasCurrent = current >= g.from - 1 && current <= g.to - 1;
          return (
            <details key={g.from} className="group" open={hasCurrent || (current < 0 && g === groups[0])}>
              <summary>
                <span>Chapters {g.from}–{g.to}</span>
                {hasCurrent && <span className="pill" data-tone="accent">Reading</span>}
                <Icon name="down" size={16} className="chev" />
              </summary>
              <ol className="rows" aria-label={`${label} ${g.from} to ${g.to}`}>{g.items.map(row)}</ol>
            </details>
          );
        })
      ) : (
        <ol className="rows" aria-label={label}>{shown.map(row)}</ol>
      )}

      {/* Global, prefixed by .chlist: rows are built in a helper, which styled-jsx
          would leave unscoped and unstyled. */}
      <style jsx global>{`
        .chlist .tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-4); }
        .chlist[data-variant='compact'] .tools { margin: 0 0 var(--s-3); }
        .chlist .chips { display: flex; gap: var(--s-2); flex-wrap: wrap; }
        .chlist .tools .sortbtn { margin-left: auto; }
        .chlist .rows { list-style: none; margin: 0; padding: 0; }
        .chlist .row {
          display: flex; align-items: center; gap: var(--s-1);
          content-visibility: auto; contain-intrinsic-size: auto 3.25rem;
          border-radius: var(--r-sm);
        }
        .chlist[data-variant='full'] .rows { border-top: 1px solid var(--rule); }
        .chlist[data-variant='full'] .row { border-bottom: 1px solid var(--rule); border-radius: 0; }
        .chlist .row .main {
          flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--s-4);
          min-height: 3.25rem; padding: var(--s-2) var(--s-3);
          border-radius: var(--r-sm); color: var(--ink); text-decoration: none;
          transition: background-color var(--dur-2), transform var(--dur-1) var(--ease-spring);
        }
        .chlist .row .main:hover { background: var(--fill); }
        .chlist .row .main:active { transform: scale(0.99); background: var(--fill-2); }
        .chlist .num { flex: none; width: 2.25rem; font-size: var(--t-caption); color: var(--ink-3); text-align: right; }
        .chlist .txt { flex: 1; min-width: 0; display: grid; gap: 0.1rem; }
        .chlist .t { font-size: var(--t-body); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chlist .meta { font-size: var(--t-caption); color: var(--ink-3); }
        .chlist .here { color: var(--accent); font-weight: 500; }
        .chlist .status { flex: none; display: flex; align-items: center; gap: var(--s-2); color: var(--ink-3); min-width: 1rem; justify-content: flex-end; }
        .chlist .status .bm { color: var(--accent); }
        .chlist .dot { width: 0.5rem; height: 0.5rem; border-radius: var(--r-round); background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
        .chlist .row[data-state='read'] .t { color: var(--ink-2); }
        .chlist .row[data-state='current'] .main { background: var(--accent-soft); }
        .chlist .row[data-state='current'] .t { font-weight: 600; }
        .chlist .row[data-state='current'] .num { color: var(--accent); }
        .chlist .row .edit { opacity: 0.6; }
        .chlist .row:hover .edit, .chlist .row .edit:focus-visible { opacity: 1; }
        @media (pointer: coarse) { .row .edit { opacity: 1; } }

        .chlist[data-variant='compact'] .row .main { min-height: 2.75rem; }
        .chlist[data-variant='compact'] .t { font-size: var(--t-callout); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .chlist[data-variant='compact'] .num { width: 1.75rem; }

        .chlist .group { border-radius: var(--r-md); }
        .chlist .group + .group { margin-top: var(--s-2); }
        .chlist .group summary {
          list-style: none; display: flex; align-items: center; gap: var(--s-3);
          min-height: 2.75rem; padding: 0 var(--s-3); border-radius: var(--r-sm);
          font-size: var(--t-callout); font-weight: 600; color: var(--ink-2); cursor: pointer;
          position: sticky; top: 0; background: var(--bg); z-index: 1;
        }
        .chlist[data-variant='compact'] .group summary { background: var(--surface-2); }
        .chlist .group summary::-webkit-details-marker { display: none; }
        .chlist .group summary:hover { color: var(--ink); }
        .chlist .group summary .chev { margin-left: auto; transition: transform var(--dur-2) var(--ease-spring); }
        .chlist .group[open] summary .chev { transform: rotate(180deg); }

        .chlist .none { text-align: center; padding: var(--s-7) var(--s-5); display: grid; gap: var(--s-2); justify-items: center; }
        .chlist .none p { margin: 0; }
      `}</style>
    </div>
  );
}
