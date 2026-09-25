'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UploadFile } from '@/lib/publish';
import { isSkippable, chapterMeta, sortChapters, slugify } from '@/lib/reader/markdown';
import { can } from '@/lib/mode';
import { putNovel, persist } from '@/lib/library';
import { localNovelHref } from '@/lib/routes';
import Icon from '@/components/Icon';
import { toast } from '@/components/Toaster';

export default function Publish() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isPublic, setPublic] = useState(true);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const take = async (list: FileList | null) => {
    if (!list) return;
    setErr('');
    const out = await Promise.all(
      [...list]
        .filter(f => /\.md$/i.test(f.name) && !isSkippable(f.name))
        .map(async f => ({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, text: await f.text() }))
    );
    if (!out.length) { setErr('No markdown chapters in that selection — chapters need to be .md files.'); return; }
    setFiles(out);
    if (!title && out[0]) setTitle(out[0].name.split('/')[0].replace(/\.md$/i, '').replace(/[-_]/g, ' '));
  };

  // Same button, two destinations. With a server behind it the novel goes to Supabase
  // and gets a public URL; on a static host it goes into the reader's own library.
  const submit = () =>
    start(async () => {
      setErr('');
      if (!title.trim()) { setErr('Give the book a title first.'); return; }
      if (!can.cloudPublishing) {
        try {
          const parsed = sortChapters(files.map(f => ({ file: f.name, ...chapterMeta(f.name, f.text) })));
          const id = slugify(title) || 'untitled';
          await putNovel({
            id, title: title.trim(), author: author.trim() || undefined, addedAt: Date.now(),
            chapters: parsed.map((c, i) => ({
              slug: slugify(c.title) || `chapter-${i + 1}`,
              title: c.title, ordinal: c.order ?? i + 1, body: c.body, words: c.words
            }))
          });
          await persist();
          toast({ message: `Added “${title.trim()}” — ${parsed.length} chapters.`, tone: 'ok' });
          router.push(localNovelHref(id));
        } catch {
          setErr('This browser is blocking on-device storage, so the book couldn’t be saved.');
        }
        return;
      }
      // The Supabase client is only needed here — loaded on the click, not with the page.
      const { publishNovel } = await import('@/lib/publish');
      const r = await publishNovel({ title, author, isPublic, files });
      if ('error' in r && r.error) setErr(r.error);
      else if ('slug' in r) router.push(`/n/${r.slug}`);
    });

  const words = files.reduce((s, f) => s + (f.text.trim().split(/\s+/).length || 0), 0);

  return (
    <main className="wrap narrow">
      <nav className="backline" aria-label="Breadcrumb">
        <Link href="/library" className="btn" data-variant="ghost" data-size="sm"><Icon name="back" size={16} /> Library</Link>
      </nav>

      <p className="eyebrow">{can.cloudPublishing ? 'Publish' : 'Import'}</p>
      <h1 className="display">{can.cloudPublishing ? 'Publish a novel' : 'Add a novel'}</h1>
      <p className="lede">
        Choose a folder of markdown chapters. Titles, order and word counts come from the
        files themselves — there’s no form to fill in.
        {!can.cloudPublishing && ' It goes straight into your library on this device.'}
      </p>

      <div
        className="drop"
        data-over={over || undefined}
        data-has={files.length > 0 || undefined}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }}
      >
        <span className="glyph"><Icon name={files.length ? 'check' : 'folder'} size={26} /></span>
        {files.length ? (
          <>
            <p className="title-3">{files.length} chapters ready</p>
            <p className="caption">{words.toLocaleString()} words · choose again to replace</p>
          </>
        ) : (
          <>
            <p className="title-3">Drop a folder here</p>
            <p className="caption">or pick one — only .md files are read, nothing is uploaded{can.cloudPublishing ? ' until you publish' : ''}.</p>
          </>
        )}
        <button className="btn" data-variant={files.length ? undefined : 'primary'} onClick={() => input.current?.click()}>
          <Icon name="folder" size={17} /> {files.length ? 'Choose another folder' : 'Choose folder'}
        </button>
        <input
          ref={input} type="file" hidden multiple accept=".md,text/markdown"
          // @ts-expect-error non-standard, needed for folder selection
          webkitdirectory="" directory=""
          onChange={e => void take(e.target.files)}
        />
      </div>

      {err && (
        <p className="alert" data-tone="err" role="alert"><Icon name="alert" size={18} /><span className="grow">{err}</span></p>
      )}

      {files.length > 0 && (
        <form className="form" onSubmit={e => { e.preventDefault(); submit(); }}>
          <label className="field">
            <span className="label">Title</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Derived from the folder" required />
          </label>
          <label className="field">
            <span className="label">Author</span>
            <input className="input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Optional" />
          </label>
          {/* Only a server can make a novel public; without one the control would do nothing. */}
          {can.cloudPublishing && (
            <div className="pubrow">
              <span>
                <span className="body">Public</span>
                <span className="caption"> — indexable, shareable, readable by anyone</span>
              </span>
              <button type="button" className="switch" role="switch" aria-checked={isPublic} aria-label="Public" onClick={() => setPublic(v => !v)}><i /></button>
            </div>
          )}

          <details className="preview">
            <summary className="caption">Chapter files ({files.length})</summary>
            <ol>
              {files.slice(0, 40).map(f => <li key={f.name} className="caption mono">{f.name}</li>)}
              {files.length > 40 && <li className="caption">+{files.length - 40} more</li>}
            </ol>
          </details>

          <button className="btn" data-variant="primary" data-size="lg" type="submit" data-loading={pending || undefined}>
            {can.cloudPublishing ? 'Publish' : 'Add'} {files.length} chapters
          </button>
        </form>
      )}

      <style jsx>{`
        .narrow { max-width: 38rem; }
        .drop {
          margin: var(--s-6) 0; padding: var(--s-8) var(--s-6); text-align: center;
          border: 1.5px dashed var(--rule-strong); border-radius: var(--r-xl); background: var(--surface);
          display: grid; gap: var(--s-3); justify-items: center;
          transition: border-color var(--dur-2), background-color var(--dur-2), transform var(--dur-3) var(--ease-spring);
        }
        .drop[data-over] { border-color: var(--accent); background: var(--accent-soft); transform: scale(1.01); }
        .drop[data-has] { border-style: solid; }
        .drop p { margin: 0; }
        .drop :global(.btn) { margin-top: var(--s-3); }
        .glyph { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; border-radius: var(--r-lg); background: var(--fill); color: var(--ink-2); margin-bottom: var(--s-2); }
        .drop[data-has] .glyph { background: var(--ok-bg); color: var(--ok); }
        .form { display: grid; gap: var(--s-5); margin-top: var(--s-6); }
        .pubrow { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); }
        .preview summary { cursor: pointer; padding: var(--s-2) 0; }
        .preview ol { list-style: none; padding: 0; margin: var(--s-2) 0 0; display: grid; gap: var(--s-1); max-height: 14rem; overflow: auto; }
        .form :global(.btn[type='submit']) { justify-self: start; }
        @media (max-width: 40rem) { .form :global(.btn[type='submit']) { justify-self: stretch; } }
      `}</style>
    </main>
  );
}
