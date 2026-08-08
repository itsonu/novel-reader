'use client';
import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { describeVoice, describeSystemVoice, type Voice } from '@/lib/voices';

/**
 * Replaces the native <select>. A native menu can't show accent, gender, timbre and
 * grade per row — and on the reader's dark page it renders as a bright OS rectangle.
 */
export default function VoicePicker({
  kind, voiceIds, value, onChange
}: {
  kind: 'kokoro' | 'system';
  voiceIds: string[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const all: Voice[] = useMemo(() => {
    if (kind === 'kokoro') return voiceIds.map(describeVoice);
    const sys = typeof window !== 'undefined' ? speechSynthesis.getVoices() : [];
    return sys.filter(v => voiceIds.includes(v.voiceURI)).map(describeSystemVoice);
  }, [kind, voiceIds]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (v: Voice) =>
      !needle ||
      `${v.name} ${v.accent} ${v.gender} ${v.timbre}`.toLowerCase().includes(needle);
    const map = new Map<string, Voice[]>();
    for (const v of all.filter(match)) {
      const key = `${v.accent} · ${v.gender}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    for (const list of map.values())
      list.sort((a, b) => (a.grade ? 0 : 1) - (b.grade ? 0 : 1) || a.name.localeCompare(b.name));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all, q]);

  const current = all.find(v => v.id === value);

  return (
    <>
      <button className="trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="who">{current?.name ?? 'Voice'}</span>
        <span className="what caption">
          {current ? `${current.accent} ${current.gender}` : 'choose'}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Voice">
        {all.length > 8 && (
          <input
            className="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search accent, name or tone" aria-label="Search voices"
          />
        )}
        {groups.map(([label, list]) => (
          <section key={label}>
            <h3 className="caption group">{label}</h3>
            <ul>
              {list.map(v => (
                <li key={v.id}>
                  <button
                    className={v.id === value ? 'row on' : 'row'}
                    onClick={() => { onChange(v.id); setOpen(false); }}
                  >
                    <span className="mark" aria-hidden>{v.id === value ? '✓' : ''}</span>
                    <span className="text">
                      <span className="name">
                        {v.name}
                        {v.grade && <span className="grade caption">{v.grade}</span>}
                      </span>
                      <span className="sub caption">{v.timbre}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="caption empty">No voice matches “{q}”.</p>}
      </Sheet>

      <style jsx>{`
        .trigger {
          display: flex; align-items: center; gap: 0.5rem;
          background: transparent; border: 1px solid var(--rule); border-radius: 0.6rem;
          padding: 0.34rem 0.6rem; color: var(--ink); font: inherit; cursor: pointer;
          max-width: 15rem; min-width: 0;
          transition: transform var(--quick), border-color var(--quick);
        }
        .trigger:active { transform: scale(0.97); }
        .trigger:hover { border-color: color-mix(in oklab, var(--accent) 45%, var(--rule)); }
        .who { font-size: 0.84rem; font-weight: 520; white-space: nowrap; }
        .what { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .trigger svg { color: var(--ink-faint); flex: none; }

        .search {
          width: calc(100% - 0.8rem); margin: 0 0.4rem 0.5rem;
          background: color-mix(in oklab, var(--ink) 6%, transparent);
          border: 1px solid var(--rule); border-radius: 0.6rem;
          padding: 0.5rem 0.7rem; color: var(--ink); font: inherit; font-size: 0.86rem;
        }
        .group {
          position: sticky; top: 0; z-index: 1;
          padding: 0.5rem 0.7rem 0.35rem; margin: 0;
          background: linear-gradient(var(--paper) 70%, transparent);
          text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.68rem;
        }
        ul { list-style: none; margin: 0 0 0.4rem; padding: 0; }
        .row {
          width: 100%; display: flex; align-items: center; gap: 0.6rem;
          background: transparent; border: 0; border-radius: 0.7rem;
          padding: 0.6rem 0.7rem; color: var(--ink); font: inherit; cursor: pointer;
          text-align: start; transition: background-color var(--quick), transform var(--quick);
        }
        .row:active { transform: scale(0.985); }
        .row:hover { background: color-mix(in oklab, var(--ink) 6%, transparent); }
        .row.on { background: color-mix(in oklab, var(--accent) 13%, transparent); }
        .mark { width: 1rem; color: var(--accent); flex: none; }
        .text { display: grid; gap: 0.1rem; min-width: 0; }
        .name { font-size: 0.92rem; display: flex; align-items: center; gap: 0.45rem; }
        .grade {
          border: 1px solid var(--rule); border-radius: 999px;
          padding: 0 0.35rem; font-size: 0.64rem; color: var(--accent);
        }
        .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .empty { padding: 1.5rem 0.7rem; text-align: center; }
      `}</style>
    </>
  );
}
