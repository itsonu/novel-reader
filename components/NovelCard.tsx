'use client';
// One card, every shelf. Whatever is true of a book — where it came from, how far in
// they are, whether it works on a plane — is visible without opening it.

import Link from 'next/link';
import type { Card } from '@/lib/library-select';

const STATUS: Record<Card['status'], string> = {
  new: 'Not started',
  reading: 'Reading',
  finished: 'Finished'
};

export default function NovelCard({
  card, onFavorite, onRemove
}: {
  card: Card;
  onFavorite: (id: string, on: boolean) => void;
  onRemove?: (card: Card) => void;
}) {
  const pct = Math.round(card.percent * 100);

  return (
    <article className="card">
      <Link href={card.detailsHref} className="art" aria-label={`${card.title} — details`}>
        {card.cover
          ? <img src={card.cover} alt="" />
          : <span className="blank" aria-hidden>{card.title.slice(0, 1)}</span>}
        {card.percent > 0 && (
          <span className="bar" aria-hidden><span style={{ width: `${Math.max(3, pct)}%` }} /></span>
        )}
      </Link>

      <div className="tools">
        <button
          className="chip"
          aria-pressed={card.favorite}
          aria-label={card.favorite ? `Remove ${card.title} from favourites` : `Add ${card.title} to favourites`}
          onClick={() => onFavorite(card.id, !card.favorite)}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="1.7"
               strokeLinejoin="round" fill={card.favorite ? 'currentColor' : 'none'} aria-hidden>
            <path d="m12 4.6 2.3 4.66 5.15.75-3.73 3.63.88 5.13L12 16.35l-4.6 2.42.88-5.13L4.55 10l5.15-.75Z" />
          </svg>
        </button>
        {onRemove && (
          <button className="chip" aria-label={`Remove ${card.title} from library`} onClick={() => onRemove(card)}>
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="1.7"
                 strokeLinecap="round" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="meta">
        <Link href={card.detailsHref} className="t title">{card.title}</Link>
        <p className="caption by">{card.author || 'Unknown author'}</p>
        <p className="caption facts mono">
          <span data-status={card.status}>{STATUS[card.status]}</span>
          {card.percent > 0 && <span> · {pct}%</span>}
          <span> · {card.chapters} ch</span>
          {card.offline
            ? <span title="Stored on this device — works offline"> · offline</span>
            : <span title="Read from the web"> · online</span>}
        </p>
        <Link
          href={card.resumeHref}
          className="btn go"
          data-variant={card.status === 'reading' ? 'primary' : undefined}
        >
          {card.status === 'reading' ? 'Continue' : card.status === 'finished' ? 'Read again' : 'Start reading'}
        </Link>
      </div>

      <style jsx>{`
        .card { position: relative; display: grid; gap: 0.6rem; align-content: start; }
        /* .art, .t and .go are <Link>s. styled-jsx scopes host elements only, so they
           are reached with :global() from the scoped .card around them. */
        .card :global(.art) {
          position: relative; display: block; border-radius: var(--r-panel); overflow: hidden;
          box-shadow: var(--e-2);
          transition: transform var(--settle);
        }
        .card :global(.art:hover) { transform: translateY(-3px); }
        .card :global(.art:focus-visible) { outline: var(--focus); outline-offset: 3px; }
        .card :global(.art img), .blank { display: block; width: 100%; aspect-ratio: 2 / 3; object-fit: cover; }
        .blank {
          display: grid; place-items: center; font-family: var(--serif); font-size: 2.4rem;
          color: var(--ink-faint); background: color-mix(in oklab, var(--ink) 6%, transparent);
        }
        .bar {
          position: absolute; inset: auto 0 0 0; height: 3px;
          background: color-mix(in oklab, #000 45%, transparent);
        }
        .bar :global(span) { display: block; height: 100%; background: var(--accent); }

        .tools { position: absolute; top: 0.4rem; right: 0.4rem; display: flex; gap: 0.25rem; }
        .chip {
          display: grid; place-items: center; width: 1.85rem; height: 1.85rem;
          border-radius: var(--r-round); border: 0; cursor: pointer;
          background: color-mix(in oklab, #000 55%, transparent);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          color: #f4ece0;
          transition: transform var(--quick), background-color var(--quick), color var(--quick);
        }
        .chip:hover { background: color-mix(in oklab, #000 72%, transparent); }
        .chip:active { transform: scale(0.9); }
        .chip[aria-pressed='true'] { color: var(--accent); }
        .chip:focus-visible { outline: var(--focus); outline-offset: var(--focus-gap); }

        .meta { display: grid; gap: 0.2rem; }
        .meta :global(.t) {
          font-size: 0.95rem; line-height: 1.25; color: var(--ink); text-decoration: none;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .meta :global(.t:hover) { text-decoration: underline; text-underline-offset: 0.18em; }
        .meta :global(.t:focus-visible) { outline: var(--focus); outline-offset: var(--focus-gap); border-radius: var(--s-1); }
        .by { margin: 0; }
        .facts { margin: 0.15rem 0 0; color: var(--ink-faint); }
        .facts [data-status='reading'] { color: var(--accent); }
        .facts [data-status='finished'] { color: var(--ink-dim); }
        .meta :global(.go) { justify-self: start; margin-top: 0.45rem; text-decoration: none; }

        @media (prefers-reduced-motion: reduce) {
          .card :global(.art:hover) { transform: none; }
        }
      `}</style>
    </article>
  );
}
