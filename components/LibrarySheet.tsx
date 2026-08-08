'use client';
import { useEffect, useState } from 'react';
import Sheet from './Sheet';
import { listNovels, putNovel, deleteNovel, usage, type StoredNovel, type StoredChapter } from '@/lib/library';
import { slugify } from '@/lib/reader/markdown';

type Props = {
  open: boolean;
  onClose: () => void;
  activeId?: string;
  onOpenNovel: (n: StoredNovel) => void;
  onPickFolder: () => void;
  onReplaceChapters: (chapters: StoredChapter[]) => void;
};

const bytes = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

export default function LibrarySheet({
  open, onClose, activeId, onOpenNovel, onPickFolder, onReplaceChapters
}: Props) {
  const [novels, setNovels] = useState<StoredNovel[]>([]);
  const [editing, setEditing] = useState<StoredNovel | null>(null);
  const [draft, setDraft] = useState<StoredChapter | null>(null);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);

  const refresh = async () => {
    setNovels((await listNovels()).sort((a, b) => b.addedAt - a.addedAt));
    setSpace(await usage());
  };
  useEffect(() => { if (open) void refresh(); }, [open]);

  const saveNovel = async (n: StoredNovel) => {
    await putNovel(n);
    setEditing(n);
    if (n.id === activeId) onReplaceChapters(n.chapters);
    await refresh();
  };

  const removeChapter = async (n: StoredNovel, slug: string) => {
    if (!confirm('Delete this chapter? This cannot be undone.')) return;
    await saveNovel({ ...n, chapters: n.chapters.filter(c => c.slug !== slug) });
  };

  const move = async (n: StoredNovel, i: number, dir: -1 | 1) => {
    const list = [...n.chapters];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await saveNovel({ ...n, chapters: list.map((c, k) => ({ ...c, ordinal: k + 1 })) });
  };

  const commitDraft = async () => {
    if (!editing || !draft) return;
    const title = draft.title.trim() || 'Untitled chapter';
    const slug = draft.slug || slugify(title) || `chapter-${editing.chapters.length + 1}`;
    const words = draft.body.trim().split(/\s+/).filter(Boolean).length;
    const exists = editing.chapters.some(c => c.slug === slug);
    const chapters = exists
      ? editing.chapters.map(c => (c.slug === slug ? { ...c, title, body: draft.body, words } : c))
      : [...editing.chapters, { slug, title, body: draft.body, words, ordinal: editing.chapters.length + 1 }];
    await saveNovel({ ...editing, chapters });
    setDraft(null);
  };

  const title = draft ? (draft.slug ? 'Edit chapter' : 'New chapter') : editing ? editing.title : 'Library';

  return (
    <Sheet open={open} onClose={() => { setDraft(null); setEditing(null); onClose(); }} title={title}>
      {(editing || draft) && (
        <button className="back" onClick={() => (draft ? setDraft(null) : setEditing(null))}>
          ‹ {draft ? editing?.title ?? 'Back' : 'Library'}
        </button>
      )}

      {/* ---- chapter editor ---- */}
      {draft && (
        <div className="editor">
          <label>
            <span className="caption">Title</span>
            <input
              value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Chapter title"
            />
          </label>
          <label>
            <span className="caption">Text — markdown</span>
            <textarea
              value={draft.body}
              onChange={e => setDraft({ ...draft, body: e.target.value })}
              rows={12}
              placeholder={'Write or paste the chapter.\n\n*Italics* and **bold** work.'}
            />
          </label>
          <div className="actions">
            <button className="btn" data-variant="primary" onClick={commitDraft}>Save chapter</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- chapters of one novel ---- */}
      {editing && !draft && (
        <>
          <ol className="chapters">
            {editing.chapters.map((c, i) => (
              <li key={c.slug}>
                <span className="num caption mono">{String(i + 1).padStart(2, '0')}</span>
                <button className="ctitle" onClick={() => setDraft({ ...c })}>
                  {c.title}
                  <span className="caption">{c.words.toLocaleString()} words</span>
                </button>
                <span className="rowbtns">
                  <button onClick={() => move(editing, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button onClick={() => move(editing, i, 1)} disabled={i === editing.chapters.length - 1} aria-label="Move down">↓</button>
                  <button onClick={() => removeChapter(editing, c.slug)} aria-label="Delete chapter">✕</button>
                </span>
              </li>
            ))}
          </ol>
          <div className="actions pad">
            <button
              className="btn" data-variant="primary"
              onClick={() => setDraft({ slug: '', title: '', body: '', words: 0, ordinal: 0 })}
            >
              Add chapter
            </button>
            <button className="btn" onClick={() => { onOpenNovel(editing); onClose(); }}>Read this</button>
          </div>
        </>
      )}

      {/* ---- novel list ---- */}
      {!editing && !draft && (
        <>
          <ul className="novels">
            {novels.map(n => (
              <li key={n.id}>
                <button className="nrow" onClick={() => { onOpenNovel(n); onClose(); }}>
                  <span className="ntext">
                    <span className="nname">{n.title}{n.id === activeId && <em> · reading</em>}</span>
                    <span className="caption">
                      {n.chapters.length} chapters · {n.chapters.reduce((s, c) => s + c.words, 0).toLocaleString()} words
                    </span>
                  </span>
                </button>
                <span className="rowbtns">
                  <button onClick={() => setEditing(n)} aria-label="Edit">✎</button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove “${n.title}” from this device?`)) return;
                      await deleteNovel(n.id); await refresh();
                    }}
                    aria-label="Remove"
                  >✕</button>
                </span>
              </li>
            ))}
            {!novels.length && <li className="empty caption">Nothing saved yet.</li>}
          </ul>

          <div className="actions pad">
            <button className="btn" data-variant="primary" onClick={() => { onPickFolder(); onClose(); }}>
              Add a folder
            </button>
            <button
              className="btn"
              onClick={async () => {
                const id = `untitled-${Date.now().toString(36)}`;
                const n: StoredNovel = { id, title: 'Untitled', addedAt: Date.now(), chapters: [] };
                await putNovel(n); await refresh(); setEditing(n);
              }}
            >
              Start blank
            </button>
          </div>

          {space && (
            <p className="caption pad space">
              {bytes(space.used)} used of {bytes(space.quota)} available on this device.
            </p>
          )}
        </>
      )}

      <style jsx>{`
        .back {
          display: block; background: transparent; border: 0; color: var(--ink-dim);
          font: inherit; font-size: 0.82rem; cursor: pointer; padding: 0.2rem 0.75rem 0.5rem;
        }
        .back:hover { color: var(--ink); }
        ul, ol { list-style: none; margin: 0; padding: 0; }
        li { display: flex; align-items: center; gap: 0.4rem; padding: 0 0.35rem; }
        .nrow, .ctitle {
          flex: 1; min-width: 0; text-align: start; background: transparent; border: 0;
          color: var(--ink); font: inherit; cursor: pointer; border-radius: 0.6rem;
          padding: 0.6rem 0.5rem; display: grid; gap: 0.1rem;
          transition: background-color var(--quick);
        }
        .nrow:hover, .ctitle:hover { background: color-mix(in oklab, var(--ink) 7%, transparent); }
        .nname { font-size: 0.94rem; }
        .nname em { color: var(--accent); font-style: normal; }
        .num { width: 1.6rem; text-align: end; color: var(--ink-faint); flex: none; }
        .rowbtns { display: flex; gap: 0.1rem; flex: none; }
        .rowbtns button {
          width: 1.9rem; height: 1.9rem; border-radius: 0.45rem; border: 0;
          background: transparent; color: var(--ink-dim); cursor: pointer; font-size: 0.85rem;
        }
        .rowbtns button:hover { background: color-mix(in oklab, var(--ink) 10%, transparent); color: var(--ink); }
        .rowbtns button:disabled { opacity: 0.3; cursor: default; }
        .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .pad { padding: 0.75rem; }
        .empty { padding: 1.25rem 0.75rem; }
        .space { color: var(--ink-faint); padding-top: 0; }
        .editor { display: grid; gap: 0.85rem; padding: 0.25rem 0.75rem 0.75rem; }
        .editor label { display: grid; gap: 0.3rem; }
        .editor :global(input), .editor :global(textarea) {
          background: color-mix(in oklab, var(--ink) 5%, transparent);
          border: 1px solid var(--rule); border-radius: 0.6rem;
          padding: 0.55rem 0.7rem; color: var(--ink); font: inherit; font-size: 0.9rem;
          width: 100%; resize: vertical;
        }
        .editor :global(textarea) {
          font-family: var(--serif); font-size: 0.95rem; line-height: 1.55; min-height: 9rem;
        }
      `}</style>
    </Sheet>
  );
}
