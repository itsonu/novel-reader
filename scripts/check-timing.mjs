// Scheduling maths. `nextStart` decides where every clip is placed on the audio clock,
// so a mistake here is either an audible gap or two sentences playing at once.
// Run: npm run check
import assert from 'node:assert/strict';
import { nextStart, schedule, estimateDuration, weight } from '../lib/reader/timing.ts';

const LEAD = 0.08;

/* --- cold start: nothing queued, so start a hair from now --- */
assert.equal(nextStart(0, 5), 5.08, 'a fresh run starts at now + lead');
assert.equal(nextStart(0, 0), 0.08, 'a zero clock is still offset, never scheduled at 0');

/* --- the join: this is the whole feature --- */
const when = 5, dur = 3.67;
assert.equal(nextStart(when + dur, 6), when + dur,
  'while the previous clip is still sounding, the next one starts exactly where it ends');
assert.equal(nextStart(when + dur, when + dur - 0.006), when + dur,
  'the join holds while more than the epsilon of audio is left to play');
assert.equal(nextStart(when + dur, when + dur - 0.001), when + dur - 0.001 + LEAD,
  'inside the epsilon the clip counts as spent — 1ms of tail is not worth joining to');

// Chained: three clips butt up with no drift and no accumulation.
let cursor = 0, t = 10;
const starts = [];
for (const d of [3.67, 1.2, 4.4]) {
  const w = nextStart(cursor, t, LEAD);
  starts.push(w);
  cursor = w + d;
  t += d;                                    // the play head keeps pace
}
assert.equal(starts[0], 10.08);
assert.equal(starts[1], 10.08 + 3.67, 'clip 2 joins clip 1');
assert.equal(starts[2], 10.08 + 3.67 + 1.2, 'clip 3 joins clip 2, error does not accumulate');

/* --- falling behind: degrade to a fresh start, never schedule in the past --- */
assert.equal(nextStart(3, 10), 10.08, 'a cursor in the past is abandoned, not honoured');
assert.ok(nextStart(3, 10) > 10, 'never returns a time that has already gone');
assert.equal(nextStart(10.004, 10), 10.08,
  'a cursor within the epsilon counts as spent — a 4ms tail is not a join worth keeping');
assert.equal(nextStart(10.006, 10), 10.006, 'just past the epsilon, it is a real join');

/* --- rate: duration shrinks, joins still land --- */
const raw = 4;
for (const rate of [0.5, 1, 1.5, 2]) {
  const d = raw / rate;
  assert.equal(nextStart(2 + d, 2), 2 + d, `join holds at rate ${rate}`);
}

/* --- absolutised cues stay sorted across a clip boundary ---
   The cue loop drains one queue in order, so a later clip must never push a cue that
   sorts before an earlier one. */
const toks1 = ['The', 'lamps', 'went', 'out.'];
const toks2 = ['She', 'lit', 'them', 'again.'];
const d1 = estimateDuration(toks1);
const w1 = nextStart(0, 0, LEAD);
const w2 = nextStart(w1 + d1, w1, LEAD);
assert.equal(w2, w1 + d1, 'second clip joins the first');

const abs = [
  ...schedule(toks1, 0, d1).map(c => w1 + c.start),
  ...schedule(toks2, toks1.length, estimateDuration(toks2)).map(c => w2 + c.start)
];
for (let i = 1; i < abs.length; i++)
  assert.ok(abs[i] >= abs[i - 1], `cue ${i} must not sort before cue ${i - 1}`);
assert.ok(abs[0] >= w1, 'the first cue is not before its own clip');
assert.ok(abs[abs.length - 1] < w2 + estimateDuration(toks2), 'the last cue lands inside its clip');

/* --- the estimator still behaves (it feeds every Web Speech `when`) --- */
assert.ok(estimateDuration(toks1) > 0);
assert.ok(estimateDuration(toks1, 2) < estimateDuration(toks1), 'faster rate, shorter clip');
assert.ok(weight('out.') > weight('out'), 'a sentence end holds longer than a bare word');
assert.equal(schedule([], 0, 1).length, 0, 'an empty sentence schedules nothing');

console.log('scheduling maths: all checks passed');
