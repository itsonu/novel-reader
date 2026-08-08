// Kokoro synthesis, off the main thread.
//
// Everything the model touches — the espeak phonemizer wasm, the tokenizer, the ONNX
// session — lives on this side. The main thread only ever sees a Float32Array, which it
// wraps in an AudioBuffer (AudioContext is [Exposed=Window]; there is no worker path).
//
// Before this existed, inference ran on the main thread: transformers.js sets
// ONNX_ENV.wasm.proxy = false, so every generate() competed with the word-highlight rAF
// loop and React's per-word render. That is what made the highlight freeze and jump.

import { KokoroTTS } from 'kokoro-js';

/** Main → worker. Every request carries an id; every reply echoes it. */
export type Req =
  | { t: 'load'; id: number; gpu: boolean }
  | { t: 'gen'; id: number; text: string; voice: string }
  | { t: 'cancel' };                       // drop what hasn't started. No id, no reply.

/** Worker → main. `progress` is a broadcast; the rest answer one request. */
export type Res =
  | { t: 'progress'; pct: number | null; file?: string }
  | { t: 'ready'; id: number; voices: string[] }
  | { t: 'audio'; id: number; pcm: Float32Array; rate: number }
  | { t: 'error'; id: number; message: string };

// tsconfig's `lib` has no "webworker" (adding it collides with "dom"), so the worker
// globals are reached through a cast rather than typed.
const ctx = self as unknown as {
  postMessage(m: Res, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Req>) => void) | null;
};
const post = (m: Res, transfer: Transferable[] = []) => ctx.postMessage(m, transfer);

let tts: any = null;
/** Bumped by `cancel`. Jobs captured under an older epoch are dropped before they start. */
let epoch = 0;
/** transformers.js serialises session.run internally anyway; this keeps our own
 *  ordering explicit and gives `cancel` something to drop. */
let chain: Promise<unknown> = Promise.resolve();

ctx.onmessage = (e: MessageEvent<Req>) => {
  const m = e.data;
  if (m.t === 'cancel') { epoch++; return; }

  // Captured before the chain hop: a cancel that lands mid-flight drops everything
  // queued behind the running job, but lets the running one finish — ORT has no abort,
  // and the main thread discards the orphaned reply by id.
  const mine = epoch;

  chain = chain.then(async () => {
    if (mine !== epoch) return;
    try {
      if (m.t === 'load') {
        tts ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: m.gpu ? 'fp32' : 'q8',
          device: m.gpu ? 'webgpu' : 'wasm',
          progress_callback: (p: any) =>
            post({
              t: 'progress',
              file: p.file,
              pct: p.progress != null ? p.progress / 100 : p.total ? p.loaded / p.total : null
            })
        });
        post({ t: 'ready', id: m.id, voices: Object.keys(tts.voices ?? {}) });
        return;
      }

      const raw = await tts.generate(m.text, { voice: m.voice });
      const a: Float32Array = raw.audio;
      // ponytail: ORT normally hands back a tensor over its own buffer, but a view into
      // a shared arena would detach ORT's memory on transfer. Copy only when it's a view.
      const pcm = a.byteOffset || a.buffer.byteLength !== a.byteLength ? new Float32Array(a) : a;
      post({ t: 'audio', id: m.id, pcm, rate: raw.sampling_rate }, [pcm.buffer]);
    } catch (err: any) {
      // An unhandled rejection in a worker never reaches the main thread's onerror,
      // so every failure has to be posted deliberately.
      post({ t: 'error', id: m.id, message: String(err?.message ?? err) });
    }
  });
};
