// Two VoiceProviders. Web Speech is instant; Kokoro is better and lazy-loaded.
// Verified: Kokoro cold-load 30s on WebGPU/fp32, synth RTF 0.86 (3.17s of compute for
// 3.67s of audio) — a 14% margin, and worse on the WASM fallback. That margin is why
// the player banks a reserve of audio ahead of the play head rather than synthesising
// one sentence at a time.
//
// A provider hands back a *Clip*: audio that exists but has not been placed on the
// clock yet. The player decides when it starts. That split is what makes playback
// gapless — consecutive clips are scheduled to butt up against each other, instead of
// each one starting "now" after the previous one's `onended` has round-tripped through
// a promise and a React render.

import { schedule, estimateDuration, weight, type Cue } from './timing';
import type { Req, Res } from './tts.worker';

export type SpeakHandle = {
  cues: Cue[];
  ended: Promise<void>;
  duration: number;
  /** Web Speech only: real word boundaries, which beat the estimator. */
  onBoundary?: ((i: number) => void) | null;
  /** Web Speech only: fired when the utterance actually begins, so the player can
   *  re-anchor its queue against the drift between estimate and reality. */
  onStart?: (() => void) | null;
};

/** Audio that is ready, but not yet placed on the provider's clock. */
export type Clip = {
  /** Seconds, at the rate in force when it is read — so a cached clip survives a
   *  rate change instead of reporting a stale length. */
  readonly duration: number;
  /** Set when the request was cancelled in flight. There is nothing to play, and the
   *  caller must not keep it — a cached silence would never re-synthesise. */
  readonly cancelled?: true;
  /** `when` is absolute, in the provider's own clock (see `now()`). */
  start(when: number): SpeakHandle;
};

export interface VoiceProvider {
  readonly kind: 'kokoro' | 'system';
  rate: number;
  voiceId: string | null;
  listVoices(): string[];
  /** The clock `when` is expressed in. Kokoro: AudioContext.currentTime. */
  now(): number;
  /** Resolve once it is safe to schedule — an AudioContext may start suspended,
   *  and a suspended context has currentTime frozen at 0. */
  ready(): Promise<void>;
  /** Synthesise (or, for Web Speech, just describe) one sentence. */
  prepare(text: string, tokens: string[], offset: number): Promise<Clip>;
  pause(): void;
  resume(): void;
  stop(): void;
}

/* ---------------- Web Speech ---------------- */

export class SystemVoice implements VoiceProvider {
  readonly kind = 'system';
  rate = 1;
  voiceId: string | null = null;
  /** Wall clock, minus time spent paused. speechSynthesis has no clock of its own,
   *  and a plain performance.now() would keep running through a pause — which is
   *  what used to make the highlight race ahead of a paused voice. */
  private pausedMs = 0;
  private pausedAt = 0;

  static available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
  listVoices() {
    return speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')).map(v => v.voiceURI);
  }

  now() {
    const paused = this.pausedAt ? performance.now() - this.pausedAt : 0;
    return (performance.now() - this.pausedMs - paused) / 1000;
  }
  async ready() { /* nothing to unsuspend */ }

  async prepare(text: string, tokens: string[], offset: number): Promise<Clip> {
    const self = this;
    return {
      get duration() { return estimateDuration(tokens, self.rate); },
      // `when` is advisory here: speechSynthesis is itself a queue, so ordering is its
      // job. Queuing ahead is still the win — it removes the engine's start-up latency
      // from the gap between sentences.
      start(_when: number): SpeakHandle {
        const u = new SpeechSynthesisUtterance(text);
        const v = speechSynthesis.getVoices().find(x => x.voiceURI === self.voiceId);
        if (v) u.voice = v;
        u.rate = self.rate;

        const duration = estimateDuration(tokens, self.rate);
        const cues = schedule(tokens, offset, duration);

        // char offset -> local token index, for boundary events
        const bounds: number[] = [];
        let pos = 0;
        for (const t of tokens) { bounds.push(pos); pos += t.length + 1; }

        let onCue: ((i: number) => void) | null = null;
        let onBegin: (() => void) | null = null;
        u.onboundary = e => {
          if (e.name && e.name !== 'word') return;
          let k = 0;
          while (k + 1 < bounds.length && bounds[k + 1] <= e.charIndex) k++;
          onCue?.(offset + k);
        };
        u.onstart = () => onBegin?.();

        const ended = new Promise<void>(resolve => {
          u.onend = () => resolve();
          u.onerror = () => resolve();
        });
        speechSynthesis.speak(u);

        return {
          cues,
          duration,
          ended,
          get onBoundary() { return onCue; },
          set onBoundary(fn: ((i: number) => void) | null) { onCue = fn; },
          get onStart() { return onBegin; },
          set onStart(fn: (() => void) | null) { onBegin = fn; }
        };
      }
    };
  }

  pause() { this.pausedAt = performance.now(); speechSynthesis.pause(); }
  resume() {
    if (this.pausedAt) { this.pausedMs += performance.now() - this.pausedAt; this.pausedAt = 0; }
    speechSynthesis.resume();
  }
  stop() { speechSynthesis.cancel(); }
}

/* ---------------- Kokoro ---------------- */

/** Resolved into a pending request when the player aborts. Deliberately not a
 *  rejection: usePlayer treats a rejected prepare as "the voice failed" and falls back
 *  to Web Speech, so a rejecting cancel would silently lose the good voice on every seek. */
type Cancelled = { t: 'cancelled' };
type Reply = Res | Cancelled;

/* One worker per tab. `load()` can be called twice concurrently — the silent restore on
   a return visit races the upgrade button — and an 80MB session is not something to
   build twice, so the promise is memoised. */
