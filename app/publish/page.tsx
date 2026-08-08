'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { publishNovel, type UploadFile } from '@/lib/publish';
import { isSkippable, chapterMeta, sortChapters, slugify } from '@/lib/reader/markdown';
import { can } from '@/lib/mode';
import { putNovel, persist } from '@/lib/library';

export default function Publish() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isPublic, setPublic] = useState(true);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const take = async (list: FileList | null) => {
    if (!list) return;
    const out = await Promise.all(
      [...list]
        .filter(f => /\.md$/i.test(f.name) && !isSkippable(f.name))
        .map(async f => ({ name: (f as any).webkitRelativePath || f.name, text: await f.text() }))
    );
    setFiles(out);
    if (!title && out[0]) setTitle(out[0].name.split('/')[0].replace(/[-_]/g, ' '));
  };

  // Same button, two destinations. With a server behind it the novel goes to Supabase
  // and gets a public URL; on a static host it goes into the reader's own library.
  const submit = () =>
    start(async () => {
      setErr('');
      if (!can.cloudPublishing) {
        const parsed = sortChapters(files.map(f => ({ file: f.name, ...chapterMeta(f.name, f.text) })));
        const id = slugify(title) || 'untitled';
        await putNovel({
          id, title, author: author || undefined, addedAt: Date.now(),
          chapters: parsed.map((c, i) => ({
            slug: slugify(c.title) || `chapter-${i + 1}`,
            title: c.title, ordinal: c.order ?? i + 1, body: c.body, words: c.words
          }))
        });
        await persist();
        router.push('/read?library=1');
        return;
      }
      const r = await publishNovel({ title, author, isPublic, files });
      if ('error' in r && r.error) setErr(r.error);
      else if ('slug' in r) router.push(`/n/${r.slug}`);
    });

  return (
    <main className="wrap narrow">
      <h1 className="display">Publish a novel</h1>
      <p className="lede">
        Drop a folder of markdown chapters. Titles, order, excerpts, word counts, share
        cards and search metadata are all derived from the files — you don&apos;t fill in a form.
      </p>

      <div
        className="drop"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); take(e.dataTransfer.files); }}
      >
        <button className="btn" data-variant="primary" onClick={() => input.current?.click()}>
          Choose folder
        </button>
        <p className="caption">
          {files.length ? `${files.length} chapters ready` : '…or drop one here'}
        </p>
        <input
          ref={input} type="file" hidden multiple
          // @ts-expect-error non-standard, needed for folder selection
          webkitdirectory="" directory=""
          onChange={e => take(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <>
          <div className="fields">
            <label>
              <span className="caption">Title</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Derived from the folder" />
            </label>
            <label>
              <span className="caption">Author</span>
              <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Optional" />
            </label>
            <label className="row">
              <input type="checkbox" checked={isPublic} onChange={e => setPublic(e.target.checked)} />
              <span className="body">Public — indexable, shareable, readable by anyone</span>
            </label>
          </div>

          <ol className="preview">
            {files.slice(0, 8).map(f => <li key={f.name} className="caption mono">{f.name}</li>)}
            {files.length > 8 && <li className="caption">+{files.length - 8} more</li>}
          </ol>

          <button className="btn" data-variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Publishing…' : `Publish ${files.length} chapters`}
          </button>
        </>
      )}

      {err && <p className="caption err">{err}</p>}

      <style jsx>{`
        .narrow { max-width: 36rem; }
        .drop {
          margin: 2rem 0; padding: 2.5rem 1.5rem; text-align: center;
          border: 1px dashed var(--rule); border-radius: 1rem;
          display: grid; gap: 0.75rem; justify-items: center;
        }
        .fields { display: grid; gap: 1rem; margin-bottom: 1.5rem; }
        .fields label { display: grid; gap: 0.35rem; }
        .fields .row { display: flex; align-items: center; gap: 0.6rem; }
        .fields :global(input[type='text']), .fields input:not([type]) {
          background: transparent; border: 1px solid var(--rule); border-radius: 0.6rem;
          padding: 0.55rem 0.7rem; color: var(--ink); font: inherit;
        }
        .preview { list-style: none; padding: 0; margin: 0 0 1.5rem; display: grid; gap: 0.2rem; color: var(--ink-faint); }
        .err { color: #e0725f; margin-top: 1rem; }
      `}</style>
    </main>
  );
}
