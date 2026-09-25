import { notFound } from 'next/navigation';
import Link from 'next/link';
import { publicClient, cloudEnabled, type Novel, type Chapter } from '@/lib/supabase';
import { novelMetadata, bookJsonLd } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import Cover from '@/components/Cover';
import Icon from '@/components/Icon';
import PublishedActions, { PublishedChapters } from '@/components/PublishedActions';
import { EMPTY_SLUG } from '@/lib/mode';
import { publishedChapterHref } from '@/lib/routes';

type Params = { params: Promise<{ slug: string }> };

// Prerender every public novel at build time. On a server host this is ISR;
// on GitHub Pages it's the whole site.
export async function generateStaticParams() {
  if (!cloudEnabled()) return [{ slug: EMPTY_SLUG }];   // see lib/mode.ts
  const { data } = await publicClient().from('novels').select('slug').eq('is_public', true);
  return (data ?? []).map(n => ({ slug: n.slug }));
}

async function load(slug: string) {
  if (!cloudEnabled()) return null;
  const db = publicClient();
  const { data: novel } = await db.from('novels').select('*').eq('slug', slug).single<Novel>();
  if (!novel) return null;
  const { data } = await db.from('chapters').select('*').eq('novel_id', novel.id).order('ordinal');
  return { novel, chapters: (data ?? []) as Chapter[] };
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: 'Not found' };
  return novelMetadata(d.novel, d.chapters, d.chapters[0]?.body ?? '');
}

const hours = (w: number) => {
  const m = Math.max(1, Math.round(w / 238));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60} min` : ''}`.trim();
};

export default async function NovelPage({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { novel, chapters } = d;
  const words = chapters.reduce((s, c) => s + c.word_count, 0);

  return (
    <main className="bookpage">
      <JsonLd data={bookJsonLd(novel, chapters)} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Novels', item: '/' },
            { '@type': 'ListItem', position: 2, name: novel.title }
          ]
        }}
      />

      <nav className="backline" aria-label="Breadcrumb">
        <Link href="/" className="btn" data-variant="ghost" data-size="sm"><Icon name="back" size={16} /> Discover</Link>
      </nav>

      <header className="bookhero">
        <Cover title={novel.title} author={novel.author} src={novel.cover_url} size="lg" />
        <div className="info">
          <h1 className="display">{novel.title}</h1>
          {novel.author && <p className="byline">{novel.author}</p>}
          <p className="facts">
            <span>{chapters.length} chapters</span>
            <span>{words.toLocaleString()} words</span>
            <span><Icon name="clock" size={14} />{hours(words)}</span>
            {!novel.is_public && <span>Private</span>}
          </p>
          {novel.blurb && <p className="blurb">{novel.blurb}</p>}
          {novel.tags.length > 0 && (
            <div className="tags">{novel.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
          )}
          <div className="actions">
            <PublishedActions
              slug={novel.slug}
              title={novel.title}
              author={novel.author ?? undefined}
              cover={novel.cover_url ?? undefined}
              chapters={chapters.length}
              words={words}
              firstChapter={chapters[0]?.slug}
            />
          </div>
        </div>
      </header>

      <section className="booksec" aria-labelledby="ch-h">
        <div className="sechead"><h2 id="ch-h" className="title">Chapters</h2></div>
        <PublishedChapters
          slug={novel.slug}
          chapters={chapters.map(c => ({
            slug: c.slug, title: c.title, words: c.word_count, href: publishedChapterHref(novel.slug, c.slug)
          }))}
        />
      </section>
    </main>
  );
}
