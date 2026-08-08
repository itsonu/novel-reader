'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Companion, { type Mood } from './Companion';
import SettingsSheet from './SettingsSheet';
import { unlock } from '@/lib/fx/audio';
import type { PlayerState } from '@/lib/reader/usePlayer';

type Props = {
  state: PlayerState;
  voiceIds: string[];
  onToggle: () => void;
  onJump: (d: 1 | -1) => void;
  onRate: (r: number) => void;
  onVoice: (id: string) => void;
  onUpgrade: () => void;
  onSeek: (fraction: number) => void;
  timing: () => { elapsed: number; total: number };
  cinematic: boolean;
  onCinematic: (v: boolean) => void;
  sfx: number;
  onSfx: (v: number) => void;
};

const clock = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export default function Player({
  state, voiceIds, onToggle, onJump, onRate, onVoice, onUpgrade,
  onSeek, timing, cinematic, onCinematic, sfx, onSfx
}: Props) {
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState('');
  const [settings, setSettings] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  /* Restore speed on mount. Voice is restored below, once the engine has published
     its list — a saved id is only usable if that engine actually offers it. */
  useEffect(() => {
    const r = parseFloat(localStorage.getItem('nr:rate') ?? '');
    if (r && r !== 1) { setRate(r); onRate(r); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRatePersist = (r: number) => {
    setRate(r); onRate(r);
    localStorage.setItem('nr:rate', String(r));
  };
  const setVoicePersist = (id: string) => {
    setVoice(id); onVoice(id);
    // keyed per engine: a Kokoro id means nothing to the system voice list
    localStorage.setItem(`nr:voice:${state.kind}`, id);
  };

  useEffect(() => {
    if (voice && voiceIds.includes(voice)) return;
    if (!voiceIds.length) return;
    const saved = localStorage.getItem(`nr:voice:${state.kind}`);
    const pick =
      (saved && voiceIds.includes(saved) && saved) ||
      (state.kind === 'kokoro' && voiceIds.includes('af_heart') && 'af_heart') ||
      voiceIds[0];
    setVoice(pick); onVoice(pick);
  }, [voiceIds, voice, state.kind, onVoice]);

  const progress = state.sentences > 1 ? state.sentence / (state.sentences - 1) : 0;
  const shown = scrub ?? progress;
  const { elapsed, total } = timing();

  const fromEvent = useCallback((clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setScrub(fromEvent(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (scrub === null) return;
    setScrub(fromEvent(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    if (scrub === null) return;
    const f = fromEvent(e.clientX);
    setScrub(null);
    onSeek(f);
  };

  const mood: Mood =
    state.loadPct != null ? 'thinking'
      : state.paused ? 'paused'
      : state.playing ? 'speaking'
      : state.spoken >= 0 ? 'done' : 'idle';

  const playing = state.playing && !state.paused;

  return (
    <>
      <div className="player chrome">
        {/* scrubber — the element that makes this read as a media player */}
        <div
          ref={bar}
          className="scrub"
          role="slider"
          aria-label="Chapter position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown * 100)}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.02));
            if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.02));
          }}
        >
          <div className="track">
            <div className="fill" style={{ transform: `scaleX(${shown})` }} />
            <div className="knob" style={{ left: `${shown * 100}%` }} />
          </div>
        </div>

        <div className="row">
          <button
            className="ctl primary"
            onClick={() => { unlock(); onToggle(); }}
            disabled={!state.ready}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing
              ? <svg viewBox="0 0 24 24" width="20" height="20"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 4.8v14.4L19.5 12z" fill="currentColor" /></svg>}
          </button>

          <button className="ctl" onClick={() => onJump(-1)} aria-label="Previous paragraph">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M6 12l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="ctl" onClick={() => onJump(1)} aria-label="Next paragraph">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 19V5M6 12l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          <span className="time mono caption">
            {clock(elapsed)} <span className="sep">/</span> {clock(total)}
          </span>

          <span className="grow" />

          {state.kind === 'system' && (
            <button
              className="ctl upgrade"
              onClick={onUpgrade}
              disabled={state.loadPct != null}
              aria-label="Download better voices"
            >
              {state.loadPct != null
                ? <span className="pct mono">{Math.round(state.loadPct * 100)}%</span>
                : <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          )}

          <button
            className={cinematic ? 'ctl on' : 'ctl'}
            onClick={() => onCinematic(!cinematic)}
            aria-pressed={cinematic}
            aria-label="Cinematic effects"
          >
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3l2.1 5.3L19.5 9l-4 3.6 1.1 5.4L12 15.4 7.4 18l1.1-5.4-4-3.6 5.4-.7z" fill={cinematic ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </button>

          <button className="ctl" onClick={() => setSettings(true)} aria-label="Settings" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <span className="face"><Companion mood={mood} /></span>
        </div>
      </div>

      <SettingsSheet
        open={settings}
        onClose={() => setSettings(false)}
        kind={state.kind}
        voiceIds={voiceIds}
        voice={voice}
        onVoice={setVoicePersist}
        rate={rate}
        onRate={setRatePersist}
        cinematic={cinematic}
        onCinematic={onCinematic}
        sfx={sfx}
        onSfx={onSfx}
        canUpgrade={state.kind === 'system'}
        upgrading={state.loadPct}
        onUpgrade={onUpgrade}
      />

      <style jsx>{`
        .player {
          position: fixed; inset: auto 0 0 0; z-index: 40;
          padding: 0 0 env(safe-area-inset-bottom);
        }
        /* scrubber */
        .scrub { padding: 0.55rem 0.9rem 0.2rem; cursor: pointer; touch-action: none; }
        .track { position: relative; height: 3px; border-radius: 2px; background: color-mix(in oklab, var(--ink) 18%, transparent); }
        .fill {
          position: absolute; inset: 0; transform-origin: left center;
          background: var(--accent); border-radius: 2px;
        }
        .knob {
          position: absolute; top: 50%; width: 11px; height: 11px; border-radius: 999px;
          background: var(--accent); transform: translate(-50%, -50%) scale(0);
          transition: transform 140ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        .scrub:hover .knob, .scrub:focus-visible .knob { transform: translate(-50%, -50%) scale(1); }
        .scrub:hover .track, .scrub:focus-visible .track { height: 5px; }
        .track { transition: height 140ms cubic-bezier(0.32, 0.72, 0, 1); }
        .scrub:focus-visible { outline: none; }
        .scrub:focus-visible .track { box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent); }

        /* control row */
        .row {
          display: flex; align-items: center; gap: 0.15rem;
          padding: 0.15rem 0.55rem 0.5rem;
        }
        .ctl {
          display: grid; place-items: center; width: 2.4rem; height: 2.4rem;
          background: transparent; border: 0; border-radius: 999px;
          color: var(--ink); cursor: pointer;
          transition: background-color var(--quick), transform var(--quick), color var(--quick);
        }
        .ctl:hover { background: color-mix(in oklab, var(--ink) 9%, transparent); }
        .ctl:active { transform: scale(0.9); }
        .ctl:disabled { opacity: 0.4; cursor: default; }
        .ctl.primary { width: 2.8rem; height: 2.8rem; }
        .ctl.on { color: var(--accent); }
        .ctl.upgrade { color: var(--accent); }
        .pct { font-size: 0.7rem; }
        .time { margin-inline: 0.5rem 0; white-space: nowrap; }
        .sep { opacity: 0.5; }
        .grow { flex: 1; }
        .face { margin-inline-start: 0.3rem; display: grid; place-items: center; }

        /* Phones: the transport keeps its touch targets, the readout goes. Nothing
           below 44px, nothing that needs a hover to be discoverable. */
        @media (max-width: 40rem) {
          .scrub { padding: 0.6rem 0.6rem 0.15rem; }
          .track { height: 4px; }
          .knob { transform: translate(-50%, -50%) scale(1); }   /* no hover on touch */
          .row { gap: 0; padding: 0.1rem 0.35rem 0.45rem; }
          .ctl { width: 2.75rem; height: 2.75rem; }
          .ctl.primary { width: 3rem; height: 3rem; }
          .time { display: none; }
          .face { display: none; }
        }
        @media (max-width: 22rem) {
          .ctl:nth-of-type(3) { display: none; }   /* drop next-paragraph on tiny screens */
        }
      `}</style>
    </>
  );
}
