'use client';
// Local mode: same reader, same voices, zero account, files never leave the device.
import { useCallback, useEffect, useRef, useState } from 'react';
import { chapterMeta, sortChapters, isSkippable, md, slugify, bodyWithoutTitle, type ChapterMeta } from '@/lib/reader/markdown';
import Reader from '@/components/Reader';
import LibrarySheet from '@/components/LibrarySheet';
import {
  putHandle, getHandle, putNovel, listNovels, persist,
  type StoredNovel, type StoredChapter
} from '@/lib/library';
import { SAMPLE_NOVEL, SAMPLE_ID } from '@/lib/sample-novel';
import { runTour, tourSeen } from '@/lib/tour';

type Item = ChapterMeta & { file: string };

/** A stored novel becomes reader items without touching disk again. */
const toItems = (n: StoredNovel): Item[] =>
  n.chapters
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(c => ({
      file: c.slug, title: c.title, order: c.ordinal,
      body: c.body, excerpt: '', words: c.words
    }));

async function fromHandle(dir: any): Promise<Item[]> {
  const files: { file: string; handle: any }[] = [];
  const walk = async (d: any, prefix = '') => {
    for await (const [name, h] of d.entries()) {
      if (h.kind === 'directory') { if (!name.startsWith('.')) await walk(h, `${prefix}${name}/`); }
      else if (/\.md$/i.test(name) && !isSkippable(name)) files.push({ file: prefix + name, handle: h });
    }
  };
  await walk(dir);
  return Promise.all(files.map(async f => ({ file: f.file, ...chapterMeta(f.file, await (await f.handle.getFile()).text()) })));
}

