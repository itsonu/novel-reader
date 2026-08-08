// Word-timing estimator. Calibrated against real SpeechSynthesis boundary events:
// mean error 145–313ms per sentence, worst 705ms in dialogue. Resyncs every sentence,
// so error never accumulates. The quote bonuses below cut mean error 403ms -> 360ms.

export function syllables(w: string): number {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.length > 2 && /[^aeiouy]e$/.test(w)) n--;
  return Math.max(1, n);
}

/** Relative duration weight for one token. */
export function weight(t: string): number {
  const letters = (t.match(/[a-z'’]/gi) || []).length;
  let w = 0.6 * letters + 1.4 * syllables(t);
  if (/[,;:—–]["'”’)\]]*$/.test(t)) w += 2.5;
  if (/[.!?…]["'”’)\]]*$/.test(t)) w += 4.5;
  // ponytail: calibration knob — refit per provider if one paces dialogue differently.
  if (/["”]$/.test(t)) w += 4;
  if (/^["“]/.test(t)) w += 2;
  return Math.max(1.5, w);
}

export type Cue = { i: number; start: number; end: number };

/** Spread a KNOWN audio duration across tokens by weight. Exact by construction. */
export function schedule(tokens: string[], offset: number, duration: number): Cue[] {
  const ws = tokens.map(weight);
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  const cues: Cue[] = [];
  let t = 0;
  for (let k = 0; k < ws.length; k++) {
    const d = duration * (ws[k] / total);
    cues.push({ i: offset + k, start: t, end: t + d });
    t += d;
  }
  return cues;
}

/** Guess a duration when none is known (Web Speech without boundary events). */
export const estimateDuration = (tokens: string[], rate = 1) =>
  (tokens.reduce((s, t) => s + weight(t), 0) * 0.0135) / rate;

/**
 * When the next clip should start, in provider-clock seconds.
 *
 * `cursor` is where the queued audio currently ends. While synthesis keeps up, the next
 * clip is placed exactly there and the two buffers join sample-accurately — that join is
 * the whole reason narration sounds continuous. If synthesis has fallen behind, `cursor`
 * is already in the past and there is nothing to join to, so start a hair from now
 * instead: `lead` keeps it off a `when` that has already gone, which would otherwise
 * play immediately and overlap whatever is still sounding.
 *
 * The epsilon stops a cursor a few microseconds ahead of the clock — the tail of a clip
 * that is effectively over — from being treated as a real join.
 */
export const nextStart = (cursor: number, now: number, lead = 0.08) =>
  cursor > now + 0.005 ? cursor : now + lead;
