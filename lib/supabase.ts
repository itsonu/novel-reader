// Client-safe Supabase surface. Nothing here may import next/headers —
// lib/publish.ts runs in the browser and pulls this in.
import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Supabase renamed the anon key to "publishable key". Accept both so an older or
// newer dashboard copy-paste works without editing code.
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

/** True when the app is configured for cloud mode. Local-only mode works without it. */
export const cloudEnabled = () => Boolean(url && key);

export const browserClient = () => createBrowserClient(url, key);

/**
 * Anonymous, cookie-free client for PUBLIC reads (RLS already exposes this data
 * to everyone). Required for `output: export`, where cookies() can't run.
 */
export const publicClient = () =>
  createClient(url || 'http://localhost', key || 'anon', {
    auth: { persistSession: false, autoRefreshToken: false }
  });

export type Novel = {
  id: string; slug: string; title: string; author: string | null;
  blurb: string | null; cover_url: string | null; tags: string[];
  language: string; is_public: boolean; updated_at: string;
};

export type Chapter = {
  id: string; novel_id: string; slug: string; title: string;
  ordinal: number; body: string; excerpt: string | null;
  word_count: number; published_at: string | null;
};
