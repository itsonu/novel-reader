'use client';
// A narrator that reacts to playback. Pure SVG + CSS — ~2KB, no PixiJS, no Live2D,
// no model download on top of Kokoro's 80MB.
// ponytail: upgrade path — swap this component for pixi-live2d-display if you want
// a real rigged character; the state prop is already the full behaviour contract.

export type Mood = 'idle' | 'thinking' | 'speaking' | 'paused' | 'done';

export default function Companion({ mood, level = 0 }: { mood: Mood; level?: number }) {
  const openness = mood === 'speaking' ? 0.35 + level * 0.65 : mood === 'thinking' ? 0.12 : 0.06;
  return (
    <div className="companion" data-mood={mood} aria-hidden="true">
      <svg viewBox="0 0 64 64" width="40" height="40">
        <defs>
          <radialGradient id="cg" cx="50%" cy="38%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.22" />
          </radialGradient>
        </defs>
        {/* breathing halo */}
        <circle className="halo" cx="32" cy="32" r="26" fill="url(#cg)" />
        {/* eyes — blink is CSS, closes on 'done' */}
        <g className="eyes" fill="var(--paper)">
          <rect x="21" y="26" width="5" height="8" rx="2.5" />
          <rect x="38" y="26" width="5" height="8" rx="2.5" />
        </g>
        {/* mouth — height driven by live audio level while speaking */}
        <rect
          className="mouth" x="26" y="40" width="12" rx="3" fill="var(--paper)"
          height={Math.max(2, openness * 12)}
          style={{ transform: `translateY(${(1 - openness) * 3}px)` }}
        />
      </svg>

      <style jsx>{`
        .companion { display: grid; place-items: center; width: 40px; height: 40px; }
        .halo { transform-origin: 32px 32px; animation: breathe 4.2s ease-in-out infinite; }
        .eyes { transform-origin: 32px 30px; animation: blink 6.5s infinite; }
        .mouth { transition: height 60ms linear, transform 60ms linear; }

        [data-mood='thinking'] .halo { animation: breathe 1.4s ease-in-out infinite; }
        [data-mood='speaking'] .halo { animation: breathe 2.2s ease-in-out infinite; }
        [data-mood='paused'] .halo { opacity: 0.55; animation-play-state: paused; }
        [data-mood='done'] .eyes { animation: none; transform: scaleY(0.12); }

        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.06); opacity: 1; }
        }
        @keyframes blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .halo, .eyes { animation: none; }
          .mouth { transition: none; }
        }
      `}</style>
    </div>
  );
}
