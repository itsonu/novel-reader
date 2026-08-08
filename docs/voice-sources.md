# Voice engines — what's shipped, what's worth adding

Rule for this project: a voice engine must be **free, licence-clean for commercial use,
and run in the reader's browser**. Anything needing a server key breaks local mode and
the static build, so it doesn't qualify as a default.

## Shipped

| Engine | Licence | Size | Notes |
|---|---|---|---|
| **Web Speech API** | n/a (OS) | 0 | Instant, no download. Quality varies wildly by OS. Chrome's *network* voices never emit `boundary` events — that's why the estimator exists. |
| **Kokoro-82M ONNX** | Apache-2.0 | ~80 MB | The good one. WebGPU where available, WASM otherwise. Cached by the service worker in an un-versioned bucket so app updates never re-download it. Download state is remembered in `localStorage['nr:kokoro']` and reloaded automatically on return. |

## Worth adding next (vetted)

| Engine | Licence | Size | Why / why not yet |
|---|---|---|---|
| **Piper** (`rhasspy/piper`) | MIT | 20–60 MB per voice | Best next addition. Many languages, per-voice download so a reader can take one 25 MB voice instead of 80 MB. Browser builds exist (`piper-tts-web`, ONNX + wasm). Lower fidelity than Kokoro but far cheaper to fetch — the right default on a phone. |
| **KittenTTS** | Apache-2.0 | ~25 MB | Very small, surprisingly decent. Newer and less proven; worth a trial once its browser story settles. |
| **SpeechT5** via transformers.js | MIT | ~200 MB | Works, but bigger than Kokoro and noticeably worse. No reason to prefer it. |

## Rejected, with the reason

- **Coqui XTTS-v2** — Coqui Public Model Licence, non-commercial. Disqualified.
- **Meta MMS-TTS** — many checkpoints are CC-BY-NC. Disqualified for the same reason.
- **ElevenLabs / OpenAI / Google / Azure TTS** — excellent, but server-side and key-gated. They'd break local mode and the static build, and a free tier isn't a licence. If we ever add one it must be opt-in with the user's own key, never a default.
- **ResponsiveVoice** — free tier forbids commercial use.

## Adding an engine

`VoiceProvider` in `lib/reader/providers.ts` is the whole contract:

```ts
prepare(text, tokens, offset) -> Promise<Clip>   // Clip = { duration, start(when) }
now() -> number          // the clock `when` is expressed in
ready() -> Promise<void> // resolve once it is safe to schedule
pause() / resume() / stop()
listVoices() -> string[]
```

`prepare` synthesises but does not play. The player decides *when* each clip starts and
places it exactly where the previous one ends, which is what keeps narration gapless — so
`start(when)` must honour `when` rather than beginning immediately. An engine with no
clock of its own (Web Speech) may treat `when` as advisory, but must then report a real
`onStart` so the player can re-anchor. `stop()` must cancel **every** clip it has been
handed, including ones scheduled for the future; cancelling only the audible one leaves
the rest to play over the top after a seek.

A new engine needs only that. If it can report the synthesised audio duration, cues are
exact and no estimator runs. Register it beside `KokoroVoice`, add a row to the settings
sheet, and label its voices through `lib/voices.ts` so the naming stays consistent
(accent + gender + timbre — never "ethnicity"; an accent says nothing about a speaker).

**Per-voice downloads are the reason to add Piper.** One 80 MB blob is the wrong shape
for a phone on mobile data; "pick a voice, take 25 MB" is the right one.
