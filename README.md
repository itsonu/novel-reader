# Novel Reader

Read or listen to serialized fiction in a browser. Word-synced narration, no install.

Two modes, one reader:

- **Local** (`/read`) — point it at a folder of `.md` chapters. Nothing uploads, no account.
- **Cloud** (`/n/<slug>`) — publish a novel; server-rendered pages with full SEO, shareable to anyone.

## Hosting — two builds, one codebase

| | `npm run build` (Node host) | `npm run build:static` (GitHub Pages) |
|---|---|---|
| Read a local folder | ✅ | ✅ |
| Narration, word-sync, both voice engines | ✅ | ✅ |
| Library persists across visits (IndexedDB) | ✅ | ✅ |
| Install + read offline (PWA) | ✅ | ✅ |
| Import a novel into your own library | ✅ | ✅ |
| Public novel pages with full SEO | ✅ live | ✅ prerendered at build |
| Sign in, upload, share a public URL | ✅ | ❌ no server |
| Generated per-novel share cards | ✅ | cover image, or none |
| New chapters appear without a redeploy | ✅ | ❌ rebuild to publish |

The split is declared in `lib/mode.ts` (`can.*`) — one place, checked by the UI.

### GitHub Pages — live at https://itsonu.github.io/novel-reader/

```bash
npm run deploy            # build with the right base path + push to gh-pages
```

Two things that silently break a Pages deploy, both handled by those scripts:

- **`BASE_PATH`** — a *project* site is served from `/<repo>/`, so without it every
  asset 404s. Set it in PowerShell, not Git Bash: bash rewrites `/novel-reader` into
  a Windows path and the build fails with a confusing `basePath has to start with a /`.
- **`.nojekyll`** — Pages runs Jekyll by default, which drops every `_`-prefixed folder,
  i.e. all of `/_next`. The site loads blank. `scripts/deploy-pages.mjs` refuses to
  publish without it.

Other useful targets:

```bash
npm run build:static      # -> ./out, no base path (user/org site or another host)
npm run preview:static    # build + serve it locally
```

Push to `main`; `.github/workflows/pages.yml` builds and deploys. In
**Settings → Pages** set the source to **GitHub Actions**, then add repo *variables*:

| Variable | Value |
|---|---|
| `SITE_URL` | `https://you.github.io/repo` |
| `BASE_PATH` | `/repo` — leave empty for a `you.github.io` user site |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | optional; set them to prerender your public catalogue |

With Supabase configured, every public novel and published chapter is baked into real
HTML at build time — so search engines get full pages, not an empty shell. The workflow
also runs daily and on `workflow_dispatch`, which is how new chapters reach a static host.

Three things the build script handles that Pages otherwise breaks on: `.nojekyll` (without
it Pages silently drops `/_next`), the `404.html` fallback, and stripping the placeholder
route Next requires when there's no catalogue to prerender.

### Node host (Vercel / Fly / self-hosted)

`npm run build && npm start`, with the env vars below. This is the build that supports
accounts, uploads and live public sharing.

## Run

```bash
npm install
npm run dev
```

Local reading works with no configuration. For publishing, copy `.env.example` to
`.env.local` and fill in:

```
NEXT_PUBLIC_SITE_URL=https://your-domain
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Then run `supabase/schema.sql` in the Supabase SQL editor. It creates `novels`,
`chapters`, `progress` and the row-level security policies: public novels are
world-readable, drafts and private novels are owner-only.

## How chapters are read

Order: leading number in the filename → front-matter `order` → natural sort.
Title: front-matter `title` → first `# H1` → filename. `README`/`notes`/`index` are ignored.

```markdown
---
title: Second Sundays
order: 1
---
# Second Sundays

> *Peace is lent, never given.* — cradle-saying
```

## Voices

Two providers behind one interface (`lib/reader/providers.ts`):

| | Load | Quality |
|---|---|---|
| **System** (Web Speech) | instant | device voices |
| **Kokoro** (Kokoro-82M, ONNX, Apache-2.0) | ~30s once, then cached | far better |

Kokoro loads only when you press *Better voices* — never on page load. WebGPU when
available, WASM otherwise. Voices are labelled by **accent and gender plus a timbre
note** (`Heart — American Female · warm, intimate`). Accent is not ethnicity; the
label describes how the voice sounds, nothing about who speaks it.

## Word highlighting

Tokenising walks the **rendered DOM**, not the markdown — offsets otherwise desync at
the first italic. Each word becomes a `<span class="w" data-i="N">`; sentences are
word-index ranges.

- **Kokoro**: audio duration is known after synthesis, so the per-word schedule is exact.
- **Web Speech**: real `boundary` events when the engine emits them. The estimator
  (`0.6 × letters + 1.4 × syllables`, punctuation widening the gap) is the fallback for
  engines that don't — Chrome's network voices, notably. Measured against real boundary
  timings: mean error 145–313ms per sentence, worst 705ms in dialogue, resyncing every
  sentence so it never accumulates.

## SEO

Derived from the text at publish time — the author fills in nothing:

- `generateMetadata` per novel and per chapter, canonical URLs, prev/next
- Schema.org `Book` + `Chapter` + `BreadcrumbList` JSON-LD
- Auto OG share cards (`/n/<slug>/opengraph-image`)
- `sitemap.xml` covering every public novel and published chapter, `robots.txt`
- Excerpts, word counts and keyword/tag extraction from the prose itself
- Drafts and private novels emit `noindex`

## Layout

```
app/
  page.tsx                     library / landing
  read/                        local folder mode (client)
  publish/                     upload + auto-SEO (server action)
  n/[slug]/                    public novel page + OG image
  n/[slug]/[chapter]/          public chapter, SSR
lib/
  reader/markdown.ts           isomorphic markdown + front matter + ordering
  reader/tokenize.ts           DOM word wrapping, sentence grouping
  reader/timing.ts             the calibrated estimator
  reader/providers.ts          SystemVoice, KokoroVoice
  reader/usePlayer.ts          transport, cues, pipelining
  voices.ts                    voice naming
  seo.ts                       metadata + JSON-LD
components/                    Reader, Player, Companion, JsonLd
supabase/schema.sql
```

## Known rough edges

- Verified in Chrome only. Firefox/Safari use the `webkitdirectory` fallback, which is
  wired but not run in a real Firefox.
- Punctuation-only tokens (a lone em-dash) don't get a boundary event, so they're
  skipped by the highlight on system voices. Cosmetic.
- The first sentence of a session can double-highlight once while the app works out
  whether the engine emits boundary events. Every sentence after is clean.
- Markdown covers the fiction subset (headings, emphasis, blockquote, lists, hr, code,
  links). No tables or footnotes — swap in `marked` if a book needs them.
