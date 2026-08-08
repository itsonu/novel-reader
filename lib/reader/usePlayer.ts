'use client';
// Transport, buffering and cue scheduling.
//
// The engine banks a reserve of synthesised audio ahead of the play head and schedules
// each clip against the provider's own clock, so consecutive sentences butt up against
// each other. It used to synthesise exactly one sentence ahead and start each one with
// a bare src.start() after the previous sentence's `onended` had round-tripped through
// two promises and a React render — which is why every paragraph break had a hole in it.
//
// Three invariants hold this together:
//   * `cursor` is the clock time the next clip begins. Clips are scheduled at `cursor`,
//     never at "now", so joins are sample-accurate.
//   * `state.sentence` follows the *audible* sentence, not the scheduled one. Without
//     that the scrubber and the resume point would lead the voice by several sentences.
//   * cue times in `cueQ` are absolute and monotonic, drained by ONE rAF loop. A loop
//     per sentence cannot express two sentences being scheduled at once.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { wrapWords, groupSentences, sentenceText, sentenceTokens, type Token, type Sentence } from './tokenize';
import { KokoroVoice, SystemVoice, type Clip, type SpeakHandle, type VoiceProvider } from './providers';
import { weight as tokenWeight, nextStart } from './timing';

export type PlayerState = {
  ready: boolean;
  playing: boolean;
  paused: boolean;
  kind: 'system' | 'kokoro';
  spoken: number;          // token index, -1 = none
  sentence: number;
  sentences: number;
  loadPct: number | null;  // kokoro download
  loadFile: string;
  status: string;
  /** 0..1 while banking the opening reserve, null once playing. */
  buffering: number | null;
};

/** Never schedule in the past: a clip placed at a `when` already gone plays immediately. */
const LEAD = 0.08;
/** Seconds of audio banked before the first word. Cached clips resolve instantly, so
 *  seeking back into already-heard text skips this entirely. */
const PREROLL = 8;
/** How far ahead of the play head to keep synthesising. Time-bounded, not count-bounded:
 *  a 45-token sentence and a three-word one are not the same amount of buffer. */
const LOOKAHEAD = { kokoro: 8, system: 3 };
/** Cached clips. ~350KB per sentence buffer, so this caps at roughly 14MB. */
const CACHE_MAX = 40;

