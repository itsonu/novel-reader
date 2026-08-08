'use client';
// The chapter editor. One screen, two jobs — writing a new chapter and rewriting an
// existing one — because they are the same act with different starting text.
//
// It replaced a side drawer that sat over the novel page. A drawer was the wrong shape:
// writing wants the whole window and the page's own scrollbar, not a panel with an
// inner one. The body textarea grows to fit its content and the *page* scrolls, which
// is why there is no scroll box around the prose.
//
// Saving is automatic. The Done button is a way out, not the thing that keeps the work.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getNovel, putNovel, type StoredNovel } from '@/lib/library';
import {
  chapterLabel, countWords, draftSlug, orderedChapters, readingMinutes,
  removeChapter, upsertChapter
} from '@/lib/chapters';
import { NEW_CHAPTER, chapterEditHref, localNovelHref } from '@/lib/routes';

type Status = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

/** How long after the last keystroke a save fires. Long enough not to write on every
 *  letter, short enough that closing the laptop mid-sentence still keeps the sentence. */
const IDLE_MS = 900;

function savedAgo(at: number, now: number): string {
  const s = Math.round((now - at) / 1000);
  if (s < 5) return 'Saved';
  if (s < 60) return `Saved ${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m} minute${m === 1 ? '' : 's'} ago`;
  return `Saved at ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function ChapterEditorScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const novelId = params.get('novel') ?? '';
  const param = params.get('chapter') ?? NEW_CHAPTER;

  const [novel, setNovel] = useState<StoredNovel | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>('clean');
  const [savedAt, setSavedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [ask, setAsk] = useState<null | 'leave' | 'delete'>(null);

  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The slug this draft settled on. A new chapter has none until its first save, and
   *  once it has one it never changes — that slug is the chapter's URL. */
  const slug = useRef(param === NEW_CHAPTER ? '' : param);
  const latest = useRef({ title: '', body: '' });
  latest.current = { title, body };
  /** Bumped on every edit. A save that finishes after a newer keystroke must not
   *  report "Saved" — that would clear the dirty flag and the autosave would never
   *  fire again, so the last thing typed would be the one thing lost. */
  const rev = useRef(0);

  /* ---- load ---- */
  useEffect(() => {
    if (!novelId) { setPhase('missing'); return; }
    (async () => {
      try {
        const n = await getNovel(novelId);
        if (!n) { setPhase('missing'); return; }
        setNovel(n);
        if (param !== NEW_CHAPTER) {
          const c = n.chapters.find(x => x.slug === param);
          if (!c) { setPhase('missing'); return; }
          setTitle(c.title);
          setBody(c.body);
          slug.current = c.slug;
        }
        setPhase('ready');
      } catch { setPhase('missing'); }
    })();
  }, [novelId, param]);

  /* ---- save ---- */
  const save = useCallback(async (): Promise<boolean> => {
    const base = novel;
    if (!base) return false;
    const { title: t, body: b } = latest.current;
    // Never create a row for a chapter nobody has written yet — an accidental visit to
    // the editor should leave no trace in the novel.
    if (!slug.current && !t.trim() && !b.trim()) { setStatus('clean'); return true; }

    setStatus('saving');
    const at = rev.current;
    const isNew = !slug.current;
    if (isNew) slug.current = draftSlug(t, base.chapters.map(c => c.slug), Date.now());

    const next = upsertChapter(base, { slug: slug.current, title: t, body: b });
    try {
      await putNovel(next);
      setNovel(next);
      setSavedAt(Date.now());
      setNow(Date.now());
      // Typed again while this was in flight? Stay dirty so the next save picks it up.
      setStatus(rev.current === at ? 'saved' : 'dirty');
      // Put the real slug in the URL so a refresh reopens this chapter rather than a
      // second blank one. replace, not push — the blank draft is not a place to go back to.
      if (isNew) router.replace(chapterEditHref(base.id, slug.current));
      return true;
    } catch {
      if (isNew) slug.current = '';   // it never landed; don't claim the slug
      setStatus('error');
      return false;
    }
  }, [novel, router]);

  /* Autosave on idle. The ref dance keeps this from re-subscribing on every keystroke. */
  useEffect(() => {
    if (status !== 'dirty') return;
    timer.current = setTimeout(() => void save(), IDLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [status, save]);

  /* Last line of defence: a reload or tab close while a save is still pending. */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === 'dirty' || status === 'saving' || status === 'error') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  /* Tick only while there is a timestamp on screen to age. */
  useEffect(() => {
    if (status !== 'saved') return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [status]);

  const edit = (fn: () => void) => { fn(); rev.current += 1; setStatus('dirty'); };

  /* ---- formatting ----
     Every one of these goes through execCommand('insertText'). Assigning to
     textarea.value directly would wipe the browser's own undo stack, so one Cmd+Z
     after using the toolbar would throw away the whole chapter instead of the bold.
     That is also why there are no Undo/Redo buttons: the native ones still work. */
  const wrap = (before: string, after = before) => {
    const el = area.current;
    if (!el) return;
    el.focus();
    const sel = el.value.slice(el.selectionStart, el.selectionEnd);
    document.execCommand('insertText', false, `${before}${sel}${after}`);
    if (!sel) {
      const at = el.selectionStart - after.length;
      el.setSelectionRange(at, at);   // land the cursor between the marks
    }
    setBody(el.value);
  };

  const prefixLines = (mark: string) => {
    const el = area.current;
    if (!el) return;
    el.focus();
    const v = el.value;
    const from = v.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let to = v.indexOf('\n', el.selectionEnd);
    if (to === -1) to = v.length;
    const lines = v.slice(from, to).split('\n');
    const on = lines.every(l => l.startsWith(mark));   // pressing it again takes it off
    el.setSelectionRange(from, to);
    document.execCommand('insertText', false,
      lines.map(l => (on ? l.slice(mark.length) : mark + l)).join('\n'));
    setBody(el.value);
  };

  const link = () => {
    const el = area.current;
    if (!el) return;
    el.focus();
    const sel = el.value.slice(el.selectionStart, el.selectionEnd) || 'link text';
    const url = 'https://';
    document.execCommand('insertText', false, `[${sel}](${url})`);
    // Leave the address selected so typing replaces it.
    const end = el.selectionStart - 1;
    el.setSelectionRange(end - url.length, end);
    setBody(el.value);
  };

  /* ---- leaving ---- */
  const back = localNovelHref(novelId);

  const leave = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    // Autosave means there is almost never anything to lose. The one moment there is,
    // is a save that already failed — so that is the only time we stop and ask.
    if (status === 'dirty' || status === 'saving') {
      const ok = await save();
      if (!ok) { setAsk('leave'); return; }
    } else if (status === 'error') {
      setAsk('leave');
      return;
    }
    router.push(back);
  }, [status, save, router, back]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
      if (meta && e.key.toLowerCase() === 'b') { e.preventDefault(); edit(() => wrap('**')); return; }
      if (meta && e.key.toLowerCase() === 'i') { e.preventDefault(); edit(() => wrap('*')); return; }
      if (e.key === 'Escape' && !ask) { e.preventDefault(); void leave(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* Grow to fit. The page scrolls; the prose never sits in its own scroll box. */
  const grow = useCallback(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => { grow(); }, [body, phase, grow]);

  const words = useMemo(() => countWords(body), [body]);
  const chapters = novel ? orderedChapters(novel) : [];
  const index = slug.current ? chapters.findIndex(c => c.slug === slug.current) : -1;
  const number = index >= 0 ? index : chapters.length;

  if (phase === 'loading')
    return <main className="wrap"><p className="caption" aria-live="polite">Opening the editor…</p></main>;

  if (phase === 'missing' || !novel)
    return (
      <main className="wrap">
        <h1 className="display">That chapter isn&apos;t here</h1>
        <p className="lede">
          It may have been deleted, or the link may point at a book that isn&apos;t on
          this device.
        </p>
        <div className="cta">
          <Link href="/library" className="btn" data-variant="primary">Go to your library</Link>
        </div>
      </main>
    );

  const statusText =
    status === 'saving' ? 'Saving…'
    : status === 'error' ? 'Not saved'
    : status === 'dirty' ? 'Unsaved changes'
    : status === 'saved' ? savedAgo(savedAt, now)
    : 'No changes yet';

  return (
    <div className="screen">
      <header className="bar chrome">
        <button className="back" onClick={() => void leave()}>
          <span aria-hidden>‹</span> <span className="bt">{novel.title}</span>
        </button>

        <p className="status caption" role="status" aria-live="polite" data-state={status}>
          {status === 'error' && <span className="dot" aria-hidden />}
          {statusText}
        </p>

        <button className="btn" data-variant="primary" onClick={() => void leave()}>Done</button>
      </header>

      <main className="sheet">
        <p className="num caption mono">{chapterLabel(number).toUpperCase()}</p>

        <input
          className="ctitle"
          value={title}
          onChange={e => edit(() => setTitle(e.target.value))}
          placeholder="Chapter title"
          aria-label="Chapter title"
          spellCheck
        />

        <div className="tools" role="toolbar" aria-label="Formatting">
          <button onClick={() => edit(() => wrap('**'))} aria-label="Bold" title="Bold — Ctrl/Cmd B"><b>B</b></button>
          <button onClick={() => edit(() => wrap('*'))} aria-label="Italic" title="Italic — Ctrl/Cmd I"><i>I</i></button>
          <span className="sep" aria-hidden />
          <button onClick={() => edit(() => prefixLines('## '))} aria-label="Heading" title="Heading">H</button>
          <button onClick={() => edit(() => prefixLines('> '))} aria-label="Quote" title="Quote">&ldquo;</button>
          <button onClick={() => edit(() => prefixLines('- '))} aria-label="List" title="List">•</button>
          <span className="sep" aria-hidden />
          <button onClick={() => edit(link)} aria-label="Link" title="Link">↗</button>
        </div>

        <textarea
          ref={area}
          className="cbody"
          value={body}
          onChange={e => edit(() => setBody(e.target.value))}
          onInput={grow}
          placeholder="Start writing…"
          aria-label="Chapter text"
          spellCheck
        />

        <p className="count caption mono">
          {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
          {words > 0 && ` · ${readingMinutes(words)} min read`}
        </p>

        {slug.current && (
          <div className="danger-zone">
            <button className="btn danger" onClick={() => setAsk('delete')}>Delete this chapter</button>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={ask === 'leave'}
        title="This chapter didn’t save"
        body="Your writing is still on screen. Leaving now loses the changes made since the last save."
        onDismiss={() => setAsk(null)}
        choices={[
          { label: 'Keep editing', onPick: () => setAsk(null), variant: 'primary' },
          { label: 'Try saving again', onPick: async () => { setAsk(null); if (await save()) router.push(back); } },
          { label: 'Discard and leave', onPick: () => { setAsk(null); router.push(back); }, variant: 'danger' }
        ]}
      />

      <ConfirmDialog
        open={ask === 'delete'}
        title={`Delete “${title.trim() || 'this chapter'}”?`}
        body="The text is removed from this device. There is no undo."
        onDismiss={() => setAsk(null)}
        choices={[
          { label: 'Keep it', onPick: () => setAsk(null), variant: 'primary' },
          {
            label: 'Delete chapter',
            variant: 'danger',
            onPick: async () => {
              setAsk(null);
              if (timer.current) clearTimeout(timer.current);
              try {
                await putNovel(removeChapter(novel, slug.current));
                router.push(back);
              } catch { setStatus('error'); }
            }
          }
        ]}
      />

      <style jsx>{`
        .screen { min-height: 100dvh; display: flex; flex-direction: column; }

        .bar {
          position: sticky; top: 0; z-index: var(--z-crumb);
          display: flex; align-items: center; gap: var(--s-4);
          padding: var(--s-3) max(var(--s-5), env(safe-area-inset-left));
        }
        .back {
          display: flex; align-items: center; gap: var(--s-1);
          background: none; border: 0; cursor: pointer; font: inherit; font-size: 0.86rem;
          color: var(--ink-dim); padding: var(--s-2) var(--s-2) var(--s-2) 0;
          border-radius: var(--r-tight); min-width: 0;
        }
        .back:hover { color: var(--ink); }
        .back:focus-visible { outline: var(--focus); outline-offset: var(--focus-gap); }
        .bt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Centre column so the status sits under the writer's eye, not off in a corner. */
        .status {
          flex: 1; text-align: center; margin: 0;
          display: flex; align-items: center; justify-content: center; gap: var(--s-2);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .status[data-state='error'] { color: var(--err); }
        .status[data-state='saving'] { color: var(--ink-faint); }
        /* Colour is never the only signal — the words change too, and errors get a mark. */
        .dot { width: 0.45rem; height: 0.45rem; border-radius: var(--r-round); background: var(--err); flex: none; }

        .sheet {
          flex: 1; width: 100%; max-width: var(--measure);
          margin-inline: auto;
          padding: clamp(var(--s-6), 6vw, var(--s-8)) var(--s-5) 12rem;
          display: flex; flex-direction: column;
        }
        .num {
          text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.7rem;
          color: var(--accent); margin: 0 0 var(--s-4);
        }

        /* Title and body are the page. No boxes, no rounded inputs — a border here
           would make writing a chapter feel like filling in a form. */
        .ctitle {
          background: none; border: 0; outline: none; padding: 0; width: 100%;
          color: var(--ink); font-family: var(--serif);
          font-size: clamp(1.9rem, 1.3rem + 2.4vw, 2.7rem);
          line-height: 1.08; letter-spacing: -0.022em; font-weight: 600;
        }
        .ctitle::placeholder { color: var(--ink-faint); }
        .ctitle:focus-visible { outline: none; }

        .tools {
          display: flex; align-items: center; gap: var(--s-1);
          margin: var(--s-6) 0 var(--s-4);
          padding-bottom: var(--s-3);
          border-bottom: 1px solid var(--rule);
        }
        .tools button {
          width: 2rem; height: 2rem; border-radius: var(--r-tight); border: 0;
          background: none; color: var(--ink-dim); cursor: pointer;
          font: inherit; font-size: 0.95rem; line-height: 1;
          transition: color var(--quick), background-color var(--quick);
        }
        .tools button:hover { color: var(--ink); background: color-mix(in oklab, var(--ink) 8%, transparent); }
        .tools button:active { background: color-mix(in oklab, var(--ink) 14%, transparent); }
        .tools button:focus-visible { outline: var(--focus); outline-offset: -2px; }
        .sep { width: 1px; height: 1.1rem; background: var(--rule); margin: 0 var(--s-2); }

        .cbody {
          background: none; border: 0; outline: none; padding: 0; width: 100%;
          resize: none; overflow: hidden;   /* it grows instead — the page scrolls */
          color: var(--ink); font-family: var(--serif);
          font-size: var(--prose); line-height: 1.7; letter-spacing: 0.001em;
          min-height: 40vh;
        }
        .cbody::placeholder { color: var(--ink-faint); }

        .count { margin: var(--s-6) 0 0; color: var(--ink-faint); }
        .danger-zone { margin-top: var(--s-8); padding-top: var(--s-5); border-top: 1px solid var(--rule); }
        .danger { color: var(--err); }
        .danger:hover { border-color: var(--err); background: var(--err-bg); }

        @media (max-width: 40rem) {
          .sheet { padding-bottom: 8rem; }
          /* Formatting moves to the thumb, and stays out of the prose. */
          .tools {
            position: fixed; z-index: var(--z-nav); inset: auto 0 0 0;
            margin: 0; border-bottom: 0;
            justify-content: space-around;
            padding: var(--s-2) var(--s-3) max(var(--s-2), env(safe-area-inset-bottom));
            background: var(--chrome);
            backdrop-filter: blur(24px) saturate(180%);
            -webkit-backdrop-filter: blur(24px) saturate(180%);
            box-shadow: 0 -1px 0 color-mix(in oklab, var(--ink) 10%, transparent);
          }
          .tools button { width: 2.75rem; height: 2.75rem; font-size: 1.05rem; }
          .sep { display: none; }
        }
      `}</style>
    </div>
  );
}
