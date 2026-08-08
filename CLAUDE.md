# CLAUDE.md — novel-reader

A reader for serialized fiction: point it at markdown chapters, read them, or have them
read aloud with the spoken word highlighted. Ships two ways from one codebase.

## The two builds — read this before changing anything structural

| | `npm run build` (Node host) | `npm run build:static` (GitHub Pages) |
|---|---|---|
| Local folder, narration, offline library, PWA | ✅ | ✅ |
| Public novel pages + SEO | live | prerendered at build |
| Accounts, upload, public sharing | ✅ | ❌ |
| Live updates without redeploy | ✅ | ❌ |

**Capabilities are declared once in `lib/mode.ts` (`can.*`). Branch on that, never on
`typeof window` or an ad-hoc env check.**

Four things break a static export. They are already solved; don't undo them:
1. **No Server Actions.** Writes go through the browser client — RLS is the security
   boundary (`supabase/schema.sql`), not a server hop.
2. **`generateStaticParams()` must not return `[]`** — Next 15 reports that as "missing"
   and fails the build. Hence `EMPTY_SLUG`, stripped afterwards by `scripts/finish-static.mjs`.
3. **Runtime-only routes use a `.server.tsx` extension**, included via `pageExtensions`
   only in the server build (see the generated OG image).
4. **`.nojekyll`** — without it GitHub Pages silently drops `/_next` and the site is blank.

## Architecture

```
lib/reader/markdown.ts   isomorphic md + front matter + ordering (server-rendered for SEO)
lib/reader/tokenize.ts   wraps rendered DOM text in <span class="w" data-i>
lib/reader/timing.ts     word-duration estimator
lib/reader/providers.ts  SystemVoice (Web Speech) | KokoroVoice (ONNX, lazy)
lib/reader/usePlayer.ts  transport, cue scheduling, one-ahead synthesis
lib/library.ts           IndexedDB: novels, progress, folder handle
lib/mode.ts              capability flags
lib/voices.ts            voice naming (accent + gender + timbre)
lib/seo.ts               metadata + JSON-LD
```

### Non-obvious things that will bite you

- **Tokenising must walk the rendered DOM, not the markdown.** Offsets desync at the
  first italic otherwise. Verified across `<em>` interiors and quoted dialogue.
- **`dangerouslySetInnerHTML` needs a memoized object.** React 19 compares it by
  *identity*, so a fresh `{__html}` literal rewrites innerHTML on every re-render and
  destroys the word spans. See `components/Reader.tsx`.
- **Word timing has two sources.** Kokoro knows the exact audio duration, so its cues are
  exact. Web Speech uses `boundary` events where available and the estimator where not
  (Chrome's network voices never fire them). The player learns which per session and
  stops estimating once real boundaries arrive.
- **The Kokoro model cache is deliberately un-versioned** (`models-v1` in `public/sw.js`)
  so an app update never re-downloads 80MB of weights.
- **Kokoro loads only on user intent**, never at page load.

## Style

Apple's rules, applied deliberately: size-specific tracking (tight on display, ~0 on
body), inverse leading, translucent chrome with content scrolling under, scroll-edge
fades instead of 1px dividers, feedback on pointer-down, springs for anything draggable.
`components/Sheet.tsx` is the only physics in the app — 1:1 drag, rubber-band at the
edge, dismiss decided by *projected* landing point, velocity handed to the settle.

`prefers-reduced-motion`, `-reduced-transparency` and `-contrast` are all handled and
must stay handled. Reduced motion means a gentler equivalent, not a dead UI — see
`SampleLine.tsx`, which holds a static highlight instead of animating.

## Conventions

- No CSS framework, no state library, no animation library. Plain functions.
- Mark deliberate simplifications with a `ponytail:` comment naming the ceiling.
- Verify before claiming done: build both targets, and check the highlight actually
  tracks through a paragraph containing italics and dialogue.

## Env

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # NEXT_PUBLIC_SUPABASE_ANON_KEY also accepted
```

Absent Supabase config the app still runs — local reading, narration and the offline
library need no server at all.
