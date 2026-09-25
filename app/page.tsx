import Link from 'next/link';
import { publicClient, cloudEnabled, type Novel } from '@/lib/supabase';
import Reveal from '@/components/Reveal';
import SampleLine from '@/components/SampleLine';
import SpokenProse from '@/components/SpokenProse';
import ResumeLink from '@/components/ResumeLink';
import Cover from '@/components/Cover';

export const revalidate = 300;

// The headline arrives the way the narrator delivers it: one word at a time.
// Flat index drives the stagger so the cadence carries across line breaks.
const HERO_LINES = [['Every', 'word,'], ['spoken', 'aloud'], ['as', 'you', 'read', 'it.']];

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
      <main className="landing">
        {/* hero */}
        <section className="hero-wrap">
          <Reveal>
            <p className="eyebrow hero-eyebrow">Read or listen · Free · No account</p>
            <h1 className="display hero-title">
              {HERO_LINES.map((line, li) => {
                const before = HERO_LINES.slice(0, li).reduce((n, l) => n + l.length, 0);
                const Line = li === 2 ? 'em' : 'span';
                return (
                  <Line key={li} className="hl">
                    {line.map((w, wi) => (
                      <span
                        key={wi}
                        className="hw"
                        style={{ ['--d' as string]: `${(before + wi) * 58}ms` }}
                      >{w}</span>
                    ))}
                  </Line>
                );
              })}
            </h1>
            <p className="lede">
              Point it at a folder of chapters, or open a novel someone published.
              A narrator reads; the page follows along, word by word.
            </p>
            <div className="cta">
              {/* Turns into "Continue <book>" once there's something to continue. */}
              <ResumeLink />
              <Link href="/#how" className="btn" data-size="lg">How it works</Link>
            </div>
          </Reveal>

          {/* live demo of the actual highlight mechanic */}
          <Reveal delay={140}>
            <SampleLine />
          </Reveal>
        </section>

        {/* What it does, read rather than listed: scrolling narrates it. */}
        <section id="how" className="rail">
          <SpokenProse />
        </section>

        {novels.length > 0 && (
          <section id="published" className="shelf">
            <Reveal>
              <h2 className="section-h display">Published here</h2>
            </Reveal>
            <ul className="shelfgrid">
              {novels.map((n, i) => (
                <li key={n.id}>
                  <Reveal delay={Math.min(i, 6) * 55}>
                    <Link href={`/n/${n.slug}`}>
                      <Cover title={n.title} author={n.author} src={n.cover_url} />
                      <span className="t">{n.title}</span>
                      {n.author && <span className="caption">{n.author}</span>}
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* No Reveal here on purpose: one authored entrance per page, and the
            passage above already owns the motion. */}
        <section className="closer">
          <h2 className="display">Bring your own book.</h2>
          <div className="cta center">
            <Link href="/library" className="btn" data-variant="primary" data-size="lg">Open your library</Link>
            <Link href="/publish" className="btn" data-size="lg">Add a novel</Link>
          </div>
          <p className="caption fineprint">
            Files stay on your device. No account, no tracking, no upload.
          </p>
        </section>
      </main>

      <footer className="footer">
        <span className="wordmark">Reader</span>
        <nav className="navlinks caption" aria-label="Footer">
          <Link href="/">Discover</Link>
          <Link href="/library">Library</Link>
          <Link href="/publish">Add a novel</Link>
          <Link href="/#how">How it works</Link>
        </nav>
      </footer>
    </>
  );
}
