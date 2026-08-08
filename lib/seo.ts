// Auto-SEO. Everything a novel needs is derivable from its own text — no author input.
import type { Metadata } from 'next';
import type { Novel, Chapter } from './supabase';
import { plainText } from './reader/markdown';

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const abs = (p: string) => new URL(p, SITE).toString();

/** Generated share cards need a running server; a static export uses the cover, or none. */
const IS_STATIC = process.env.STATIC === '1';
const ogImage = (novel: { slug: string; cover_url: string | null }) =>
  novel.cover_url || (IS_STATIC ? null : abs(`/n/${novel.slug}/opengraph-image`));

/** Derive keywords from tags + the most distinctive words the book actually uses. */
export function autoKeywords(novel: Novel, sample: string): string[] {
  const stop = new Set(('the a an and or but of to in on at for with from by as is was were be been it its his her he she they them i you not that this had have has did do said' ).split(' '));
  const freq = new Map<string, number>();
  for (const w of plainText(sample).toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
    if (stop.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
  return [...new Set([...novel.tags, ...top, 'web novel', 'read online', 'audiobook'])].slice(0, 15);
}

export function novelMetadata(novel: Novel, chapters: Chapter[], sample = ''): Metadata {
  const desc =
    novel.blurb?.slice(0, 300) ||
    plainText(sample, 300) ||
    `${novel.title}${novel.author ? ` by ${novel.author}` : ''} — ${chapters.length} chapters, free to read and listen.`;
  const url = abs(`/n/${novel.slug}`);
  const image = ogImage(novel);
  return {
    title: novel.title,
    description: desc,
    keywords: autoKeywords(novel, sample),
    authors: novel.author ? [{ name: novel.author }] : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: 'book', url, title: novel.title, description: desc,
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
      siteName: 'Novel Reader'
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: novel.title, description: desc, ...(image ? { images: [image] } : {})
    },
    robots: novel.is_public
      ? { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 }
      : { index: false, follow: false }
  };
}

export function chapterMetadata(novel: Novel, ch: Chapter, prevNext: { prev?: Chapter; next?: Chapter }): Metadata {
  const desc = ch.excerpt || plainText(ch.body, 300);
  const url = abs(`/n/${novel.slug}/${ch.slug}`);
  return {
    title: `${ch.title} — ${novel.title}`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      type: 'article', url, title: `${ch.title} — ${novel.title}`, description: desc,
      ...(ogImage(novel) ? { images: [{ url: ogImage(novel)!, width: 1200, height: 630 }] } : {})
    },
    twitter: { card: 'summary_large_image', title: ch.title, description: desc },
    other: {
      ...(prevNext.prev ? { 'prev-chapter': abs(`/n/${novel.slug}/${prevNext.prev.slug}`) } : {}),
      ...(prevNext.next ? { 'next-chapter': abs(`/n/${novel.slug}/${prevNext.next.slug}`) } : {})
    },
    robots: novel.is_public && ch.published_at
      ? { index: true, follow: true, 'max-snippet': -1 }
      : { index: false, follow: false }
  };
}

/** Schema.org — Book + Chapter. This is what earns rich results. */
export function bookJsonLd(novel: Novel, chapters: Chapter[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: novel.title,
    url: abs(`/n/${novel.slug}`),
    inLanguage: novel.language,
    author: novel.author ? { '@type': 'Person', name: novel.author } : undefined,
    description: novel.blurb ?? undefined,
    image: novel.cover_url ?? undefined,
    genre: novel.tags,
    numberOfPages: chapters.length,
    bookFormat: 'https://schema.org/EBook',
    isAccessibleForFree: true,
    hasPart: chapters.slice(0, 100).map(c => ({
      '@type': 'Chapter',
      name: c.title,
      position: c.ordinal,
      url: abs(`/n/${novel.slug}/${c.slug}`),
      wordCount: c.word_count
    }))
  };
}

export function chapterJsonLd(novel: Novel, ch: Chapter) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Chapter',
    name: ch.title,
    url: abs(`/n/${novel.slug}/${ch.slug}`),
    position: ch.ordinal,
    wordCount: ch.word_count,
    datePublished: ch.published_at ?? undefined,
    inLanguage: novel.language,
    isPartOf: { '@type': 'Book', name: novel.title, url: abs(`/n/${novel.slug}`) },
    author: novel.author ? { '@type': 'Person', name: novel.author } : undefined,
    isAccessibleForFree: true
  };
}

