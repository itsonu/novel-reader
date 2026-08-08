// Prose -> events. Deterministic, no model at runtime.
//
// The AI annotation path in docs/visual-novel-spec.md is a PUBLISH-time step that
// writes richer events into front matter. This lexicon is the always-available floor:
// it needs no network, no key, and runs on a local folder the same as on a server.

export type FxKind =
  | 'impact' | 'explosion' | 'weather' | 'lightning'
  | 'reveal' | 'silence' | 'dread' | 'warmth';

export type FxEvent = {
  kind: FxKind;
  /** 0..1 — drives which tier of the ladder fires. See engine.ts */
  intensity: number;
  /** token index in the chapter, so the effect can fire on the narrated word */
  token: number;
  word: string;
};

type Rule = { kind: FxKind; base: number; re: RegExp };

// Ordered: first match wins for a given word.
const RULES: Rule[] = [
  { kind: 'explosion', base: 0.95, re: /\b(explod\w*|detonat\w*|erupt\w*|shattered|blast(ed)?)\b/i },
  { kind: 'lightning', base: 0.8,  re: /\b(lightning|thunder(ed|ous)?|thunderclap)\b/i },
  { kind: 'impact',    base: 0.75, re: /\b(struck|slammed|smashed|crashed?|punched|kicked|hurled|snapped|cracked|broke|slapped|stamped)\b/i },
  { kind: 'impact',    base: 0.6,  re: /\b(clang|thud|crack|bang|boom|crash|slam)\b/i },
  { kind: 'weather',   base: 0.45, re: /\b(rain(ing|ed)?|snow(ing|ed)?|storm|gale|downpour|sleet|hail)\b/i },
  { kind: 'dread',     base: 0.7,  re: /\b(scream(ed|ing)?|howl(ed|ing)?|blood|corpse|rot(ting)?|dread|terror)\b/i },
  { kind: 'silence',   base: 0.65, re: /\b(silence|silent|stopped|stillness|hush(ed)?|breathless)\b/i },
  { kind: 'reveal',    base: 0.55, re: /\b(realiz\w*|understood|suddenly|revealed|remembered|saw)\b/i },
  { kind: 'warmth',    base: 0.35, re: /\b(laugh(ed|ter)?|smiled|warm(th)?|embrace[ds]?|kissed)\b/i }
];

/** A genre nudge from front matter, so the same word reads differently per book. */
const GENRE_BIAS: Record<string, Partial<Record<FxKind, number>>> = {
  'dark-fantasy': { dread: 0.15, silence: 0.1, warmth: -0.15 },
  horror:         { dread: 0.2,  silence: 0.15, warmth: -0.2 },
  action:         { impact: 0.15, explosion: 0.1 },
  romance:        { warmth: 0.2, impact: -0.15, dread: -0.1 },
  mystery:        { reveal: 0.15, silence: 0.1 },
  fantasy:        { weather: 0.1, reveal: 0.1 }
};

/**
 * Scan tokens for events. `sentenceEnd` matters: an event lands harder when it
 * closes a sentence, which is how prose actually paces a hit.
 */
export function detect(tokens: string[], genre?: string): FxEvent[] {
  const bias = GENRE_BIAS[(genre ?? '').toLowerCase()] ?? {};
  const out: FxEvent[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    for (const rule of RULES) {
      if (!rule.re.test(raw)) continue;
      const terminal = /[.!?…]["'”’)\]]*$/.test(raw);
      const intensity = Math.max(
        0,
        Math.min(1, rule.base + (bias[rule.kind] ?? 0) + (terminal ? 0.08 : 0))
      );
      out.push({ kind: rule.kind, intensity, token: i, word: raw });
      break;
    }
  }
  return out;
}

/**
 * Thin the events so reading stays calm. The spec's rule is 90% calm / 10%
 * spectacular; this enforces it rather than trusting the prose to be sparse.
 *
 * - keeps the strongest event in any window of `minGap` tokens
 * - caps total events per chapter
 */
export function thin(events: FxEvent[], totalTokens: number, opts?: { minGap?: number; maxPerK?: number }): FxEvent[] {
  const minGap = opts?.minGap ?? 120;
  const maxPerK = opts?.maxPerK ?? 4;           // per 1000 tokens
  const budget = Math.max(1, Math.round((totalTokens / 1000) * maxPerK));

  const strongestFirst = [...events].sort((a, b) => b.intensity - a.intensity);
  const kept: FxEvent[] = [];
  for (const e of strongestFirst) {
    if (kept.length >= budget) break;
    if (kept.some(k => Math.abs(k.token - e.token) < minGap)) continue;
    kept.push(e);
  }
  return kept.sort((a, b) => a.token - b.token);
}
