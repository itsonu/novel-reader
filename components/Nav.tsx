'use client';
// The app's one navigation. Mounted once in the root layout, so every route gets the
// same destinations in the same order — the bar on a phone and the bar on a desktop
// are the same three links, not two different maps of the app.
//
// It hides itself on reading routes. A chapter has its own immersive chrome; a third
// bar would be the only thing on screen that isn't the book.
//
// At the top of a page the header is transparent and sits on the page; once content
// scrolls under it, it turns into frosted chrome with a hairline. That transform is the
// only signal it needs — no divider fighting the page title at rest.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { can } from '@/lib/mode';
import Icon, { type IconName } from './Icon';
import ThemeMenu from './ThemeMenu';
import { openCommand } from './commands';
import { isMac } from '@/lib/ui';

type Item = { href: string; label: string; icon: IconName; owns: (p: string) => boolean };

/** Trailing slashes exist on the static export but not on the Node host. */
const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

const ITEMS: Item[] = [
  {
    href: '/', label: 'Discover', icon: 'discover',
    // A published novel is something you discovered, so Discover stays lit while reading one.
    owns: p => p === '/' || p.startsWith('/n/')
  },
  {
    href: '/library', label: 'Library', icon: 'library',
    // The local novel page is a room inside the library.
    owns: p => p === '/library' || p === '/novel' || p.startsWith('/novel/')
  },
  {
    href: '/publish', label: can.cloudPublishing ? 'Publish' : 'Add', icon: 'plus',
    owns: p => p === '/publish'
  }
];

/** Routes that are a page of a book rather than a page of the app. The editor counts:
 *  a writing canvas with an app bar over it is a window, not a document. */
export const isReading = (p: string) => p === '/read' || p === '/write' || /^\/n\/[^/]+\/[^/]+/.test(p);

export default function Nav() {
  const path = clean(usePathname() || '/');
  const [scrolled, setScrolled] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(isMac());
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [path]);

  if (isReading(path)) return null;

  return (
    <>
      <header className="topbar" data-scrolled={scrolled || undefined}>
        <div className="inner">
          <Link href="/" className="brand" aria-label="Novel Reader — home">
            <span className="mark" aria-hidden><Icon name="book" size={16} strokeWidth={1.8} /></span>
            <span className="wordmark">Reader</span>
          </Link>

          <nav className="links" aria-label="Main">
            {ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="item"
                aria-current={item.owns(path) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="tools">
            <button className="find" onClick={openCommand} aria-label="Search and commands" aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}>
              <Icon name="search" size={16} />
              <span className="find-label">Search</span>
              <kbd className="find-kbd">{mac ? '⌘' : 'Ctrl'} K</kbd>
            </button>
            <ThemeMenu />
          </div>
        </div>
      </header>

      {/* Same destinations at thumb height. Only ever one of the two is displayed, so
          screen readers see a single Main landmark. */}
      <nav className="tabbar chrome" aria-label="Main">
        {ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="item"
            aria-current={item.owns(path) ? 'page' : undefined}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <style jsx>{`
        .topbar {
          position: sticky; top: 0; z-index: var(--z-nav);
          padding-top: env(safe-area-inset-top, 0px);
          background: transparent;
          transition: background-color var(--dur-3) var(--ease-out), box-shadow var(--dur-3) var(--ease-out),
                      backdrop-filter var(--dur-3) var(--ease-out);
        }
        .topbar[data-scrolled] {
          background: var(--chrome);
          backdrop-filter: blur(20px) saturate(170%); -webkit-backdrop-filter: blur(20px) saturate(170%);
          box-shadow: 0 1px 0 var(--rule);
        }
        .inner {
          max-width: var(--page-max); margin-inline: auto; height: 3.5rem;
          padding-inline: max(var(--gutter), env(safe-area-inset-left));
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--s-5);
        }
        .topbar :global(.brand) {
          justify-self: start; display: inline-flex; align-items: center; gap: var(--s-3);
          text-decoration: none; color: var(--ink); border-radius: var(--r-sm); padding: var(--s-1);
          margin-left: calc(var(--s-1) * -1);
        }
        .mark {
          display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 0.5rem;
          background: var(--accent); color: var(--accent-ink);
          transition: transform var(--dur-3) var(--ease-spring);
        }
        .topbar :global(.brand:hover) .mark { transform: rotate(-6deg) scale(1.04); }
        .wordmark { font-family: var(--font-serif); font-size: 1.15rem; font-weight: 600; letter-spacing: -0.015em; }

        .links { display: flex; gap: 2px; padding: 3px; border-radius: var(--r-round); }
        .topbar :global(.item) {
          display: inline-flex; align-items: center; min-height: 2.25rem; padding: 0 var(--s-5);
          border-radius: var(--r-round); color: var(--ink-2); text-decoration: none;
          font-size: var(--t-callout); font-weight: 500; letter-spacing: -0.005em;
          transition: color var(--dur-2), background-color var(--dur-2);
        }
        .topbar :global(.item:hover) { color: var(--ink); background: var(--fill); }
        .topbar :global(.item[aria-current='page']) { color: var(--ink); background: var(--fill-2); }

        .tools { justify-self: end; display: flex; align-items: center; gap: var(--s-2); }
        .find {
          display: inline-flex; align-items: center; gap: var(--s-3);
          min-height: 2.25rem; padding: 0 var(--s-2) 0 var(--s-4);
          border: 1px solid var(--rule); border-radius: var(--r-round); background: transparent;
          color: var(--ink-3); font-size: var(--t-caption); cursor: pointer;
          transition: color var(--dur-2), border-color var(--dur-2), background-color var(--dur-2);
        }
        .find:hover { color: var(--ink); border-color: var(--rule-strong); background: var(--fill); }
        .find-label { min-width: 5rem; text-align: start; }
        .find-kbd { font-size: 0.66rem; height: 1.3rem; border-bottom-width: 1px; }

        .tabbar { display: none; }

        @media (max-width: 40rem) {
          .inner { grid-template-columns: 1fr auto; height: 3.25rem; }
          .links { display: none; }
          .find { border: 0; padding: 0; width: 2.75rem; min-height: 2.75rem; justify-content: center; border-radius: var(--r-round); }
          .find-label, .find-kbd { display: none; }
          .tabbar {
            display: flex; position: fixed; z-index: var(--z-nav);
            inset: auto 0 0 0;
            padding: var(--s-1) var(--s-3) max(var(--s-1), env(safe-area-inset-bottom));
            box-shadow: 0 -1px 0 var(--rule);
          }
          .tabbar :global(.item) {
            flex: 1; display: grid; justify-items: center; gap: 0.125rem;
            min-height: 3.1rem; padding: var(--s-2) var(--s-1) var(--s-1); border-radius: var(--r-md);
            color: var(--ink-3); text-decoration: none; font-size: 0.66rem; font-weight: 500;
            letter-spacing: 0.01em;
            transition: color var(--dur-2), transform var(--dur-1) var(--ease-spring);
          }
          .tabbar :global(.item:active) { transform: scale(0.92); }
          .tabbar :global(.item[aria-current='page']) { color: var(--accent); }
        }
        @media (min-width: 40.01rem) and (max-width: 52rem) {
          .find-label, .find-kbd { display: none; }
          .find { padding: 0; width: 2.25rem; justify-content: center; }
        }
      `}</style>
    </>
  );
}
