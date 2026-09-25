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
lib/reader/usePlayer.ts  transport, cue scheduling, buffered look-ahead synthesis
lib/library.ts           IndexedDB: novels, progress, folder handle
lib/mode.ts              capability flags
lib/voices.ts            voice naming (accent + gender + timbre)
lib/seo.ts               metadata + JSON-LD
lib/theme.ts             light/dark/system + the pre-paint BOOT_SCRIPT (no theme flash)
lib/reading.ts           reader prefs (size, leading, measure, face) as CSS vars
lib/ui.ts                usePresence (exit animations), useModal (focus trap/restore)
lib/useNovel.ts          one loader for local-novel screens (reloads on onLibraryChanged)
lib/chapters.ts          pure chapter rules: order, move, duplicate, drafts (readableChapters)

app/styles/tokens.css    every colour, size, radius, shadow, duration — both themes
app/styles/components.css  primitives: .btn .icon-btn .seg .switch .chip .meter .input …
components/ReaderShell   the one reading room for local AND published novels
components/ChapterList   search / filter / grouped-by-50 chapter list (novel page + drawer)
components/Toaster       toast() from anywhere, with Undo; survives navigation
```

### Routes (query params, because a static export can't prerender a folder imported later)

```
/library                          the shelf
/novel?id=<id>                    a book, reading side: continue, contents, bookmarks
/novel/chapters?id=<id>           the same book, writing side: order, drafts, duplicate, delete
/write?novel=<id>&chapter=<slug>  the chapter editor (chapter=new for a blank one)
/read?novel=<id>&chapter=<slug>   the reader
/n/<slug>[/<chapter>]             published novels (real paths — known at build time)
```

Drafts (`StoredChapter.draft`) are hidden from every reading surface — reader, contents,
library counts, ⌘K — and shown only on `/novel/chapters` and in the editor.

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
- **Kokoro loads only on user intent**, never at page load, and synthesises in a Web
  Worker (`lib/reader/tts.worker.ts`) so inference never blocks the highlight loop.
- **styled-jsx only scopes JSX in the returned tree.** Markup built in a helper or a
  `const` above the return gets no scoped class. Such pieces use global, prefixed CSS
  (`.chlist …`, `.libgrid`, `.chead`) — see `components/ChapterList.tsx`.
- **Never animate `transform` on an ancestor of a fixed overlay.** It becomes their
  containing block (the player rides the page). `template.tsx` fades opacity only, with
  `backwards` fill; chapter entrances animate `.page`, never the player's parent.
- **Themes are resolved before paint** by `BOOT_SCRIPT` in `<head>`. Don't move theme or
  reading-pref application into an effect — that reintroduces the flash.
- **The editor stays mounted across chapters.** Back/Forward and the switcher only change
  the query string, so the load effect flushes the *leaving* chapter's pending save before
  switching, and neighbours are computed from the URL's chapter, not the loaded one.
- **`backdrop-filter` and `content-visibility` both create containment.** A frosted bar
  becomes the containing block of any fixed child; a `content-visibility` row clips its
  open menu. Both bit this app once — see the editor bar and `.cm-row:has(...)`.
- **Audio is scheduled, not started.** Clips are placed on `AudioContext.currentTime` at
  the exact moment the previous one ends, and the player banks a reserve ahead of the
  play head. Anything that starts a clip with a bare `start()` reintroduces the gap.

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
- Verify before claiming done: `npm run check`, build both targets, then
  `npm run build:static && npm run test:e2e` (drives the static build end to end; checks
  that every word is wrapped for narration through italics and dialogue).

## Env

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # NEXT_PUBLIC_SUPABASE_ANON_KEY also accepted
```

Absent Supabase config the app still runs — local reading, narration and the offline
library need no server at all.
