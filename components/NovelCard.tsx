'use client';
// One book, two densities. Grid shows covers for browsing a shelf; list shows rows for
// a library too big to browse by eye. Either way, whatever is true of a book — how far
// in you are, whether it works on a plane — is visible without opening it.

import Link from 'next/link';
import Cover from './Cover';
import Icon from './Icon';
import Menu from './Menu';
import type { Card } from '@/lib/library-select';
import { ago } from '@/lib/ui';

const STATUS: Record<Card['status'], string> = { new: 'Not started', reading: 'Reading', finished: 'Finished' };

export default function NovelCard({
  card, onFavorite, onRemove, view = 'grid', style
}: {
  card: Card;
  onFavorite: (id: string, on: boolean) => void;
  onRemove?: (card: Card) => void;
  view?: 'grid' | 'list';
  style?: React.CSSProperties;
}) {
  const pct = Math.round(card.percent * 100);
  const cta = card.status === 'reading' ? 'Continue' : card.status === 'finished' ? 'Read again' : 'Start reading';
  const menu = (
    <Menu
      label={`More for ${card.title}`}
      items={[
        { label: cta, icon: 'book', href: card.resumeHref },
        { label: 'Book details', icon: 'info', href: card.detailsHref },
        { label: card.favorite ? 'Remove from favourites' : 'Add to favourites', icon: 'star', onSelect: () => onFavorite(card.id, !card.favorite) },
        ...(onRemove ? (['sep', {
          label: card.offline ? 'Remove from device' : 'Remove from library', icon: 'trash' as const, tone: 'danger' as const,
          onSelect: () => onRemove(card)
        }] as const) : [])
      ]}
    />
  );

  if (view === 'list')
    return (
      <article className="lrow" style={style}>
        <Link href={card.detailsHref} className="lmain">
          <Cover title={card.title} author={card.author} src={card.cover} size="xs" />
          <span className="lt">
            <span className="t">{card.title}{card.favorite && <Icon name="star" size={13} fill className="fav" label="Favourite" />}</span>
            <span className="caption">{card.author || 'Unknown author'} · {card.chapters} ch{card.offline ? '' : ' · online'}</span>
          </span>
          <span className="lp">
            <span className="caption mono" data-status={card.status}>
              {card.status === 'reading' ? `${pct}%` : STATUS[card.status]}
            </span>
            <span className="meter" data-size="sm" style={{ ['--p' as string]: card.percent }} />
          </span>
          <span className="la caption">{card.lastReadAt ? ago(card.lastReadAt) : '—'}</span>
        </Link>
        {menu}
        <style jsx>{`
          .lrow { display: flex; align-items: center; gap: var(--s-2); border-radius: var(--r-md); }
          .lrow :global(.lmain) {
            flex: 1; min-width: 0; display: grid; grid-template-columns: 2.4rem minmax(0, 1fr) 7rem 5.5rem; align-items: center; gap: var(--s-5);
            padding: var(--s-3); border-radius: var(--r-md); color: var(--ink); text-decoration: none;
            transition: background-color var(--dur-2), transform var(--dur-1) var(--ease-spring);
          }
          .lrow :global(.lmain:hover) { background: var(--fill); }
          .lrow :global(.lmain:active) { transform: scale(0.995); }
          .lt { display: grid; gap: 0.1rem; min-width: 0; }
          .t { display: flex; align-items: center; gap: var(--s-2); font-weight: 600; font-size: var(--t-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .t :global(.fav) { color: var(--accent); flex: none; }
          .lt .caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .lp { display: grid; gap: var(--s-2); }
          .lp [data-status='reading'] { color: var(--accent); }
          .la { text-align: right; color: var(--ink-3); }
          @media (max-width: 40rem) {
            .lrow :global(.lmain) { grid-template-columns: 2.4rem minmax(0, 1fr) 4rem; gap: var(--s-4); }
            .la { display: none; }
          }
        `}</style>
      </article>
    );

  return (
    <article className="card" style={style}>
      <Link href={card.detailsHref} className="art" aria-label={`${card.title} — details`}>
        <Cover title={card.title} author={card.author} src={card.cover} />
        {card.percent > 0 && (
          <span className="bar" aria-hidden><span style={{ transform: `scaleX(${Math.max(0.03, card.percent)})` }} /></span>
        )}
      </Link>

      <div className="meta">
        <div className="top">
          <Link href={card.detailsHref} className="t">{card.title}</Link>
          <span className="more">{menu}</span>
        </div>
        <p className="caption by">{card.author || 'Unknown author'}</p>
        <p className="facts">
          <span className="st" data-status={card.status}>
            {card.status === 'finished' && <Icon name="check" size={12} />}
            {card.status === 'reading' ? `${pct}% read` : STATUS[card.status]}
          </span>
          {card.favorite && <Icon name="star" size={12} fill className="fav" label="Favourite" />}
          {!card.offline && <span title="Read from the web">· online</span>}
        </p>
      </div>

      <style jsx>{`
        .card { position: relative; display: grid; gap: var(--s-4); align-content: start; }
        .card :global(.art) {
          position: relative; display: block; border-radius: var(--r-cover);
          transition: transform var(--dur-3) var(--ease-spring);
        }
        .card :global(.art .cover) { transition: box-shadow var(--dur-3) var(--ease-out); }
        .card :global(.art:hover) { transform: translate3d(0, -4px, 0); }
        .card :global(.art:hover .cover) { box-shadow: var(--shadow-cover), 0 22px 40px -20px #000b; }
        .card :global(.art:active) { transform: scale(0.98); }
        .card :global(.art:focus-visible) { outline-offset: 4px; }
        .bar {
          position: absolute; left: 8%; right: 8%; bottom: 7%; height: 3px; border-radius: var(--r-round);
          background: rgb(0 0 0 / 0.45); overflow: hidden;
        }
        .bar span { display: block; height: 100%; background: var(--accent); transform-origin: left; }
        .meta { display: grid; gap: 0.15rem; }
        .top { display: flex; align-items: flex-start; gap: var(--s-1); }
        .meta :global(.t) {
          flex: 1; min-width: 0; font-size: var(--t-callout); font-weight: 600; line-height: 1.3; color: var(--ink); text-decoration: none;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .meta :global(.t:hover) { text-decoration: underline; text-underline-offset: 0.18em; text-decoration-thickness: 1px; }
        .more { margin: -0.45rem -0.5rem 0 0; opacity: 0.55; transition: opacity var(--dur-2); }
        .card:hover .more, .more:focus-within { opacity: 1; }
        @media (pointer: coarse) { .more { opacity: 1; } }
        .by { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .facts { display: flex; align-items: center; gap: var(--s-2); margin: var(--s-1) 0 0; font-size: var(--t-micro); color: var(--ink-3); font-weight: 500; }
        .st { display: inline-flex; align-items: center; gap: 0.2rem; }
        .st[data-status='reading'] { color: var(--accent); }
        .facts :global(.fav) { color: var(--accent); }
      `}</style>
    </article>
  );
}
