import type { MetadataRoute } from 'next';
import { publicClient, cloudEnabled } from '@/lib/supabase';
import { SITE } from '@/lib/seo';

export const dynamic = 'force-static';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/how-it-works`, changeFrequency: 'monthly', priority: 0.7 }
  ];
  if (!cloudEnabled()) return base;

  const db = publicClient();
  const { data: novels } = await db
    .from('novels').select('slug, updated_at, id').eq('is_public', true);

  const out = [...base];
  for (const n of novels ?? []) {
    out.push({
      url: `${SITE}/n/${n.slug}`,
      lastModified: n.updated_at,
      changeFrequency: 'weekly',
      priority: 0.8
    });
    const { data: chapters } = await db
      .from('chapters').select('slug, updated_at')
      .eq('novel_id', n.id).not('published_at', 'is', null);
    for (const c of chapters ?? [])
      out.push({
        url: `${SITE}/n/${n.slug}/${c.slug}`,
        lastModified: c.updated_at,
        changeFrequency: 'monthly',
        priority: 0.6
      });
  }
  return out;
}
