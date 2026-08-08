import Link from 'next/link';
import { publicClient, cloudEnabled, type Novel } from '@/lib/supabase';
import Reveal from '@/components/Reveal';
import SampleLine from '@/components/SampleLine';

export const revalidate = 300;

async function publicNovels(): Promise<Novel[]> {
  if (!cloudEnabled()) return [];
  const db = publicClient();
  const { data } = await db
    .from('novels').select('*').eq('is_public', true)
    .order('updated_at', { ascending: false }).limit(12);
  return (data ?? []) as Novel[];
}

export default async function Home() {
  const novels = await publicNovels();

  return (
    <>
      <nav className="topbar chrome">
        <span className="wordmark">Reader</span>
        <div className="navlinks">
          <Link href="/read" className="btn" data-variant="ghost">Open a folder</Link>
          <Link href="/publish" className="btn" data-variant="primary">Add a novel</Link>
        </div>
      </nav>

      <main>
        {/* hero */}
        <section className="hero-wrap">
          <Reveal>
            <p className="eyebrow caption">Read or listen · free · no account</p>
            <h1 className="display hero-title">
              Every word,<br />spoken aloud<br />
              <em>as you read it.</em>
            </h1>
            <p className="lede">
              Point it at a folder of chapters, or open a novel someone published.
              A narrator reads; the page follows along, word by word.
            </p>
            <div className="cta">
              <Link href="/read" className="btn" data-variant="primary">Start reading</Link>
              <Link href="#how" className="btn">How it works</Link>
            </div>
          </Reveal>

          {/* live demo of the actual highlight mechanic */}
          <Reveal delay={140}>
            <SampleLine />
          </Reveal>
        </section>

        {/* what it does */}
        <section id="how" className="rail">
          {[
            ['Any folder of markdown', 'Chapter order, titles and word counts come from the files. Nothing to configure, nothing to upload.'],
            ['Two voices, one tap', 'Your device speaks instantly. A better neural voice downloads once, then works offline forever.'],
            ['Reads like a book', 'Serif prose at a real measure, adjustable size, light and dark. No ads between paragraphs.'],
            ['Yours to keep', 'The library lives on your device. Install it and it works with no connection at all.']
          ].map(([h, p], i) => (
            <Reveal key={h} delay={i * 70}>
              <article className="card">
                <h3 className="title">{h}</h3>
                <p className="caption">{p}</p>
              </article>
            </Reveal>
          ))}
        </section>

        {novels.length > 0 && (
          <section className="shelf">
            <Reveal>
              <h2 className="section-h display">Published here</h2>
            </Reveal>
            <ul className="grid">
              {novels.map((n, i) => (
                <li key={n.id}>
                  <Reveal delay={Math.min(i, 6) * 55}>
                    <Link href={`/n/${n.slug}`}>
                      {n.cover_url
                        ? <img src={n.cover_url} alt="" />
                        : <span className="blank" aria-hidden>{n.title.slice(0, 1)}</span>}
                      <span className="t title">{n.title}</span>
                      {n.author && <span className="caption">{n.author}</span>}
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="closer">
          <Reveal>
            <h2 className="display">Bring your own book.</h2>
            <Link href="/read" className="btn" data-variant="primary">Open a folder</Link>
            <p className="caption fineprint">
              Files stay on your device. No account, no tracking, no upload.
            </p>
          </Reveal>
        </section>
      </main>
    </>
  );
}
