import { notFound } from 'next/navigation';
import Link from 'next/link';
import { publicClient, cloudEnabled, type Novel, type Chapter } from '@/lib/supabase';
import { novelMetadata, bookJsonLd } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import { EMPTY_SLUG } from '@/lib/mode';

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

export default async function NovelPage({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { novel, chapters } = d;
  const words = chapters.reduce((s, c) => s + c.word_count, 0);

  return (
    <main className="wrap">
      <JsonLd data={bookJsonLd(novel, chapters)} />

      <header className="hero">
        {novel.cover_url && <img src={novel.cover_url} alt="" className="cover" />}
        <div>
          <h1 className="display">{novel.title}</h1>
          {novel.author && <p className="title byline">{novel.author}</p>}
          <p className="caption meta mono">
            {chapters.length} chapters · {words.toLocaleString()} words
            {novel.is_public ? '' : ' · private'}
          </p>
          {novel.blurb && <p className="blurb">{novel.blurb}</p>}
          <div className="tags">
            {novel.tags.map(t => <span key={t} className="tag caption">{t}</span>)}
          </div>
          {chapters[0] && (
            <Link href={`/n/${novel.slug}/${chapters[0].slug}`} className="btn" data-variant="primary">
              Start reading
            </Link>
          )}
        </div>
      </header>

      <ol className="toc">
        {chapters.map((c, i) => (
          <li key={c.id}>
            <Link href={`/n/${novel.slug}/${c.slug}`}>
              <span className="caption mono n">{String(i + 1).padStart(2, '0')}</span>
              <span className="t">{c.title}</span>
              <span className="caption mono w">{c.word_count.toLocaleString()}</span>
            </Link>
            {c.excerpt && <p className="caption ex">{c.excerpt}</p>}
          </li>
        ))}
      </ol>
    </main>
  );
}
