'use client';
// The intensity ladder from the spec, implemented at the tier CSS can carry.
//
// ponytail: no Three.js, no Theatre.js, no animation library. Tiers 0.1–0.7 are
// transform/opacity/filter on two fixed layers — which is every tier that fires
// during ordinary reading. Tiers 0.9+ (shaders, particles, cinematic timelines) are
// specced in docs/visual-novel-spec.md and deliberately not built yet.

import type { FxEvent, FxKind } from './lexicon';

export type Tier = 'text' | 'ambient' | 'camera' | 'screen';

/** Ladder: what an intensity is allowed to reach for. */
export function tierFor(intensity: number): Tier {
  if (intensity >= 0.85) return 'screen';
  if (intensity >= 0.65) return 'camera';
  if (intensity >= 0.4) return 'ambient';
  return 'text';
}

export type FxCommand = {
  kind: FxKind;
  tier: Tier;
  intensity: number;
  /** ms */
  duration: number;
  /** CSS custom-property payload applied to the fx root */
  vars: Record<string, string>;
  /** class toggled on the fx root for the duration */
  className: string;
};

const HUE: Record<FxKind, string> = {
  impact: '0 0% 100%',
  explosion: '28 90% 62%',
  lightning: '210 100% 92%',
  weather: '210 30% 70%',
  reveal: '45 90% 70%',
  silence: '0 0% 0%',
  dread: '355 70% 45%',
  warmth: '30 70% 68%'
};

export function compile(e: FxEvent): FxCommand {
  const tier = tierFor(e.intensity);
  const i = e.intensity;
  const duration =
    e.kind === 'silence' ? 1400 :
    tier === 'screen' ? 900 :
    tier === 'camera' ? 620 :
    tier === 'ambient' ? 1100 : 420;

  return {
    kind: e.kind,
    tier,
    intensity: i,
    duration,
    className: `fx-${e.kind} fx-tier-${tier}`,
    vars: {
      '--fx-i': i.toFixed(3),
      '--fx-hue': HUE[e.kind],
      '--fx-shake': `${(i * 7).toFixed(2)}px`,
      '--fx-flash': (i * (e.kind === 'silence' ? 0 : 0.55)).toFixed(3),
      '--fx-vignette': (i * 0.7).toFixed(3),
      '--fx-dur': `${duration}ms`
    }
  };
}

/** Honour the OS setting and the reader's own switch. Motion drops, colour stays. */
export function degrade(cmd: FxCommand, reduceMotion: boolean): FxCommand {
  if (!reduceMotion) return cmd;
  return {
    ...cmd,
    tier: cmd.tier === 'screen' || cmd.tier === 'camera' ? 'ambient' : cmd.tier,
    className: `${cmd.className} fx-reduced`,
    vars: { ...cmd.vars, '--fx-shake': '0px', '--fx-flash': String(Number(cmd.vars['--fx-flash']) * 0.4) }
  };
}
