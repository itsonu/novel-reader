'use client';
// The keyboard map for a screen, opened with "?". Screens pass their own list, so the
// sheet only ever shows keys that do something where you are.

import Dialog from './Dialog';

export type Shortcut = { keys: string[]; label: string };

export default function Shortcuts({
  open, onClose, title = 'Keyboard shortcuts', groups
}: { open: boolean; onClose: () => void; title?: string; groups: { name: string; items: Shortcut[] }[] }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="md">
      <div className="cols">
        {groups.map(g => (
          <section key={g.name}>
            <h3 className="eyebrow">{g.name}</h3>
            <dl>
              {g.items.map(s => (
                <div key={s.label} className="it">
                  <dt>{s.label}</dt>
                  <dd>{s.keys.map(k => <kbd key={k}>{k}</kbd>)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <style jsx>{`
        .cols { display: grid; gap: var(--s-6); grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); }
        h3 { color: var(--ink-3); margin-bottom: var(--s-3); }
        dl { margin: 0; display: grid; gap: var(--s-1); }
        .it { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); min-height: 2rem; }
        dt { font-size: var(--t-callout); color: var(--ink); }
        dd { margin: 0; display: flex; gap: var(--s-1); flex: none; }
      `}</style>
    </Dialog>
  );
}
