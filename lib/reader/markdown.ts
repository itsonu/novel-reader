// Isomorphic: runs on the server for SEO'd HTML and in the browser for local files.
// ponytail: fiction subset only (headings, p, em/strong, bq, hr, lists, code, links).
// Ceiling: no tables/footnotes. Swap in `marked` if a book needs them.

const esc = (s: string) =>
  s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, x) => `<code>${x}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/ {2,}$/gm, '<br>');
}

export function md(src: string): string {
  const out: string[] = [];
  for (let b of src.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    b = b.replace(/\n+$/, '');
    if (!b.trim()) continue;
    if (/^(---|\*\*\*|___)\s*$/.test(b.trim())) { out.push('<hr>'); continue; }
    const h = b.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^>\s?/m.test(b) && b.split('\n').every(l => /^>/.test(l) || !l.trim())) {
      out.push(`<blockquote>${md(b.replace(/^>\s?/gm, ''))}</blockquote>`); continue;
    }
    if (b.split('\n').every(l => /^\s*([-*+]|\d+[.)])\s+/.test(l))) {
      const ord = /^\s*\d/.test(b);
      const items = b.split('\n')
        .map(l => `<li>${inline(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`).join('');
      out.push(ord ? `<ol>${items}</ol>` : `<ul>${items}</ul>`); continue;
    }
    if (/^ {4}|\t/.test(b)) {
      out.push(`<pre><code>${esc(b.replace(/^( {4}|\t)/gm, ''))}</code></pre>`); continue;
    }
    out.push(`<p>${inline(b).replace(/\n/g, ' ')}</p>`);
  }
  return out.join('\n');
}

export type FrontMatter = { meta: Record<string, string>; body: string };

export function frontMatter(text: string): FrontMatter {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(m[0].length) };
}

const leadNum = (name: string) => {
  const m = name.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

export const isSkippable = (name: string) =>
  /^(readme|notes?|index|_)/i.test(name.replace(/\.md$/i, ''));

export type ChapterMeta = {
  title: string; order: number | null; body: string; excerpt: string; words: number;
};

/** Strip markdown to readable text — used for excerpts, meta description and word counts. */
export function plainText(mdSrc: string, limit = Infinity): string {
  const t = mdSrc
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= limit) return t;
  return t.slice(0, t.lastIndexOf(' ', limit)) + '…';
}

export function chapterMeta(file: string, text: string): ChapterMeta {
  const { meta, body } = frontMatter(text);
  const h1 = body.match(/^#\s+(.+)$/m);
  const base = file.replace(/\.md$/i, '').replace(/^[\d._\- ]+/, '');
  return {
    title: meta.title || h1?.[1].trim() || base.replace(/[_-]/g, ' '),
    order: meta.order != null ? parseFloat(meta.order) : leadNum(file),
    body,
    excerpt: plainText(body, 180),
    words: plainText(body).split(/\s+/).filter(Boolean).length
  };
}

/** Drop the leading H1 — the chapter header already shows the title, and printing it
 *  twice is the most common way a markdown reader looks amateur. */
export function bodyWithoutTitle(body: string): string {
  return body.replace(/^\s*#\s+.*\r?\n+/, '');
}

export function sortChapters<T extends { file: string; order: number | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order;
    if (a.order != null && b.order == null) return -1;
    if (a.order == null && b.order != null) return 1;
    return a.file.localeCompare(b.file, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
