'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { wrapWords, groupSentences, sentenceText, sentenceTokens, type Token, type Sentence } from './tokenize';
import { KokoroVoice, SystemVoice, type VoiceProvider } from './providers';
import { weight as tokenWeight } from './timing';

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
};

export function usePlayer(proseRef: React.RefObject<HTMLElement>, deps: unknown[]) {
  const tokens = useRef<Token[]>([]);
  const sents = useRef<Sentence[]>([]);
  const provider = useRef<VoiceProvider | null>(null);
  const raf = useRef(0);
  const abort = useRef(0);
  const userScroll = useRef(0);
  const boundaries = useRef(false);      // does this engine emit word boundaries?
  const estimateTimer = useRef(0);
  const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const [s, set] = useState<PlayerState>({
    ready: false, playing: false, paused: false, kind: 'system',
    spoken: -1, sentence: 0, sentences: 0, loadPct: null, loadFile: '', status: ''
  });
  const patch = (p: Partial<PlayerState>) => set(x => ({ ...x, ...p }));

  /* Mirror of state for event handlers.
     Transport used to read state inside a set() updater and call playFrom() from
     there — an impure reducer. React can run an updater more than once, so the
     first tap fired playFrom twice and the toggle needed two or three presses to
     land. Handlers read this ref instead; setState stays pure. */
  const live = useRef(s);
  live.current = s;

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
    patch({
      ready: tokens.current.length > 0,
      playing: false, paused: false,
      sentence: 0, spoken: -1,
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

  const runCues = (cues: { i: number; start: number }[]) => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    let k = 0;
    const tick = () => {
      const el = (performance.now() - t0) / 1000;
      while (k < cues.length && el >= cues[k].start) { mark(cues[k].i); k++; }
      if (k < cues.length) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  /* ---- transport ---- */
  const stop = useCallback(() => {
    abort.current++;
    cancelAnimationFrame(raf.current);
    provider.current?.stop();
    document.querySelectorAll('.w.is-spoken').forEach(e => e.classList.remove('is-spoken'));
    patch({ playing: false, paused: false });
  }, []);

  const playFrom = useCallback(async (index: number) => {
    const p = provider.current;
    if (!p || !sents.current.length) return;
    abort.current++;
    const run = abort.current;
    cancelAnimationFrame(raf.current);
    p.stop();
    patch({ playing: true, paused: false, sentence: index, status: p.kind === 'kokoro' ? 'synthesizing…' : '' });

    let i = index;
    const build = (n: number) => {
      const sent = sents.current[n];
      return p.prepare(sentenceText(tokens.current, sent), sentenceTokens(tokens.current, sent), sent[0]);
    };

    let next = build(i);
    while (i < sents.current.length) {
      let start: Awaited<ReturnType<typeof build>>;
      try { start = await next; }
      catch { patch({ status: 'voice failed — falling back' }); provider.current = new SystemVoice(); return playFrom(i); }
      if (run !== abort.current) return;

      patch({ sentence: i, status: p.kind });
      if (i + 1 < sents.current.length) next = build(i + 1);   // one-ahead pipeline

      const handle = start() as any;

      /* Boundary events, where the engine emits them, are ground truth — the estimator
         is only a stand-in. Running both makes the highlight jump backwards when a
         boundary lands on a word the estimate already passed. So: learn once whether
         this engine emits boundaries, then never estimate again on it. Until we know,
         hold the estimates back briefly and drop them if a boundary beats them. */
      if ('onBoundary' in handle) {
        handle.onBoundary = (idx: number) => {
          if (!boundaries.current) {
            boundaries.current = true;
            clearTimeout(estimateTimer.current);
            cancelAnimationFrame(raf.current);
          }
          mark(idx);
        };
        if (boundaries.current) {
          // known good — no estimates at all
        } else {
          clearTimeout(estimateTimer.current);
          estimateTimer.current = window.setTimeout(() => runCues(handle.cues), 250);
        }
      } else {
        runCues(handle.cues);   // Kokoro: exact duration, no boundaries, no race
      }
      await handle.ended;
      if (run !== abort.current) return;
      i++;
    }
    patch({ playing: false, spoken: -1 });
    document.querySelectorAll('.w.is-spoken').forEach(e => e.classList.remove('is-spoken'));
  }, [mark]);

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
    const toks = tokens.current;
    if (!toks.length) return { elapsed: 0, total: 0 };
    const upto = sents.current[s.sentence]?.[0] ?? 0;
    let elapsed = 0, total = 0;
    for (let i = 0; i < toks.length; i++) {
      const w = tokenWeight(toks[i].text) * 0.0135;
      total += w;
      if (i < upto) elapsed += w;
    }
    const rate = provider.current?.rate || 1;
    return { elapsed: elapsed / rate, total: total / rate };
  }, [s.sentence]);

  const setRate = useCallback((r: number) => {
    if (provider.current) provider.current.rate = r;
  }, []);

  const setVoice = useCallback((id: string) => {
    if (provider.current) provider.current.voiceId = id;
  }, []);

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
