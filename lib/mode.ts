// One codebase, two builds. `STATIC=1` targets GitHub Pages; the default targets a
// Node host (Vercel/Fly/self-hosted) with Supabase behind it.
//
// Rule of thumb: anything that needs a request at runtime is server-only. Everything
// that can run in the reader's own browser works in both.

export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === '1' || process.env.STATIC === '1';

const hasCloud = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
);

export const can = {
  /** Read a folder from the device. Always available. */
  localFolder: true,
  /** Keep an imported library across visits (IndexedDB). Always available. */
  localLibrary: true,
  /** Install + read offline (service worker). Always available. */
  offline: true,
  /** Text-to-speech, both providers. Always available. */
  narration: true,
  /** Browse novels others published. Needs the catalogue to exist at build or runtime. */
  publicCatalogue: hasCloud,
  /** Sign in and upload a novel that other people can read at a URL. Needs a server. */
  cloudPublishing: hasCloud && !IS_STATIC,
  /** Per-novel generated share cards. Needs runtime image rendering. */
  generatedShareCards: !IS_STATIC,
  /** New chapters appear without a redeploy. */
  liveUpdates: !IS_STATIC
} as const;

/** Placeholder slug used only when a static build has no catalogue to prerender.
 *  Next 15 rejects an empty generateStaticParams(), so one throwaway param is required;
 *  the build script deletes the emitted directory afterwards. */
export const EMPTY_SLUG = '__none';
