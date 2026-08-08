'use client';
import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { describeVoice, describeSystemVoice, type Voice } from '@/lib/voices';

const SPEEDS = [0.75, 0.9, 1, 1.15, 1.25, 1.5, 1.75, 2];

type Props = {
  open: boolean; onClose: () => void;
  kind: 'kokoro' | 'system';
  voiceIds: string[]; voice: string; onVoice: (id: string) => void;
  rate: number; onRate: (r: number) => void;
  cinematic: boolean; onCinematic: (v: boolean) => void;
  canUpgrade: boolean; upgrading: number | null; onUpgrade: () => void;
};

export default function SettingsSheet(p: Props) {
  // 'root' | 'voice' | 'speed' — one sheet, a panel stack inside it, like YouTube's gear
  const [panel, setPanel] = useState<'root' | 'voice' | 'speed'>('root');

  const voices: Voice[] = useMemo(() => {
    if (p.kind === 'kokoro') return p.voiceIds.map(describeVoice);
    const sys = typeof window !== 'undefined' ? speechSynthesis.getVoices() : [];
    return sys.filter(v => p.voiceIds.includes(v.voiceURI)).map(describeSystemVoice);
  }, [p.kind, p.voiceIds]);

  const groups = useMemo(() => {
    const m = new Map<string, Voice[]>();
    for (const v of voices) {
      const k = `${v.accent} · ${v.gender}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(v);
    }
    for (const l of m.values())
      l.sort((a, b) => (a.grade ? 0 : 1) - (b.grade ? 0 : 1) || a.name.localeCompare(b.name));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [voices]);

  const current = voices.find(v => v.id === p.voice);
  const downloadedBefore =
    typeof window !== 'undefined' && localStorage.getItem('nr:kokoro') === '1';
  const close = () => { setPanel('root'); p.onClose(); };
  const title = panel === 'voice' ? 'Voice' : panel === 'speed' ? 'Speed' : 'Settings';

  return (
    <Sheet open={p.open} onClose={close} title={title}>
      {panel !== 'root' && (
        <button className="back" onClick={() => setPanel('root')}>
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Settings
        </button>
      )}

      {panel === 'root' && (
        <ul className="rows">
          <li>
            <button className="row" onClick={() => setPanel('voice')}>
              <span className="label">Voice</span>
              <span className="value">
                {current ? current.name : '—'}
                <span className="chev">›</span>
              </span>
            </button>
          </li>
          <li>
            <button className="row" onClick={() => setPanel('speed')}>
              <span className="label">Speed</span>
              <span className="value">
                {p.rate === 1 ? 'Normal' : `${p.rate}×`}
                <span className="chev">›</span>
              </span>
            </button>
          </li>
          <li>
            <button
              className="row"
              onClick={() => p.onCinematic(!p.cinematic)}
              aria-pressed={p.cinematic}
            >
              <span className="label">
                Cinematic effects
                <span className="hint caption">screen beats on the narrated word</span>
              </span>
              <span className={p.cinematic ? 'toggle on' : 'toggle'} aria-hidden><i /></span>
            </button>
          </li>
          <li>
            <button
              className="row"
              onClick={p.canUpgrade ? p.onUpgrade : undefined}
              disabled={!p.canUpgrade || p.upgrading != null}
            >
              <span className="label">
                Neural voices
                <span className="hint caption">
                  {!p.canUpgrade
                    ? 'downloaded · works offline'
                    : p.upgrading != null
                      ? `downloading ${Math.round(p.upgrading * 100)}%`
                      : downloadedBefore
                        ? 'already downloaded · tap to reload'
                        : 'one-time ~80 MB download, then offline'}
                </span>
              </span>
              <span className="value">
                {!p.canUpgrade ? '✓ Ready' : p.upgrading != null ? '…' : downloadedBefore ? 'Reload' : 'Get'}
              </span>
            </button>
          </li>
        </ul>
      )}

      {panel === 'speed' && (
        <ul className="rows">
          {SPEEDS.map(s => (
            <li key={s}>
              <button className={s === p.rate ? 'row sel' : 'row'} onClick={() => { p.onRate(s); setPanel('root'); }}>
                <span className="mark">{s === p.rate ? '✓' : ''}</span>
                <span className="label">{s === 1 ? 'Normal' : `${s}×`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel === 'voice' && groups.map(([label, list]) => (
        <section key={label}>
          <h3 className="group caption">{label}</h3>
          <ul className="rows">
            {list.map(v => (
              <li key={v.id}>
                <button
                  className={v.id === p.voice ? 'row sel' : 'row'}
                  onClick={() => { p.onVoice(v.id); setPanel('root'); }}
                >
                  <span className="mark">{v.id === p.voice ? '✓' : ''}</span>
                  <span className="label">
                    {v.name}{v.grade && <span className="grade">{v.grade}</span>}
                    <span className="hint caption">{v.timbre}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <style jsx>{`
        .rows { list-style: none; margin: 0 0 0.4rem; padding: 0; }
        .row {
          width: 100%; display: flex; align-items: center; gap: 0.7rem;
          background: transparent; border: 0; border-radius: 0.7rem;
          padding: 0.72rem 0.75rem; color: var(--ink); font: inherit;
          cursor: pointer; text-align: start;
          transition: background-color var(--quick), transform var(--quick);
        }
        .row:hover { background: color-mix(in oklab, var(--ink) 7%, transparent); }
        .row:active { transform: scale(0.985); }
        .row:disabled { opacity: 0.5; cursor: default; }
        .label { flex: 1; display: grid; gap: 0.12rem; font-size: 0.94rem; }
        .hint { font-size: 0.74rem; }
        .value {
          display: flex; align-items: center; gap: 0.3rem;
          color: var(--ink-dim); font-size: 0.88rem; white-space: nowrap;
        }
        .chev { color: var(--ink-faint); font-size: 1.05rem; line-height: 1; }
        .mark { width: 1rem; color: var(--accent); flex: none; }
        .row.sel { background: color-mix(in oklab, var(--accent) 12%, transparent); }
        .grade {
          margin-inline-start: 0.4rem; border: 1px solid var(--rule); border-radius: 999px;
          padding: 0 0.35rem; font-size: 0.64rem; color: var(--accent);
        }
        .group {
          position: sticky; top: 0; z-index: 1; margin: 0;
          padding: 0.55rem 0.75rem 0.3rem;
          background: linear-gradient(var(--paper) 70%, transparent);
          text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.66rem;
        }
        .toggle {
          width: 2.35rem; height: 1.4rem; border-radius: 999px; flex: none;
          background: color-mix(in oklab, var(--ink) 22%, transparent);
          transition: background-color 200ms; display: grid; align-items: center;
          padding: 0 0.16rem;
        }
        .toggle i {
          display: block; width: 1.08rem; height: 1.08rem; border-radius: 999px;
          background: var(--paper); transform: translateX(0);
          transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        .toggle.on { background: var(--accent); }
        .toggle.on i { transform: translateX(0.95rem); }
        .back {
          display: flex; align-items: center; gap: 0.4rem;
          background: transparent; border: 0; color: var(--ink-dim);
          font: inherit; font-size: 0.82rem; cursor: pointer;
          padding: 0.3rem 0.75rem 0.55rem;
        }
        .back:hover { color: var(--ink); }
      `}</style>
    </Sheet>
  );
}
