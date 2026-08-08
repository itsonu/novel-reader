'use client';
// The app's one navigation. Mounted once in the root layout, so every route gets the
// same destinations in the same order — the bar on a phone and the bar on a desktop
// are the same three links, not two different maps of the app.
//
// It hides itself on reading routes. A chapter already has the Player pinned to the
// bottom and a breadcrumb pinned to the top; a third bar would be the only thing on
// screen that isn't the book.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { can } from '@/lib/mode';

type Item = { href: string; label: string; icon: React.ReactNode; owns: (p: string) => boolean };

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/** Trailing slashes exist on the static export but not on the Node host. */
const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

const ITEMS: Item[] = [
  {
    href: '/',
    label: 'Discover',
    icon: <Icon d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v14.5M4 6.5V19a1 1 0 0 0 1 1h14M4 6.5A2.5 2.5 0 0 0 6.5 9H19" />,
    // A published novel is something you discovered, so Discover stays lit while reading one.
    owns: p => p === '/' || p.startsWith('/n/')
  },
  {
    href: '/library',
    label: 'Library',
    icon: <Icon d="M4 19V5m4 14V5m5 14 3.5-13M4 19h16" />,
    // The local reader and the local novel page are rooms inside the library.
    owns: p => p === '/library' || p === '/read' || p === '/novel'
  },
  {
    href: '/publish',
    label: can.cloudPublishing ? 'Publish' : 'Add',
    icon: <Icon d="M12 5v14M5 12h14" />,
    owns: p => p === '/publish'
  }
];

/** Routes that are a page of a book rather than a page of the app. The editor counts:
 *  a writing canvas with an app bar over it is a window, not a document. */
const isReading = (p: string) => p === '/read' || p === '/write' || /^\/n\/[^/]+\/[^/]+/.test(p);

export default function Nav() {
  const path = clean(usePathname() || '/');
  if (isReading(path)) return null;

  // Written out twice rather than shared through a variable: styled-jsx only scopes
  // JSX that appears in the returned tree, so links built in a `const` above come out
  // with no styles at all. One list of destinations, two renderings of it.
  return (
    <>
      <header className="topbar chrome">
        <Link href="/" className="brand" aria-label="Novel Reader — home">
          <span className="wordmark">Reader</span>
        </Link>
        <nav className="links" aria-label="Main">
          {ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="item"
              data-active={item.owns(path) || undefined}
              aria-current={item.owns(path) ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      {/* Same destinations at thumb height. Only ever one of the two is displayed, so
          screen readers see a single Main landmark. */}
      <nav className="tabbar chrome" aria-label="Main">
        {ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="item"
            data-active={item.owns(path) || undefined}
            aria-current={item.owns(path) ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <style jsx>{`
        .topbar {
          position: sticky; top: 0; z-index: var(--z-nav);
          display: flex; align-items: center; justify-content: space-between; gap: 1rem;
          padding: 0.6rem max(1.25rem, env(safe-area-inset-left), calc(50vw - 34rem + 1.5rem));
        }
        /* next/link renders a component, and styled-jsx only scopes host elements —
           so every <Link> here is reached with :global() from a scoped ancestor.
           Without this the nav renders as unstyled blue browser links. */
        .topbar :global(.brand) { text-decoration: none; color: var(--ink); border-radius: var(--r-tight); }
        .topbar :global(.brand:focus-visible) { outline: var(--focus); outline-offset: 3px; }
        .links { display: flex; gap: 0.15rem; }

        .topbar :global(.item) {
          display: flex; align-items: center; gap: 0.4rem;
          padding: var(--s-2) var(--s-4); border-radius: var(--r-control);
          color: var(--ink-dim); text-decoration: none;
          font-size: 0.86rem; letter-spacing: -0.005em;
          transition: color var(--quick), background-color var(--quick);
        }
        .topbar :global(.item svg) { opacity: 0.75; }
        .topbar :global(.item:hover) { color: var(--ink); background: color-mix(in oklab, var(--ink) 7%, transparent); }
        .topbar :global(.item[data-active]) {
          color: var(--accent);
          background: color-mix(in oklab, var(--accent) 12%, transparent);
        }
        .topbar :global(.item[data-active] svg) { opacity: 1; }
        .topbar :global(.item:focus-visible),
        .tabbar :global(.item:focus-visible) { outline: var(--focus); outline-offset: var(--focus-gap); }

        .tabbar { display: none; }

        @media (max-width: 40rem) {
          /* Clearance for the fixed bar lives in globals.css, keyed off :has(nav.tabbar)
             — it has to target #main, and a rule made only of :global() doesn't survive
             styled-jsx's transform. Body padding can't do it either: globals pin body to
             height:100% with border-box sizing, so padding there moves nothing. */

          .topbar .links { display: none; }
          .tabbar {
            display: flex; position: fixed; z-index: var(--z-nav);
            inset: auto 0 0 0;
            padding: 0.35rem 0.5rem max(0.35rem, env(safe-area-inset-bottom));
            box-shadow: 0 -1px 0 color-mix(in oklab, var(--ink) 10%, transparent);
          }
          .tabbar :global(.item) {
            flex: 1; display: grid; justify-items: center; gap: 0.15rem;
            /* 3rem tall before padding — comfortably past the 44px touch minimum */
            padding: 0.45rem var(--s-1) 0.35rem; border-radius: var(--r-panel);
            color: var(--ink-dim); text-decoration: none; font-size: 0.68rem;
            letter-spacing: 0.01em;
            transition: color var(--quick), background-color var(--quick);
          }
          .tabbar :global(.item:active) { background: color-mix(in oklab, var(--ink) 8%, transparent); }
          .tabbar :global(.item[data-active]) { color: var(--accent); }
        }
      `}</style>
    </>
  );
}
