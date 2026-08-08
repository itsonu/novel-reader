// Publishing runs in the browser against Supabase directly.
//
// ponytail: this was a Server Action. Row-level security is the actual security
// boundary (novels_write_own / chapters_write_own check auth.uid()), so a server
// action added a hop without adding safety — and it makes `output: export`
// impossible. Same guarantees, works on a static host.

import { browserClient } from './supabase';
import { chapterMeta, sortChapters, slugify, plainText } from './reader/markdown';

export type UploadFile = { name: string; text: string };

const STOP = new Set(
  ('the a an and or but of to in on at for with from by as is was were be been being it its his her he she they them their there here i you we not that this had have has did do does said say says would could should will shall may might can what when where who whom which while then than so too very just only also into over under out up down off about after before again more most other some such no nor own same')
    .split(' ')
);

function deriveTags(sample: string): string[] {
  const text = plainText(sample);
  const freq = new Map<string, number>();
  // proper nouns first — in fiction those are the names readers actually search
  for (const m of text.match(/\b[A-Z][a-z]{3,}\b/g) ?? []) {
    if (STOP.has(m.toLowerCase())) continue;
    freq.set(m, (freq.get(m) ?? 0) + 1);
  }
  const names = [...freq.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w);
  return [...new Set([...names, 'fiction', 'web novel'])].slice(0, 8);
}

export async function publishNovel(input: {
  title?: string;
  author?: string;
  isPublic: boolean;
  files: UploadFile[];
}): Promise<{ slug: string; chapters: number } | { error: string }> {
  const db = browserClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: 'Sign in first.' };
  if (!input.files.length) return { error: 'No markdown files.' };

  const parsed = sortChapters(
    input.files.map(f => ({ file: f.name, ...chapterMeta(f.name, f.text) }))
  );

  const title =
    input.title?.trim() || parsed[0]?.title || input.files[0].name.split('/')[0] || 'Untitled';
  const blurb = plainText(parsed[0]?.body ?? '', 280);
  const tags = deriveTags(parsed.slice(0, 5).map(c => c.body).join('\n'));

  let slug = slugify(title);
  for (let n = 2; ; n++) {
    const { data } = await db.from('novels').select('id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${slugify(title)}-${n}`;
  }

  const { data: novel, error } = await db
    .from('novels')
    .insert({
      owner: auth.user.id,
      slug,
      title,
      author: input.author?.trim() || null,
      blurb,
      tags,
      is_public: input.isPublic
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rows = parsed.map((c, i) => {
    let s = slugify(c.title) || `chapter-${i + 1}`;
    const root = s;
    for (let n = 2; seen.has(s); n++) s = `${root}-${n}`;
    seen.add(s);
    return {
      novel_id: novel.id,
      slug: s,
      title: c.title,
      ordinal: c.order ?? i + 1,
      body: c.body,
      excerpt: c.excerpt,
      word_count: c.words,
      published_at: input.isPublic ? now : null
    };
  });

  const { error: cErr } = await db.from('chapters').insert(rows);
  if (cErr) return { error: cErr.message };

  return { slug, chapters: rows.length };
}