let worker: Worker | null = null;
let loading: Promise<KokoroVoice> | null = null;
let seq = 0;
const pending = new Map<number, { kind: Req['t']; resolve: (r: Reply) => void }>();
/* Last writer wins on purpose: the silent restore passes a no-op and the upgrade button
   passes the progress bar, and the button is the one the reader can see. */
let progress: (pct: number | null, file?: string) => void = () => {};

function spawn(): Worker {
  if (worker) return worker;
  // `type: 'module'` is required: webpack's import.meta.url shim for a classic worker
  // emits document.baseURI, and `document` is undeclared in worker scope.
  // The name must not begin "em-pthread" — emscripten uses that prefix to spot its own.
  const w = new Worker(new URL('./tts.worker.ts', import.meta.url), {
    type: 'module',
    name: 'kokoro'
  });
  w.onmessage = (e: MessageEvent<Res>) => {
    const m = e.data;
    if (m.t === 'progress') { progress(m.pct, m.file); return; }
    const job = pending.get(m.id);
    if (!job) return;             // cancelled while in flight — drop the orphan
    pending.delete(m.id);
    job.resolve(m);
  };
  const die = () => {
    for (const job of pending.values()) job.resolve({ t: 'error', id: -1, message: 'voice worker stopped' });
    pending.clear();
    worker = null;
    loading = null;
  };
  w.onerror = die;
  w.onmessageerror = die;
  worker = w;
  return w;
}

/** Omit<> over a union collapses it to the shared keys, which would lose `gpu` and
 *  `text`. The conditional distributes, so each request shape keeps its own fields. */
type Unsent<T> = T extends { id: number } ? Omit<T, 'id'> : never;

function ask(req: Unsent<Req>): Promise<Reply> {
  const id = ++seq;
  return new Promise<Reply>(resolve => {
    pending.set(id, { kind: req.t, resolve });
    spawn().postMessage({ ...req, id } as Req);
  });
}

/** A clip that occupies no time. Handed back when a request was cancelled, so the
 *  stale playback loop schedules nothing and exits on its own abort check. */
const SILENT: Clip = {
  duration: 0,
  cancelled: true,
  start: () => ({ duration: 0, cues: [], ended: Promise.resolve() })
};

export class KokoroVoice implements VoiceProvider {
  readonly kind = 'kokoro';
  rate = 1;
  voiceId: string | null = 'af_heart';
  private ctx: AudioContext;
  /* Every source that has been scheduled and not yet finished. This used to be a single
     `src`, which was correct only while exactly one sentence was ever in flight. With a
     queue scheduled ahead, stop() must cancel all of them or a seek plays two sentences
     on top of each other. Stopping a source whose `when` has not arrived cancels it. */
  private live = new Set<AudioBufferSourceNode>();

  private constructor(private voices: string[]) {
    this.ctx = new AudioContext();
  }

  static load(onProgress: (pct: number | null, file?: string) => void) {
    progress = onProgress;
    return (loading ??= (async () => {
      try {
        // Probed on the main thread and passed in, so the worker doesn't repeat it.
        const gpu =
          typeof navigator !== 'undefined' && 'gpu' in navigator &&
          !!(await (navigator as any).gpu.requestAdapter().catch(() => null));
        const r = await ask({ t: 'load', gpu });
        if (r.t !== 'ready') throw new Error(r.t === 'error' ? r.message : 'voice model cancelled');
        return new KokoroVoice(r.voices);
      } catch (e) {
        loading = null;           // let a later attempt try again
        throw e;
      }
    })());
  }

  listVoices() { return this.voices; }

  now() { return this.ctx.currentTime; }
  async ready() { if (this.ctx.state !== 'running') await this.ctx.resume(); }

  async prepare(text: string, tokens: string[], offset: number): Promise<Clip> {
    const r = await ask({ t: 'gen', text, voice: this.voiceId ?? 'af_heart' });
    if (r.t === 'cancelled') return SILENT;
    if (r.t !== 'audio') throw new Error(r.t === 'error' ? r.message : 'voice produced no audio');

    const buf = this.ctx.createBuffer(1, r.pcm.length, r.rate);
    // .set() rather than copyToChannel(): identical work, and it sidesteps TypeScript's
    // ArrayBuffer-vs-ArrayBufferLike split on typed arrays that crossed postMessage.
    buf.getChannelData(0).set(r.pcm);
    const self = this;

    return {
      // Read late, so a cached clip reports its length at the *current* rate.
      get duration() { return buf.duration / self.rate; },
      start(when: number): SpeakHandle {
        const src = self.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = self.rate;
        src.connect(self.ctx.destination);
        src.start(when);                       // scheduled, not "now" — this is the gapless bit
        self.live.add(src);
        const duration = buf.duration / self.rate;
        return {
          duration,
          cues: schedule(tokens, offset, duration),
          ended: new Promise<void>(resolve => {
            src.onended = () => { self.live.delete(src); resolve(); };
          })
        };
      }
    };
  }

  pause() { void this.ctx.suspend(); }
  resume() { void this.ctx.resume(); }
  stop() {
    for (const src of this.live) { try { src.stop(); } catch { /* already done */ } }
    this.live.clear();
    void this.ctx.resume();
    worker?.postMessage({ t: 'cancel' } as Req);
    // Only synthesis is abandoned. Cancelling an in-flight model load would leave the
    // reader on the system voice because someone pressed stop during the download.
    for (const [id, job] of pending) {
      if (job.kind !== 'gen') continue;
      pending.delete(id);
      job.resolve({ t: 'cancelled' });
    }
  }
}

export { weight };
