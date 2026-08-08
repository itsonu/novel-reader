# Visual-novel mode — deferred spec

Status: **not built.** The effect engine in `lib/fx/` is the shipped floor of this design
(tiers `text` → `ambient` → `camera` → `screen`). Everything below is what a later phase
adds on top, and the seams it plugs into already exist.

## The governing rule

**Effects are proportional to narrative intensity, and 90% of reading is calm.**

```
0.0 ──────────────────────────────────── 1.0
 │      │        │        │        │
 0.1    0.3      0.5      0.7      0.9
 text   ambient  camera   screen   cinematic
 ▲──────── shipped ────────▲       ▲── deferred ──▲
```

A reader that flashes every third paragraph is unreadable within five minutes. The
budget in `lexicon.ts` (`thin()`) enforces this in code — strongest event per window,
capped per 1000 tokens — rather than trusting prose to be sparse. **Keep that discipline
in any expansion.** It is the single most important line in this document.

## What already ships

- **Event detection** (`lib/fx/lexicon.ts`) — deterministic lexicon, genre-biased, no
  model at runtime. Works on a local folder with no network.
- **Intensity ladder + compiler** (`lib/fx/engine.ts`) — event → tier → CSS payload.
- **Two composited planes** (`components/FxLayer.tsx`) — tint/flash and vignette, never
  in the text's layout path so an effect can't reflow prose mid-sentence.
- **Fires on the narrated word.** This is the differentiator and it is already true: the
  hit lands on the syllable the voice is speaking, because the player emits word-level
  cues. Scroll-triggered effects are a much weaker version of the same idea.

## Phase 2 — audio (highest value per unit of work)

Layered Web Audio bus, not one-shot `<audio>` tags:

```
music · ambience · environment · character · sfx · ui
```

An event ducks and lifts layers rather than just playing a file — thunder raises wind,
drops music, adds reverb tail. Web Audio API only; no Howler/Tone needed for six gain
nodes and a convolver.

Prose → sound is semantic, not literal: *"His heart stopped"* → `HEARTBEAT_STOP`,
*"The world went silent"* → duck-all + vignette. The lexicon already produces the event
kinds; they just need sinks.

**Blocker to respect:** autoplay policy. Audio may only start from a user gesture — the
existing play button is that gesture. Never attempt ambience on page load.

## Phase 3 — WebGL background

Three.js **behind the text only**, never as the app shell. Justified uses: weather
particles (rain/snow/ash/petals/fireflies), fog, volumetric dark, magic circles, portals.

Hard constraints:
- One canvas, `pointer-events: none`, behind the prose layer.
- Must degrade to nothing: no WebGL → the reader is unchanged.
- Pause the render loop when the tab is hidden or the reader isn't playing. A novel
  reader holding a 60fps GPU loop while someone reads static text is indefensible.
- Not on the static-export critical path — lazy chunk, like Kokoro.

## Phase 4 — authored cinematics

Theatre.js earns its place only when an **author** wants a hand-timed sequence. Until
then the automatic engine covers the need. Scene DSL, stored in chapter front matter:

```yaml
scene:
  genre: dark-fantasy
  atmosphere: night
beats:
  - at: "the ancient gate"      # anchor by token match, not ms
    camera: { zoom: 1.15, ms: 1200 }
    audio: stone_gate
    particles: dust
    light: { flash: 0.3 }
```

**Anchor beats to text, not to milliseconds.** The reader controls pace — speed setting,
pausing, re-reading. A timeline in absolute time desyncs the moment someone changes
playback speed; a timeline anchored to token indices never does.

## Phase 5 — character presence

Portraits + expression swap on dialogue attribution, name card, entrance ambience. Needs
an asset pipeline (`characters/<name>/<expression>.png`) and speaker attribution in the
prose, which the tokeniser doesn't currently extract. Meaningful work; lowest priority.

## AI annotation — a publish-time step, never runtime

The lexicon is the always-available floor. Richer events come from annotating at publish
time and writing the result into front matter, so the reader still needs no network.

Lean annotation prompt (short deliberately — enumerated rule lists degrade output):

```
You are annotating a chapter of fiction so a reading app can add restrained
cinematic effects — screen beats that land on the narrated word.

Return JSON: { "events": [ { "quote", "kind", "intensity" } ] }
kind: impact | explosion | weather | lightning | reveal | silence | dread | warmth
intensity: 0..1
"quote": the exact 1-3 word span the effect should land on, copied verbatim.

Choose at most one event per 200 words, and only where the prose genuinely turns.
A chapter with no such moment returns an empty list — that is a correct answer and
a common one. Err toward silence: a reader interrupted by an effect that wasn't
earned stops trusting every later one.
```

Ship it behind a flag and diff its output against the lexicon before trusting it.

## What to resist

- Making the reader a Three.js app. The text is the product.
- Effects on scroll position instead of narration. Weaker, and we already have better.
- A second animation library. `lib/fx` + CSS covers every shipped tier; add one only
  when a tier genuinely needs it.
- Per-paragraph spectacle. See the governing rule.
