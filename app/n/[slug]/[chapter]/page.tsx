import { notFound } from 'next/navigation';
import { publicClient, cloudEnabled, type Novel, type Chapter } from '@/lib/supabase';
import { md, bodyWithoutTitle } from '@/lib/reader/markdown';
import { chapterMetadata, chapterJsonLd } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import { EMPTY_SLUG } from '@/lib/mode';
import { publishedChapterHref, publishedNovelHref, remoteId } from '@/lib/routes';
import ReaderShell from '@/components/ReaderShell';

type Params = { params: Promise<{ slug: string; chapter: string }> };

// Every published chapter of every public novel becomes a real HTML file.
// That's what makes full SEO possible on a static host.
export async function generateStaticParams() {
  if (!cloudEnabled()) return [{ slug: EMPTY_SLUG, chapter: EMPTY_SLUG }];   // see lib/mode.ts
  const db = publicClient();
  const { data: novels } = await db.from('novels').select('id, slug').eq('is_public', true);
  const out: { slug: string; chapter: string }[] = [];
  for (const n of novels ?? []) {
    const { data: chs } = await db
      .from('chapters').select('slug').eq('novel_id', n.id).not('published_at', 'is', null);
    for (const c of chs ?? []) out.push({ slug: n.slug, chapter: c.slug });
  }
  return out;
}

async function load(slug: string, chapterSlug: string) {
  if (!cloudEnabled()) return null;
  const db = publicClient();
  const { data: novel } = await db.from('novels').select('*').eq('slug', slug).single<Novel>();
  if (!novel) return null;
  const { data: chapters } = await db
    .from('chapters').select('*').eq('novel_id', novel.id).order('ordinal');
  const list = (chapters ?? []) as Chapter[];
  const i = list.findIndex(c => c.slug === chapterSlug);
  if (i < 0) return null;
  return { novel, chapters: list, chapter: list[i], prev: list[i - 1], next: list[i + 1], total: list.length, index: i };
}

export async function generateMetadata({ params }: Params) {
  const { slug, chapter } = await params;
  const d = await load(slug, chapter);
  if (!d) return { title: 'Not found' };
  return chapterMetadata(d.novel, d.chapter, { prev: d.prev, next: d.next });
}

export default async function ChapterPage({ params }: Params) {
  const { slug, chapter } = await params;
  const d = await load(slug, chapter);
  if (!d) notFound();
  const { novel, chapters, chapter: ch, total, index } = d;

  return (
    <>
      <JsonLd data={chapterJsonLd(novel, ch)} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: novel.title, item: `/n/${novel.slug}` },
            { '@type': 'ListItem', position: 2, name: ch.title }
          ]
        }}
      />

      {/* The prose is rendered here on the server, so every chapter is a real,
          indexable HTML page; the shell around it hydrates for the chrome. */}
      <ReaderShell
        novel={{
          id: remoteId(novel.slug), title: novel.title, author: novel.author ?? undefined,
          href: publishedNovelHref(novel.slug), cover: novel.cover_url ?? undefined
        }}
        chapters={chapters.map(c => ({
          slug: c.slug, title: c.title, words: c.word_count, href: publishedChapterHref(novel.slug, c.slug)
        }))}
        index={index}
        html={md(bodyWithoutTitle(ch.body))}
        words={ch.word_count}
        tracker={{
          novelId: remoteId(novel.slug),
          novelTitle: novel.title,
          author: novel.author ?? undefined,
          chapters: total,
          chapterSlug: ch.slug,
          chapterTitle: ch.title,
          chapterIndex: index,
          href: publishedChapterHref(novel.slug, ch.slug),
          scrollKey: `${novel.slug}/${ch.slug}`,
          remote: true,
          saved: { slug: novel.slug, cover: novel.cover_url ?? undefined }
        }}
      />
    </>
  );
}