export default function LocalLibrary() {
  const [items, setItems] = useState<Item[]>([]);
  const [i, setI] = useState(0);
  const [label, setLabel] = useState('');
  const [nav, setNav] = useState(false);
  const [err, setErr] = useState('');
  const [lib, setLib] = useState(false);
  const [novelId, setNovelId] = useState<string | undefined>();
  const input = useRef<HTMLInputElement>(null);

  /** Load into the reader AND keep a copy, so the next visit needs no folder at all. */
  const load = useCallback(async (list: Item[], name: string, remember = true) => {
    if (!list.length) { setErr('No .md files found in that folder.'); return; }
    const sorted = sortChapters(list);
    setErr(''); setItems(sorted); setLabel(name); setI(0);
    if (!remember) return;
    try {
      setNovelId(slugify(name) || 'library');
      await putNovel({
        id: slugify(name) || 'library',
        title: name,
        addedAt: Date.now(),
        chapters: sorted.map((c, k) => ({
          slug: slugify(c.title) || `chapter-${k + 1}`,
          title: c.title, ordinal: c.order ?? k + 1, body: c.body, words: c.words
        }))
      });
      await persist();
    } catch { /* the reader still works; persistence is a bonus */ }
  }, []);

  /* On return: prefer the saved copy (works offline, no permission prompt).
     First ever visit gets the bundled sample story, so there's something to read
     before anyone owns a folder of markdown — and something for the tour to point at. */
  useEffect(() => {
    (async () => {
      try {
        let saved = await listNovels();
        if (!saved.length && localStorage.getItem('nr:sample') !== 'removed') {
          await putNovel({
            id: SAMPLE_NOVEL.id,
            title: SAMPLE_NOVEL.title,
            author: SAMPLE_NOVEL.author,
            addedAt: Date.now(),
            chapters: SAMPLE_NOVEL.chapters.map(c => ({
              ...c,
              words: c.body.trim().split(/\s+/).filter(Boolean).length
            }))
          });
          saved = await listNovels();
        }
        if (saved.length) {
          const n = saved.sort((a, b) => b.addedAt - a.addedAt)[0];
          setNovelId(n.id);
          void load(toItems(n), n.title, false);
          if (!tourSeen()) setTimeout(() => void runTour(), 1200);
          return;
        }
      } catch { /* fall through to the folder handle */ }
      const h = await getHandle().catch(() => null);
      if (h && (await h.queryPermission({ mode: 'read' })) === 'granted')
        void load(await fromHandle(h), h.name);
    })();
  }, [load]);

  const pick = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dir = await (window as any).showDirectoryPicker({ id: 'novels', mode: 'read' });
        await putHandle(dir);
        void load(await fromHandle(dir), dir.name);
      } catch (e: any) { if (e.name !== 'AbortError') setErr(e.message); }
    } else input.current?.click();   // Firefox / Safari
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const list = await Promise.all(
      [...files]
        .filter(f => /\.md$/i.test(f.name) && !isSkippable(f.name))
        .map(async f => {
          const path = (f as any).webkitRelativePath || f.name;
          return { file: path, ...chapterMeta(path, await f.text()) };
        })
    );
    void load(list, [...files][0]?.webkitRelativePath?.split('/')[0] || 'Local folder');
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const out: Item[] = [];
    const walk = async (entry: any, prefix = ''): Promise<void> => {
      if (entry.isFile) {
        if (!/\.md$/i.test(entry.name) || isSkippable(entry.name)) return;
        const file: File = await new Promise(r => entry.file(r));
        out.push({ file: prefix + entry.name, ...chapterMeta(entry.name, await file.text()) });
      } else if (entry.isDirectory) {
        const rd = entry.createReader();
        const batch = (): Promise<any[]> => new Promise(r => rd.readEntries(r));
        for (let b = await batch(); b.length; b = await batch())
          for (const x of b) await walk(x, `${prefix}${entry.name}/`);
      }
    };
    await Promise.all([...e.dataTransfer.items].map(x => x.webkitGetAsEntry?.()).filter(Boolean).map(x => walk(x)));
    void load(out, 'Dropped folder');
  };

  if (!items.length) {
    return (
      <main className="empty">
        <h1 className="display">Open a folder</h1>
        <p className="body dim">
          Point the reader at any folder of <code>.md</code> chapters. Nothing uploads —
          the files stay on your device.
        </p>
        <div
          className="drop"
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
        >
          <button className="btn" data-variant="primary" onClick={pick}>Choose folder</button>
          <p className="caption">…or drop one here</p>
          <input
            ref={input} type="file" hidden multiple
            // @ts-expect-error non-standard but required for the Firefox/Safari path
            webkitdirectory="" directory=""
            onChange={e => onFiles(e.target.files)}
          />
        </div>
        {err && <p className="caption err">{err}</p>}

        <style jsx>{`
          .empty { max-width: 32rem; margin: 0 auto; padding: 18vh 1.5rem 4rem; }
          .dim { color: var(--ink-dim); }
          .drop {
            margin-top: 2rem; padding: 2.5rem 1.5rem; text-align: center;
            border: 1px dashed var(--rule); border-radius: 1rem;
            display: grid; gap: 0.75rem; justify-items: center;
            transition: border-color var(--quick), background-color var(--quick);
          }
          .drop:hover { border-color: color-mix(in oklab, var(--accent) 40%, var(--rule)); }
          .err { color: #e0725f; margin-top: 1rem; }
          code { font-family: ui-monospace, monospace; font-size: 0.9em; }
        `}</style>
      </main>
    );
  }

  const ch = items[i];
  return (
    <div className="shell">
      <aside className={nav ? 'open' : ''}>
        <div className="lib">
          <p className="caption">{label}</p>
          <button className="btn libbtn" data-variant="ghost" onClick={() => setLib(true)}>Library</button>
        </div>
        <ol>
          {items.map((c, k) => (
            <li key={c.file}>
              <button
                className={k === i ? 'current' : ''}
                onClick={() => { setI(k); setNav(false); }}
              >
                <span className="caption mono">{String(k + 1).padStart(2, '0')}</span>
                <span>{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <LibrarySheet
        open={lib}
        onClose={() => setLib(false)}
        activeId={novelId}
        onOpenNovel={n => { setNovelId(n.id); void load(toItems(n), n.title, false); }}
        onPickFolder={pick}
        onReplaceChapters={(chapters: StoredChapter[]) => {
          // editing the novel you're reading updates the page under you
          void load(toItems({ id: novelId!, title: label, addedAt: 0, chapters }), label, false);
        }}
      />

      <main>
        <button className="icon-btn menu chrome" onClick={() => setNav(v => !v)} aria-label="Chapters">☰</button>
        <Reader
          html={md(bodyWithoutTitle(ch.body))}
          title={ch.title}
          subtitle={`${label} · ${ch.words.toLocaleString()} words`}
          chapterKey={ch.file}
        />
      </main>

      <style jsx>{`
        /* Sidebar is anchored to the viewport edge — centring the whole shell floated
           it off the left and read as broken. The reading column does the centring,
           inside main, which is what the eye actually wants aligned. */
        .shell {
          display: grid; grid-template-columns: 16rem minmax(0, 1fr);
          min-height: 100dvh;
        }
        @media (min-width: 100rem) { .shell { grid-template-columns: 18rem minmax(0, 1fr); } }
        aside {
          position: sticky; top: 0; height: 100dvh; overflow-y: auto;
          border-inline-end: 1px solid var(--rule);
          padding: 1rem 0.75rem 6rem;
          background: color-mix(in oklab, var(--paper) 96%, var(--ink));
        }
        .lib { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: 0 .35rem .75rem; }
        aside ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
        aside button {
          width: 100%; text-align: start; display: flex; gap: 0.6rem; align-items: baseline;
          background: transparent; border: 0; color: var(--ink-dim);
          font: inherit; font-size: 0.85rem; padding: 0.5rem 0.55rem;
          border-radius: 0.5rem; cursor: pointer;
          transition: color var(--quick), background-color var(--quick);
        }
        aside button:hover { color: var(--ink); background: color-mix(in oklab, var(--ink) 5%, transparent); }
        aside button.current { color: var(--accent); background: color-mix(in oklab, var(--accent) 10%, transparent); }
        main { position: relative; min-width: 0; }
        .menu { display: none; position: fixed; top: 1rem; left: 1rem; z-index: 45; }
        @media (max-width: 860px) {
          .shell { grid-template-columns: 1fr; }
          aside {
            position: fixed; inset: 0 auto 0 0; width: min(84vw, 20rem); z-index: 50;
            transform: translateX(-100%); transition: transform var(--settle);
            box-shadow: 0 0 60px #0007;
          }
          aside.open { transform: none; }
          .menu { display: grid; }
        }
      `}</style>
    </div>
  );
}
