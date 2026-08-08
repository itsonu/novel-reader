'use client';
// Procedural SFX. Every sound here is synthesised at runtime from noise + oscillators.
//
// Why not sample files: they'd be binary assets of unverifiable provenance, they'd
// bloat the repo and the offline cache, and thunder/impact/rain are exactly the class
// of sound that synthesises convincingly. Zero bytes, zero licence risk, instant offline.
//
// ponytail: if you ever want richer audio, drop CC0 files in /public/sfx and give
// `play()` a sample branch — the call sites don't change. See docs/voice-sources.md
// for the licence bar any asset has to clear.

import type { FxKind } from './lexicon';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let duck: GainNode | null = null;   // narration ducking lives here later

/** Lazily built — an AudioContext created before a user gesture starts suspended. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    duck = ctx.createGain();
    master.gain.value = 0.7;
    duck.gain.value = 1;
    master.connect(duck).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

export function setVolume(v: number) {
  const a = audio();
  if (a && master) master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), a.ctx.currentTime, 0.02);
}

/** White noise buffer, cached — allocating one per hit is wasteful and audible as GC. */
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

type Env = { attack: number; decay: number; peak: number };
function env(c: AudioContext, g: GainNode, t: number, e: Env) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.peak), t + e.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + e.attack + e.decay);
}

/** One hit. `i` is 0..1 narrative intensity and scales level and length. */
export function play(kind: FxKind, i = 0.7) {
  const a = audio();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime;
  const lvl = 0.25 + i * 0.55;

  const bus = c.createGain();
  bus.connect(out);

  const stop = (nodes: AudioScheduledSourceNode[], at: number) =>
    nodes.forEach(n => { try { n.stop(at); } catch {} });

  switch (kind) {
    case 'impact': {
      // body: a short filtered noise crack over a low sine thump
      const n = noise(c), nf = c.createBiquadFilter(), ng = c.createGain();
      nf.type = 'bandpass'; nf.frequency.value = 1400 + i * 900; nf.Q.value = 0.7;
      n.connect(nf).connect(ng).connect(bus);
      env(c, ng, t, { attack: 0.002, decay: 0.16 + i * 0.1, peak: lvl });

      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      o.connect(og).connect(bus);
      env(c, og, t, { attack: 0.003, decay: 0.22, peak: lvl * 0.9 });

      n.start(t); o.start(t); stop([n, o], t + 0.5);
      break;
    }

    case 'explosion': {
      const n = noise(c), lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(140, t + 0.9);
      n.connect(lp).connect(g).connect(bus);
      env(c, g, t, { attack: 0.005, decay: 1.1 + i * 0.5, peak: lvl });

      const sub = c.createOscillator(), sg = c.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, t);
      sub.frequency.exponentialRampToValueAtTime(32, t + 0.7);
      sub.connect(sg).connect(bus);
      env(c, sg, t, { attack: 0.01, decay: 0.8, peak: lvl });

      n.start(t); sub.start(t); stop([n, sub], t + 2);
      break;
    }

    case 'lightning': {
      // crack first, rumble after — the gap is what makes it read as distance
      const crack = noise(c), hp = c.createBiquadFilter(), cg = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 2200;
      crack.connect(hp).connect(cg).connect(bus);
      env(c, cg, t, { attack: 0.001, decay: 0.12, peak: lvl });

      const gap = 0.14 + (1 - i) * 0.5;
      const rum = noise(c), lp = c.createBiquadFilter(), rg = c.createGain();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420, t + gap);
      lp.frequency.exponentialRampToValueAtTime(90, t + gap + 1.6);
      rum.connect(lp).connect(rg).connect(bus);
      env(c, rg, t + gap, { attack: 0.08, decay: 1.7, peak: lvl * 0.85 });

      crack.start(t); rum.start(t + gap); stop([crack, rum], t + gap + 2.4);
      break;
    }

    case 'weather': {
      // a rain bed that swells and leaves, not a loop that overstays
      const n = noise(c), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.5;
      n.connect(bp).connect(g).connect(bus);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl * 0.4, t + 0.7);
      g.gain.setValueAtTime(lvl * 0.4, t + 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      n.start(t); stop([n], t + 3.8);
      break;
    }

    case 'dread': {
      // low drone with a slow tremolo — heartbeat-adjacent without being literal
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 46;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 1.6; lg.gain.value = 0.35;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(bus);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl * 0.5, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.start(t); lfo.start(t); stop([o, lfo], t + 2.8);
      break;
    }

    case 'reveal': {
      // rising fifth, soft — a lift, not a fanfare
      [0, 7].forEach((semi, k) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle';
        const f = 330 * Math.pow(2, semi / 12);
        o.frequency.setValueAtTime(f * 0.75, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.35);
        o.connect(g).connect(bus);
        env(c, g, t + k * 0.06, { attack: 0.08, decay: 0.7, peak: lvl * 0.3 });
        o.start(t); stop([o], t + 1.2);
      });
      break;
    }

    case 'warmth': {
      [0, 4, 7].forEach((semi, k) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.value = 392 * Math.pow(2, semi / 12);
        o.connect(g).connect(bus);
        env(c, g, t + k * 0.05, { attack: 0.06, decay: 1.1, peak: lvl * 0.22 });
        o.start(t); stop([o], t + 1.6);
      });
      break;
    }

    case 'silence': {
      // the absence IS the effect: pull everything down, then let it back
      if (!duck) break;
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(duck.gain.value, t);
      duck.gain.linearRampToValueAtTime(0.12, t + 0.12);
      duck.gain.setValueAtTime(0.12, t + 0.9);
      duck.gain.linearRampToValueAtTime(1, t + 1.6);
      break;
    }
  }
}

/** Called on the play button so the context is unlocked by a real gesture. */
export function unlock() { audio(); }
