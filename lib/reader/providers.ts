// Two VoiceProviders. Web Speech is instant; Kokoro is better and lazy-loaded.
// Verified: Kokoro cold-load 30s on WebGPU/fp32, synth RTF 0.86 (3.17s of compute
// for 3.67s of audio) so one-ahead pipelining stays ahead of playback.

import { schedule, estimateDuration, weight, type Cue } from './timing';

export type SpeakHandle = { cues: Cue[]; ended: Promise<void>; duration: number };

export interface VoiceProvider {
  readonly kind: 'kokoro' | 'system';
  rate: number;
  voiceId: string | null;
  listVoices(): string[];
  /** Prepare audio for a sentence. Kokoro synthesises; Web Speech resolves instantly. */
  prepare(text: string, tokens: string[], offset: number): Promise<() => SpeakHandle>;
  pause(): void;
  resume(): void;
  stop(): void;
}

/* ---------------- Web Speech ---------------- */

export class SystemVoice implements VoiceProvider {
  readonly kind = 'system';
  rate = 1;
  voiceId: string | null = null;
  private utter: SpeechSynthesisUtterance | null = null;

  static available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
  listVoices() {
    return speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')).map(v => v.voiceURI);
  }

  async prepare(text: string, tokens: string[], offset: number) {
    return () => {
      const u = new SpeechSynthesisUtterance(text);
      const v = speechSynthesis.getVoices().find(x => x.voiceURI === this.voiceId);
      if (v) u.voice = v;
      u.rate = this.rate;
      this.utter = u;

      // Estimated cues up front; boundary events override them live when they fire.
      const duration = estimateDuration(tokens, this.rate);
      const cues = schedule(tokens, offset, duration);

      // char offset -> local token index, for boundary events
      const bounds: number[] = [];
      let pos = 0;
      for (const t of tokens) { bounds.push(pos); pos += t.length + 1; }

      let onCue: ((i: number) => void) | null = null;
      u.onboundary = e => {
        if (e.name && e.name !== 'word') return;
        let k = 0;
        while (k + 1 < bounds.length && bounds[k + 1] <= e.charIndex) k++;
        onCue?.(offset + k);
      };

      const ended = new Promise<void>(resolve => {
        u.onend = () => resolve();
        u.onerror = () => resolve();
      });
      speechSynthesis.speak(u);

      return {
        cues,
        duration,
        ended,
        // exposed so the player can subscribe to real boundaries when available
        get onBoundary() { return onCue; },
        set onBoundary(fn: ((i: number) => void) | null) { onCue = fn; }
      } as SpeakHandle & { onBoundary: ((i: number) => void) | null };
    };
  }
  pause() { speechSynthesis.pause(); }
  resume() { speechSynthesis.resume(); }
  stop() { speechSynthesis.cancel(); }
}

/* ---------------- Kokoro ---------------- */

export class KokoroVoice implements VoiceProvider {
  readonly kind = 'kokoro';
  rate = 1;
  voiceId: string | null = 'af_heart';
  private ctx: AudioContext;
  private src: AudioBufferSourceNode | null = null;

  private constructor(private tts: any) {
    this.ctx = new AudioContext();
  }

  static async load(onProgress: (pct: number | null, file?: string) => void) {
    const { KokoroTTS } = await import('kokoro-js');
    const gpu =
      typeof navigator !== 'undefined' && 'gpu' in navigator &&
      !!(await (navigator as any).gpu.requestAdapter().catch(() => null));
    const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: gpu ? 'fp32' : 'q8',
      device: gpu ? 'webgpu' : 'wasm',
      progress_callback: (p: any) => {
        const pct = p.progress != null ? p.progress / 100 : p.total ? p.loaded / p.total : null;
        onProgress(pct, p.file);
      }
    });
    return new KokoroVoice(tts);
  }

  listVoices() { return Object.keys(this.tts.voices ?? {}); }

  async prepare(text: string, tokens: string[], offset: number) {
    const raw = await this.tts.generate(text, { voice: this.voiceId });
    const buf = this.ctx.createBuffer(1, raw.audio.length, raw.sampling_rate);
    buf.copyToChannel(raw.audio, 0);

    return () => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = this.rate;
      src.connect(this.ctx.destination);
      src.start();
      this.src = src;
      const duration = buf.duration / this.rate;
      return {
        duration,
        cues: schedule(tokens, offset, duration),
        ended: new Promise<void>(r => { src.onended = () => r(); })
      };
    };
  }

  pause() { this.ctx.suspend(); }
  resume() { this.ctx.resume(); }
  stop() { try { this.src?.stop(); } catch {} this.ctx.resume(); }
}

export { weight };
