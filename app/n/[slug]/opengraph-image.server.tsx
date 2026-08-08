import { ImageResponse } from 'next/og';
import { publicClient, cloudEnabled, type Novel } from '@/lib/supabase';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Novel cover';

// Required for `output: export` — every card is baked at build time.
export async function generateStaticParams() {
  if (!cloudEnabled()) return [];
  const { data } = await publicClient().from('novels').select('slug').eq('is_public', true);
  return (data ?? []).map(n => ({ slug: n.slug }));
}

// Auto-generated share card so a novel never posts as a bare link.
export default async function Image({ params }: { params: { slug: string } }) {
  let novel: Novel | null = null;
  let chapters = 0;
  if (cloudEnabled()) {
    const db = publicClient();
    const r = await db.from('novels').select('*').eq('slug', params.slug).single<Novel>();
    novel = r.data;
    if (novel) {
      const c = await db.from('chapters').select('id', { count: 'exact', head: true }).eq('novel_id', novel.id);
      chapters = c.count ?? 0;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: 80,
          background: '#0d0c0b', color: '#ece3d4',
          fontFamily: 'Georgia, serif'
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 2, color: '#d9a441', textTransform: 'uppercase' }}>
          {novel?.author ?? 'Novel Reader'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: novel && novel.title.length > 34 ? 68 : 92, lineHeight: 1.05, letterSpacing: -2 }}>
            {novel?.title ?? 'Novel Reader'}
          </div>
          {novel?.blurb && (
            <div style={{ fontSize: 30, color: '#9d948a', lineHeight: 1.4 }}>
              {novel.blurb.slice(0, 130)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 28, fontSize: 26, color: '#9d948a' }}>
          {chapters > 0 && <span>{chapters} chapters</span>}
          <span>Read or listen · free</span>
        </div>
      </div>
    ),
    size
  );
}
