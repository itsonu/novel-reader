'use client';
// ⌘K. One field that reaches every book, every chapter of every book on this device,
// every screen, and the theme — the fastest route anywhere for anyone with a keyboard,
// and a search box for anyone without one.
//
// Loaded on first open only (see AppChrome), so a reader who never presses ⌘K never
// downloads it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from './Icon';
import Cover from './Cover';
import { useModal, usePresence } from '@/lib/ui';
import { lastRead, listNovels, listProgress, listSaved, type Progress, type StoredNovel } from '@/lib/library';
import { buildCards, type Card } from '@/lib/library-select';
import { libraryTabHref, localChapterHref, PUBLISH } from '@/lib/routes';
import { setThemePref } from '@/lib/theme';

type Cmd = {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon?: IconName;
  card?: Card;
  run: () => void;
  keywords?: string;
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { mounted, closing } = usePresence(open, 160);
  const panel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [novels, setNovels] = useState<StoredNovel[]>([]);
  const [last, setLast] = useState<Progress | undefined>();
  useModal(panel, open, onClose);

  useEffect(() => {
    if (!open) return;
    setQ(''); setActive(0);
    (async () => {
      try {
        const [n, s, p, l] = await Promise.all([listNovels(), listSaved(), listProgress(), lastRead()]);
        setNovels(n); setCards(buildCards(n, s, p)); setLast(l);
      } catch { /* storage blocked: navigation commands still work */ }
    })();
  }, [open]);

  const go = (href: string) => { onClose(); router.push(href); };

  const all: Cmd[] = useMemo(() => {
    const out: Cmd[] = [];
    if (last) out.push({
      id: 'resume', group: 'Continue', label: last.title, sub: `Chapter ${last.chapterIndex + 1} · ${last.chapterTitle}`,
      icon: 'book', run: () => go(last.href), keywords: 'continue resume'
    });
    for (const c of cards) out.push({
      id: `b:${c.id}`, group: 'Books', label: c.title,
      sub: [c.author, c.percent > 0 ? `${Math.round(c.percent * 100)}%` : `${c.chapters} chapters`].filter(Boolean).join(' · '),
      card: c, run: () => go(c.detailsHref), keywords: c.author
    });
    for (const n of novels) {
      const list = [...n.chapters].filter(c => !c.draft).sort((a, b) => a.ordinal - b.ordinal);
      list.forEach((ch, i) => out.push({
        id: `c:${n.id}:${ch.slug}`, group: 'Chapters', label: ch.title, sub: `${n.title} · Chapter ${i + 1}`,
        icon: 'file', run: () => go(localChapterHref(n.id, ch.slug)), keywords: `${n.title} ${i + 1}`
      }));
    }
    out.push(
      { id: 'g:home', group: 'Go to', label: 'Discover', icon: 'discover', run: () => go('/') },
      { id: 'g:lib', group: 'Go to', label: 'Library', icon: 'library', run: () => go('/library') },
      { id: 'g:fav', group: 'Go to', label: 'Favourites', icon: 'star', run: () => go(libraryTabHref('favorites')) },
      { id: 'g:marks', group: 'Go to', label: 'Bookmarks', icon: 'bookmark', run: () => go(libraryTabHref('bookmarks')) },
      { id: 'g:hist', group: 'Go to', label: 'Reading history', icon: 'clock', run: () => go(libraryTabHref('history')) },
      { id: 'g:how', group: 'Go to', label: 'How it works', icon: 'info', run: () => go('/how-it-works'), keywords: 'help guide start explain' },
      { id: 'g:add', group: 'Go to', label: 'Add a novel', icon: 'plus', run: () => go(PUBLISH), keywords: 'import folder upload publish' },
      { id: 't:light', group: 'Appearance', label: 'Light appearance', icon: 'sun', run: () => { setThemePref('light'); onClose(); }, keywords: 'theme' },
      { id: 't:dark', group: 'Appearance', label: 'Dark appearance', icon: 'moon', run: () => { setThemePref('dark'); onClose(); }, keywords: 'theme' },
      { id: 't:sys', group: 'Appearance', label: 'Match system appearance', icon: 'system', run: () => { setThemePref('system'); onClose(); }, keywords: 'theme auto' }
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, novels, last]);

  const shown = useMemo(() => {
    const needle = norm(q.trim());
    // Chapters only surface once there's a query — a list of every chapter of every
    // book is a wall, not a menu.
    if (!needle) return all.filter(c => c.group !== 'Chapters').slice(0, 40);
    const scored = all
      .map(c => {
        const hay = norm(`${c.label} ${c.sub ?? ''} ${c.keywords ?? ''}`);
        const lab = norm(c.label);
        const at = hay.indexOf(needle);
        if (at < 0) return null;
        return { c, s: (lab.startsWith(needle) ? 0 : lab.includes(needle) ? 1 : 2) + (c.group === 'Chapters' ? 0.5 : 0) };
      })
      .filter(Boolean) as { c: Cmd; s: number }[];
    const ranked = scored.sort((a, b) => a.s - b.s).map(x => x.c);
    // Keep groups together, in the order their best match appeared.
    const order: string[] = [];
    ranked.forEach(c => { if (!order.includes(c.group)) order.push(c.group); });
    return order.flatMap(g => ranked.filter(c => c.group === g).slice(0, g === 'Chapters' ? 8 : 12));
  }, [all, q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!mounted) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); shown[active]?.run(); }
  };

  let lastGroup = '';

  return (
    <div className="root" data-closing={closing || undefined}>
      <div className="scrim" aria-hidden onClick={onClose} />
      <div ref={panel} className="panel" role="dialog" aria-modal={closing ? undefined : true} aria-label="Search and commands">
        <label className="field">
          <Icon name="search" size={18} />
          <input
            data-autofocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search books, chapters and commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={shown[active] ? `cmd-${active}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </label>

        <ul id="cmd-list" ref={listRef} role="listbox" className="list" aria-label="Results">
          {shown.length === 0 && (
            <li className="none" role="presentation">
              <p className="title-3">No matches</p>
              <p className="caption">Nothing on this device is called “{q}”.</p>
            </li>
          )}
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <li key={c.id} role="presentation">
                {head && <p className="group" role="presentation">{head}</p>}
                <div
                  id={`cmd-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  className="opt"
                  onPointerMove={() => setActive(i)}
                  onClick={() => c.run()}
                >
                  {c.card
                    ? <Cover title={c.card.title} author={c.card.author} src={c.card.cover} size="xs" />
                    : <span className="ico"><Icon name={c.icon ?? 'arrowRight'} size={17} /></span>}
                  <span className="txt">
                    <span className="lab">{c.label}</span>
                    {c.sub && <span className="sub">{c.sub}</span>}
                  </span>
                  {i === active && <Icon name="arrowRight" size={16} className="enter" />}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="foot caption">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
        </footer>
      </div>

      <style jsx>{`
        .root { position: fixed; inset: 0; z-index: var(--z-sheet); display: grid; justify-items: center; align-items: start; padding: 12vh var(--s-4) var(--s-4); }
        .scrim { position: absolute; inset: 0; background: var(--scrim); animation: fade-in var(--dur-2) var(--ease-out) both; }
        .panel {
          position: relative; width: min(38rem, 100%); max-height: min(34rem, 76vh);
          display: flex; flex-direction: column; overflow: hidden;
          background: var(--surface-2); border-radius: var(--r-xl); box-shadow: var(--shadow-3);
          animation: pop-in var(--dur-3) var(--ease-spring) both;
        }
        [data-closing] .scrim { animation: fade-out 160ms var(--ease-out) both; }
        [data-closing] .panel { animation: pop-out 160ms var(--ease-out) both; }
        .field {
          display: flex; align-items: center; gap: var(--s-4); padding: 0 var(--s-5);
          border-bottom: 1px solid var(--rule); color: var(--ink-3); flex: none;
        }
        .field input {
          flex: 1; min-width: 0; height: 3.5rem; border: 0; outline: none; background: transparent;
          color: var(--ink); font-size: 1.0625rem; letter-spacing: -0.01em;
        }
        .field input::placeholder { color: var(--ink-3); }
        .list { list-style: none; margin: 0; padding: var(--s-2); overflow-y: auto; overscroll-behavior: contain; flex: 1; }
        .group {
          margin: var(--s-3) var(--s-4) var(--s-2); font-size: var(--t-micro); font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3);
        }
        .opt {
          display: flex; align-items: center; gap: var(--s-4); min-height: 3rem; padding: var(--s-2) var(--s-4);
          border-radius: var(--r-md); cursor: pointer;
        }
        .opt[aria-selected='true'] { background: var(--fill-2); }
        .opt :global(.cover) { width: 1.6rem; }
        .ico { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; color: var(--ink-2); flex: none; }
        .txt { flex: 1; min-width: 0; display: grid; }
        .lab, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lab { font-size: var(--t-callout); font-weight: 500; }
        .sub { font-size: var(--t-caption); color: var(--ink-3); }
        .opt :global(.enter) { color: var(--ink-3); flex: none; }
        .none { padding: var(--s-7) var(--s-5); text-align: center; }
        .none p { margin: 0 0 var(--s-2); }
        .foot { display: flex; gap: var(--s-5); padding: var(--s-3) var(--s-5); border-top: 1px solid var(--rule); flex: none; }
        .foot span { display: inline-flex; align-items: center; gap: var(--s-1); }
        @media (max-width: 40rem) {
          .root { padding: max(var(--s-3), env(safe-area-inset-top)) var(--s-3) var(--s-3); }
          .panel { max-height: 70dvh; }
          .foot { display: none; }
        }
        @media (pointer: coarse) { .foot { display: none; } }
        @keyframes fade-in { from { opacity: 0; } }
        @keyframes fade-out { to { opacity: 0; } }
        @keyframes pop-in { from { opacity: 0; transform: translate3d(0, -8px, 0) scale(0.98); } }
        @keyframes pop-out { to { opacity: 0; transform: scale(0.98); } }
      `}</style>
    </div>
  );
}