export function usePlayer(proseRef: React.RefObject<HTMLElement>, deps: unknown[]) {
  const tokens = useRef<Token[]>([]);
  const sents = useRef<Sentence[]>([]);
  const provider = useRef<VoiceProvider | null>(null);
  const raf = useRef(0);
  const abort = useRef(0);
  const userScroll = useRef(0);
  const boundaries = useRef(false);      // does this engine emit word boundaries?

  /* Prefix sum of token weights, built once per chapter. `timing()` is called on every
     Player render and mark() re-renders per word, so an O(all tokens) scan there was
     ~2300 iterations per spoken word — on the same thread as speech synthesis. */
  const cum = useRef<Float64Array>(new Float64Array(1));

  const cache = useRef(new Map<number, Promise<Clip>>());
  const cueQ = useRef<{ i: number; at: number }[]>([]);
  const cueHead = useRef(0);
  const sentQ = useRef<{ sent: number; at: number }[]>([]);
  const sentHead = useRef(0);
  const cursor = useRef(0);
  /** Estimated cues are held back briefly in case a real boundary event beats them. */
  const holdUntil = useRef(0);

  const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const [s, set] = useState<PlayerState>({
    ready: false, playing: false, paused: false, kind: 'system',
    spoken: -1, sentence: 0, sentences: 0, loadPct: null, loadFile: '', status: '',
    buffering: null
  });
  const patch = (p: Partial<PlayerState>) => set(x => ({ ...x, ...p }));

  /* Mirror of state for event handlers.
     Transport used to read state inside a set() updater and call playFrom() from
     there — an impure reducer. React can run an updater more than once, so the
     first tap fired playFrom twice and the toggle needed two or three presses to
     land. Handlers read this ref instead; setState stays pure. */
  const live = useRef(s);
  live.current = s;

  const resetQueues = () => {
    cueQ.current.length = 0; cueHead.current = 0;
    sentQ.current.length = 0; sentHead.current = 0;
    cursor.current = 0;
  };

  /* Tokenise once per chapter, before paint.
     Keyed on the rendered HTML — that's what determines the DOM we're wrapping.
     Layout effect so the spans exist before the first frame the reader sees. */
  useLayoutEffect(() => {
    const root = proseRef.current;
    if (!root) return;
    abort.current++;                  // any in-flight playback points at dead nodes
    cancelAnimationFrame(raf.current);
    provider.current?.stop();
    tokens.current = wrapWords(root);
    sents.current = groupSentences(tokens.current);

    const c = new Float64Array(tokens.current.length + 1);
    for (let i = 0; i < tokens.current.length; i++)
      c[i + 1] = c[i] + tokenWeight(tokens.current[i].text) * 0.0135;
    cum.current = c;

    // Cached clips are keyed by sentence index, which now means something else.
    cache.current.clear();
    resetQueues();
    patch({
      ready: tokens.current.length > 0,
      playing: false, paused: false,
      sentence: 0, spoken: -1, buffering: null,
      sentences: sents.current.length
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /* default provider: instant, no download */
  useEffect(() => {
    if (!SystemVoice.available()) { patch({ status: 'no speech support' }); return; }
    const p = new SystemVoice();
    provider.current = p;
    const refresh = () => setVoiceIds(p.listVoices());
    refresh();
    speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  /* ---- highlighting ---- */
  const mark = useCallback((i: number) => {
    const prev = document.querySelector('.w.is-spoken');
    if (prev) { prev.classList.remove('is-spoken'); prev.classList.add('is-said'); }
    const el = tokens.current[i]?.el;
    if (!el) return;
    el.classList.add('is-spoken');
    patch({ spoken: i });
    // auto-scroll that yields to a reader who scrolls by hand
    if (Date.now() - userScroll.current < 4000) return;
    const r = el.getBoundingClientRect();
    const mid = window.innerHeight * 0.4;
    if (Math.abs(r.top - mid) > window.innerHeight * 0.22)
      window.scrollBy({ top: r.top - mid, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onScroll = () => { userScroll.current = Date.now(); };
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
    };
  }, []);

  /* Sentences advance when the AUDIO reaches them, not when they were queued.
     Deliberately NOT on requestAnimationFrame: rAF is paused outright in a hidden tab,
     and listening with the tab in the background is the whole point of this app. If
     this froze there, pausing from another tab would resume from a stale sentence and
     replay audio the reader had already heard. Called from the rAF loop and from the
     buffering poll, whichever runs. */
  const drainSentences = useCallback(() => {
    const p = provider.current;
    if (!p) return;
    const t = p.now();
    while (sentHead.current < sentQ.current.length && sentQ.current[sentHead.current].at <= t) {
      const m = sentQ.current[sentHead.current++];
      patch({ sentence: m.sent, status: p.kind });
    }
  }, []);

  /* The highlight, on the other hand, belongs on rAF — there is nothing to highlight
     when the page isn't being painted, and it catches up in one tick on return. */
  const startCueLoop = useCallback((run: number) => {
    cancelAnimationFrame(raf.current);
    const tick = () => {
      if (run !== abort.current) return;
      const p = provider.current;
      if (!p) return;
      drainSentences();
      // Estimates wait a beat in case this engine turns out to emit real boundaries.
      // The hold gates CONSUMPTION, not the push — a delayed push would land after the
      // next clip's cues and break the queue's sort order.
      if (boundaries.current || performance.now() >= holdUntil.current) {
        const t = p.now();
        while (cueHead.current < cueQ.current.length && cueQ.current[cueHead.current].at <= t)
          mark(cueQ.current[cueHead.current++].i);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [mark, drainSentences]);

  /* ---- transport ---- */
  const stop = useCallback(() => {
    abort.current++;
    cancelAnimationFrame(raf.current);
    provider.current?.stop();
    resetQueues();
    document.querySelectorAll('.w.is-spoken').forEach(e => e.classList.remove('is-spoken'));
    patch({ playing: false, paused: false, buffering: null });
  }, []);

  /** Synthesised audio for sentence n, from cache when we already have it. */
  const clipFor = useCallback((n: number): Promise<Clip> => {
    let c = cache.current.get(n);
    if (!c) {
      const p = provider.current!;
      const sent = sents.current[n];
      c = p
        .prepare(sentenceText(tokens.current, sent), sentenceTokens(tokens.current, sent), sent[0])
        .then(clip => {
          // A request abandoned by stop() resolves to silence. Keeping that in the cache
          // would mean this sentence stayed silent for the rest of the chapter.
          if (clip.cancelled) cache.current.delete(n);
          return clip;
        });
      cache.current.set(n, c);
      // ponytail: insertion-order eviction, not true LRU. Swap it if heavy scrubbing
      // turns out to thrash the oldest entries.
      if (cache.current.size > CACHE_MAX)
        cache.current.delete(cache.current.keys().next().value!);
    }
    return c;
  }, []);

  const playFrom = useCallback(async (index: number) => {
    const p = provider.current;
    if (!p || !sents.current.length) return;
    abort.current++;
    const run = abort.current;
    cancelAnimationFrame(raf.current);
    p.stop();
    resetQueues();
    patch({ playing: true, paused: false, sentence: index, status: p.kind === 'kokoro' ? 'buffering…' : '' });

    // A suspended AudioContext has currentTime frozen at 0, so every `when` computed
    // against it would fire at once on resume. Unsuspend before reading the clock.
    await p.ready();
    if (run !== abort.current) return;

    const total = sents.current.length;
    const fail = (): void => {
      patch({ status: 'voice failed — falling back', buffering: null });
      provider.current = new SystemVoice();
      cache.current.clear();
      void playFrom(index);
    };

    /* Pre-roll: bank a reserve before the first word rather than starting on a single
       sentence and hoping synthesis keeps up. Only Kokoro needs it — Web Speech resolves
       instantly and queues internally. */
    const preloaded: Clip[] = [];
    if (p.kind === 'kokoro') {
      let banked = 0;
      for (let n = index; n < total && banked < PREROLL; n++) {
        let clip: Clip;
        try { clip = await clipFor(n); } catch { return fail(); }
        if (run !== abort.current) return;
        preloaded.push(clip);
        banked += clip.duration;
        patch({ buffering: Math.min(1, banked / PREROLL) });
      }
    }
    patch({ buffering: null });
    if (run !== abort.current) return;

    startCueLoop(run);
    holdUntil.current = performance.now() + 250;
    const ahead = LOOKAHEAD[p.kind];

    let last: SpeakHandle | null = null;
    for (let i = index; i < total; i++) {
      let clip: Clip;
      try { clip = preloaded[i - index] ?? (await clipFor(i)); } catch { return fail(); }
      if (run !== abort.current) return;

      const when = nextStart(cursor.current, p.now(), LEAD);
      const h = clip.start(when);
      cursor.current = when + h.duration;
      last = h;

      sentQ.current.push({ sent: i, at: when });

      if ('onBoundary' in h && h.onBoundary !== undefined) {
        h.onBoundary = (idx: number) => {
          if (run !== abort.current) return;
          // Real boundaries are ground truth. Once we know this engine emits them,
          // drop every estimate we were holding and never estimate again.
          if (!boundaries.current) { boundaries.current = true; cueQ.current.length = 0; cueHead.current = 0; }
          mark(idx);
        };
        h.onStart = () => {
          // Web Speech has no clock of its own, so `when` was a guess. Re-anchor the
          // unconsumed queue by however far the guess missed — this restores the
          // per-sentence resync that pre-scheduling would otherwise accumulate away.
          if (run !== abort.current) return;
          const drift = p.now() - when;
          if (Math.abs(drift) < 0.02) return;
          for (let k = cueHead.current; k < cueQ.current.length; k++) cueQ.current[k].at += drift;
          for (let k = sentHead.current; k < sentQ.current.length; k++) sentQ.current[k].at += drift;
          cursor.current += drift;
        };
        if (!boundaries.current) pushCues(h.cues, when);
      } else {
        pushCues(h.cues, when);   // Kokoro: exact duration, no boundaries, no race
      }

      // Wait until the play head is within `ahead` seconds of the end of what's queued,
      // then synthesise the next one. This is the whole buffering behaviour.
      await until(cursor.current - ahead, run);
      if (run !== abort.current) return;
    }

    await last?.ended;
    if (run !== abort.current) return;
    patch({ playing: false, spoken: -1 });
    document.querySelectorAll('.w.is-spoken').forEach(e => e.classList.remove('is-spoken'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark, clipFor, startCueLoop]);

  /** Absolute cue times, so one loop can hold several sentences at once. */
  const pushCues = (cues: { i: number; start: number }[], when: number) => {
    for (const c of cues) cueQ.current.push({ i: c.i, at: when + c.start });
  };

  /** Sleep until the provider clock reaches `t`. Polls rather than sleeping the whole
   *  way so a pause — which freezes AudioContext.currentTime — can't over-buffer, and
   *  so an abort is noticed promptly. */
  const until = (t: number, run: number) =>
    new Promise<void>(resolve => {
      const step = () => {
        const p = provider.current;
        if (!p || run !== abort.current) return resolve();
        drainSentences();          // timers survive a hidden tab; rAF does not
        const d = t - p.now();
        if (d <= 0) return resolve();
        setTimeout(step, Math.min(d * 1000, 250));
      };
      step();
    });

  const toggle = useCallback(() => {
    const p = provider.current;
    if (!p) return;
    const cur = live.current;
    if (!cur.playing) {
      void playFrom(cur.sentence >= sents.current.length ? 0 : cur.sentence);
      return;
    }
    if (cur.paused) { p.resume(); patch({ paused: false }); }
    else { p.pause(); patch({ paused: true }); }
  }, [playFrom]);

  const jump = useCallback((dir: 1 | -1) => {
    const cur = live.current;
    const here = tokens.current[sents.current[cur.sentence]?.[0]]?.block;
    let i = cur.sentence;
    while (i >= 0 && i < sents.current.length && tokens.current[sents.current[i][0]].block === here) i += dir;
    i = Math.max(0, Math.min(sents.current.length - 1, i));
    patch({ sentence: i });
    if (cur.playing) void playFrom(i);
    else mark(sents.current[i][0]);
  }, [playFrom, mark]);

  /** Click any word to start reading from its sentence. */
  const seekToToken = useCallback((tokenIndex: number) => {
    const i = sents.current.findIndex(([a, b]) => tokenIndex >= a && tokenIndex <= b);
    if (i >= 0) void playFrom(i);
  }, [playFrom]);

  /** Scrub: 0..1 across the chapter. Used by the progress bar. */
  const seekToFraction = useCallback((f: number) => {
    const n = sents.current.length;
    if (!n) return;
    const i = Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
    patch({ sentence: i });
    if (live.current.playing) void playFrom(i);
    else mark(sents.current[i][0]);
  }, [playFrom, mark]);

  /** Spoken-time estimates, so the UI can show 3:42 / 12:10 like a media player. */
  const timing = useCallback(() => {
    const c = cum.current;
    if (c.length < 2) return { elapsed: 0, total: 0 };
    const upto = sents.current[s.sentence]?.[0] ?? 0;
    const rate = provider.current?.rate || 1;
    return { elapsed: c[Math.min(upto, c.length - 1)] / rate, total: c[c.length - 1] / rate };
  }, [s.sentence]);

  /* Rate is applied at playback, so cached audio stays valid — but everything already
     scheduled assumed the old rate, so the current sentence restarts. The cache makes
     that instant. */
  const setRate = useCallback((r: number) => {
    if (!provider.current) return;
    provider.current.rate = r;
    if (live.current.playing) void playFrom(live.current.sentence);
  }, [playFrom]);

  /* A different voice invalidates every synthesised clip. */
  const setVoice = useCallback((id: string) => {
    if (!provider.current) return;
    provider.current.voiceId = id;
    cache.current.clear();
    if (live.current.playing) void playFrom(live.current.sentence);
  }, [playFrom]);

  /* The weights are already in the HTTP/service-worker cache after a first download,
     so a return visit can load them without a progress bar. Remember that we got
     them, and bring the good voice back automatically. */
  useEffect(() => {
    if (localStorage.getItem('nr:kokoro') !== '1') return;
    let cancelled = false;
    (async () => {
      try {
        const k = await KokoroVoice.load(() => {});
        if (cancelled) return;
        k.rate = provider.current?.rate ?? 1;
        provider.current = k;
        cache.current.clear();
        setVoiceIds(k.listVoices());
        patch({ kind: 'kokoro', status: 'kokoro ready' });
      } catch { /* stay on the system voice */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const upgradeVoice = useCallback(async () => {
    patch({ loadPct: 0, status: 'loading voice model' });
    try {
      const k = await KokoroVoice.load((pct, file) => patch({ loadPct: pct, loadFile: file ?? '' }));
      k.rate = provider.current?.rate ?? 1;
      const wasPlaying = s.playing;
      stop();
      provider.current = k;
      cache.current.clear();
      setVoiceIds(k.listVoices());
      localStorage.setItem('nr:kokoro', '1');
      patch({ kind: 'kokoro', loadPct: null, status: 'kokoro ready' });
      if (wasPlaying) void playFrom(s.sentence);
    } catch (e: any) {
      patch({ loadPct: null, status: 'voice model failed: ' + e.message });
    }
  }, [s.playing, s.sentence, playFrom, stop]);

  return {
    state: s, voiceIds, toggle, stop, jump, seekToToken, seekToFraction, timing,
    setRate, setVoice, upgradeVoice
  };
}
