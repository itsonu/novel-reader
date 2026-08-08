'use client';
import { useEffect, useState } from 'react';
import Companion, { type Mood } from './Companion';
import VoicePicker from './VoicePicker';
import type { PlayerState } from '@/lib/reader/usePlayer';

type Props = {
  state: PlayerState;
  voiceIds: string[];
  onToggle: () => void;
  onJump: (d: 1 | -1) => void;
  onRate: (r: number) => void;
  onVoice: (id: string) => void;
  onUpgrade: () => void;
};

export default function Player({ state, voiceIds, onToggle, onJump, onRate, onVoice, onUpgrade }: Props) {
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState('');

  useEffect(() => {
    if (!voice && voiceIds.length) {
      const first = state.kind === 'kokoro' ? (voiceIds.includes('af_heart') ? 'af_heart' : voiceIds[0]) : voiceIds[0];
      setVoice(first); onVoice(first);
    }
  }, [voiceIds, voice, state.kind, onVoice]);

  const mood: Mood =
    state.loadPct != null ? 'thinking'
      : state.paused ? 'paused'
      : state.playing ? 'speaking'
      : state.spoken >= 0 ? 'done' : 'idle';

  const pct = state.loadPct;

  return (
    <div className="player chrome">
      <Companion mood={mood} />

      <div className="transport">
        <button className="icon-btn" onClick={() => onJump(-1)} aria-label="Previous paragraph">↑</button>
        <button
          className="icon-btn" data-size="lg" onClick={onToggle}
          aria-label={state.playing && !state.paused ? 'Pause' : 'Play'}
          disabled={!state.ready}
        >
          {state.playing && !state.paused ? '❚❚' : '▶'}
        </button>
        <button className="icon-btn" onClick={() => onJump(1)} aria-label="Next paragraph">↓</button>
      </div>

      <label className="field">
        <span className="caption">Speed</span>
        <input
          type="range" min={0.6} max={1.8} step={0.05} value={rate}
          onChange={e => { const r = +e.target.value; setRate(r); onRate(r); }}
          aria-label="Playback speed"
        />
        <span className="caption mono">{rate.toFixed(2).replace(/0$/, '')}×</span>
      </label>

      <VoicePicker
        kind={state.kind}
        voiceIds={voiceIds}
        value={voice}
        onChange={id => { setVoice(id); onVoice(id); }}
      />

      {state.kind === 'system' && (
        <button className="btn" data-variant="primary" onClick={onUpgrade} disabled={pct != null}>
          {pct != null ? `${Math.round((pct ?? 0) * 100)}%` : 'Better voices'}
        </button>
      )}

      {pct != null && (
        <div className="loader" role="status">
          <div className="track"><div className="fill" style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          <span className="caption">{state.loadFile || 'voice model'} · one-time download</span>
        </div>
      )}

      <style jsx>{`
        .player {
          position: fixed; inset: auto 0 0 0; z-index: 40;
          display: flex; align-items: center; gap: 1rem;
          padding: 0.6rem max(1rem, env(safe-area-inset-left)) calc(0.6rem + env(safe-area-inset-bottom));
        }
        .transport { display: flex; align-items: center; gap: 0.4rem; }
        .field { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
        .grow { flex: 1; max-width: 22rem; }
        .field :global(input[type='range']) { width: 6rem; accent-color: var(--accent); }
        .field :global(select) {
          flex: 1; min-width: 0; background: transparent; color: var(--ink);
          border: 1px solid var(--rule); border-radius: 0.55rem;
          padding: 0.35rem 0.5rem; font: inherit; font-size: 0.82rem;
        }
        .loader { position: absolute; inset: auto 1rem calc(100% + 0.6rem) auto; width: 17rem; }
        .track { height: 3px; background: var(--rule); border-radius: 2px; overflow: hidden; }
        .fill { height: 100%; background: var(--accent); transition: width 200ms ease-out; }
        @media (max-width: 760px) {
          .field:not(.grow) { display: none; }
          .player { gap: 0.6rem; padding-inline: 0.75rem; }
        }
      `}</style>
    </div>
  );
}
