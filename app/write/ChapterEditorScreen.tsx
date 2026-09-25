'use client';
// The chapter editor. One screen, two jobs — writing a new chapter and rewriting an
// existing one — because they are the same act with different starting text.
//
// Writing wants the whole window and the page's own scrollbar, not a panel with an
// inner one: the body textarea grows to fit its content and the *page* scrolls.
//
// Controls live in the chrome — the bar at the top, the formatting strip (at the thumb
// on a phone) — and the page is only title and text. While you type, the chrome dims;
// move the pointer and it's back.
//
// Saving is automatic. Done is a way out, not the thing that keeps the work.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import Icon, { type IconName } from '@/components/Icon';
import Menu from '@/components/Menu';
import Shortcuts from '@/components/Shortcuts';
import { toast } from '@/components/Toaster';
import { getNovel, notifyChanged, putNovel, type StoredNovel } from '@/lib/library';
import {
  chapterLabel, countWords, draftSlug, orderedChapters, readingMinutes,
  removeChapter, upsertChapter
} from '@/lib/chapters';
import { md } from '@/lib/reader/markdown';
import { NEW_CHAPTER, chapterEditHref, localChapterHref, localNovelHref } from '@/lib/routes';
import { isMac } from '@/lib/ui';

type Status = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

/** How long after the last keystroke a save fires. Long enough not to write on every
 *  letter, short enough that closing the laptop mid-sentence still keeps the sentence. */
const IDLE_MS = 900;

function savedAgo(at: number, now: number): string {
  const s = Math.round((now - at) / 1000);
  if (s < 5) return 'Saved';
  if (s < 60) return `Saved ${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m} min ago`;
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
  const [ask, setAsk] = useState<null | { kind: 'leave'; to: string } | { kind: 'delete' }>(null);
  const [preview, setPreview] = useState(false);
  const [typing, setTyping] = useState(false);
  const [keys, setKeys] = useState(false);
  const [mac, setMac] = useState(true);

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

  useEffect(() => setMac(isMac()), []);

  /* ---- load ----
     Runs per chapter. When the URL changes only because this draft just got its slug
     (the replace after a first save), the text on screen is already the truth — reloading
     would overwrite anything typed while the save was in flight. */
  useEffect(() => {
    if (!novelId) { setPhase('missing'); return; }
    if (param !== NEW_CHAPTER && param === slug.current && novel?.id === novelId && phase === 'ready') return;
    let live = true;
    (async () => {
      try {
        const n = await getNovel(novelId);
        if (!live) return;
        if (!n) { setPhase('missing'); return; }
        setNovel(n);
        if (param === NEW_CHAPTER) {
          slug.current = ''; setTitle(''); setBody('');
        } else {
          const c = n.chapters.find(x => x.slug === param);
          if (!c) { setPhase('missing'); return; }
          slug.current = c.slug; setTitle(c.title); setBody(c.body);
        }
        rev.current = 0;
        setStatus('clean'); setPreview(false);
        setPhase('ready');
        window.scrollTo(0, 0);
      } catch { if (live) setPhase('missing'); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* Autosave on idle. */
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

  /* Chrome dims while typing, and comes back the moment the pointer moves. */
  useEffect(() => {
    if (!typing) return;
    const wake = () => setTyping(false);
    window.addEventListener('pointermove', wake, { once: true });
    return () => window.removeEventListener('pointermove', wake);
  }, [typing]);

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

  const sceneBreak = () => {
    const el = area.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertText', false, '\n\n* * *\n\n');
    setBody(el.value);
  };

  /* ---- leaving / moving between chapters ---- */
  const back = localNovelHref(novelId);

  const leave = useCallback(async (to: string) => {
    if (timer.current) clearTimeout(timer.current);
    // Autosave means there is almost never anything to lose. The one moment there is,
    // is a save that already failed — so that is the only time we stop and ask.
    if (status === 'dirty' || status === 'saving') {
      const ok = await save();
      if (!ok) { setAsk({ kind: 'leave', to }); return; }
    } else if (status === 'error') {
      setAsk({ kind: 'leave', to });
      return;
    }
    router.push(to);
  }, [status, save, router]);

  const chapters = novel ? orderedChapters(novel) : [];
  const index = slug.current ? chapters.findIndex(c => c.slug === slug.current) : -1;
  const number = index >= 0 ? index : chapters.length;
  const prevCh = index > 0 ? chapters[index - 1] : index < 0 ? chapters[chapters.length - 1] : undefined;
  const nextCh = index >= 0 ? chapters[index + 1] : undefined;

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (meta && k === 's') { e.preventDefault(); void save(); return; }
      if (meta && k === 'b') { e.preventDefault(); edit(() => wrap('**')); return; }
      if (meta && k === 'i') { e.preventDefault(); edit(() => wrap('*')); return; }
      if (meta && k === 'k') { e.preventDefault(); edit(link); return; }
      if (meta && e.key === 'Enter') { e.preventDefault(); void leave(back); return; }
      if (e.altKey && k === 'p') { e.preventDefault(); setPreview(p => !p); return; }
      if (e.altKey && e.key === 'ArrowUp' && prevCh) { e.preventDefault(); void leave(chapterEditHref(novelId, prevCh.slug)); return; }
      if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); void leave(chapterEditHref(novelId, nextCh?.slug ?? NEW_CHAPTER)); return; }
      if (e.key === 'Escape') { e.preventDefault(); if (preview) setPreview(false); else void leave(back); return; }
      if (e.key === '?' && !(e.target as HTMLElement).matches('input, textarea')) { e.preventDefault(); setKeys(true); }
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
  useEffect(() => { grow(); }, [body, phase, preview, grow]);

  const words = useMemo(() => countWords(body), [body]);
  const chars = body.length;
  const previewHtml = useMemo(() => (preview ? md(body) : ''), [preview, body]);

  if (phase === 'loading')
    return (
      <main className="wrap" aria-busy="true">
        <span className="sr-only" role="status">Opening the editor…</span>
        <div style={{ maxWidth: 'var(--measure)', margin: '2rem auto', display: 'grid', gap: '1rem' }}>
          <span className="skel" style={{ width: '6rem', height: '0.7rem' }} />
          <span className="skel" style={{ width: '60%', height: '2.6rem', marginBottom: '1.5rem' }} />
          {[100, 97, 99, 55].map((w, i) => <span key={i} className="skel" style={{ width: `${w}%`, height: '1rem' }} />)}
        </div>
      </main>
    );

  if (phase === 'missing' || !novel)
    return (
      <main className="wrap">
        <div className="empty">
          <span className="glyph"><Icon name="file" size={26} /></span>
          <h1 className="title">That chapter isn’t here</h1>
          <p>It may have been deleted, or the link may point at a book that isn’t on this device.</p>
          <div className="actions">
            <Link href="/library" className="btn" data-variant="primary">Go to your library</Link>
          </div>
        </div>
      </main>
    );

  const statusText =
    status === 'saving' ? 'Saving…'
    : status === 'error' ? 'Not saved'
    : status === 'dirty' ? 'Edited'
    : status === 'saved' ? savedAgo(savedAt, now)
    : slug.current ? 'Saved' : 'Draft';
  const statusIcon: IconName | null = status === 'error' ? 'alert' : status === 'saved' || (status === 'clean' && slug.current) ? 'check' : null;
  const mod = mac ? '⌘' : 'Ctrl';
  const alt = mac ? '⌥' : 'Alt';

  const tools: { icon: IconName; label: string; key?: string; run: () => void }[] = [
    { icon: 'bold', label: 'Bold', key: `${mod} B`, run: () => edit(() => wrap('**')) },
    { icon: 'italic', label: 'Italic', key: `${mod} I`, run: () => edit(() => wrap('*')) },
    { icon: 'heading', label: 'Heading', run: () => edit(() => prefixLines('## ')) },
    { icon: 'quote', label: 'Quote', run: () => edit(() => prefixLines('> ')) },
    { icon: 'bullets', label: 'List', run: () => edit(() => prefixLines('- ')) },
    { icon: 'link', label: 'Link', key: `${mod} K`, run: () => edit(link) },
    { icon: 'scene', label: 'Scene break', run: () => edit(sceneBreak) }
  ];

  return (
    <div className="screen" data-editor data-typing={typing || undefined}>
      <header className="bar chrome">
        <div className="l">
          <button className="icon-btn" onClick={() => void leave(back)} aria-label={`Back to ${novel.title}`} title={novel.title}>
            <Icon name="back" />
          </button>
          <label className="picker">
            <span className="sr-only">Chapter</span>
            <select
              className="select"
              value={slug.current || NEW_CHAPTER}
              onChange={e => void leave(chapterEditHref(novelId, e.target.value))}
            >
              {chapters.map((c, i) => <option key={c.slug} value={c.slug}>{i + 1}. {c.title}</option>)}
              {!slug.current && <option value={NEW_CHAPTER}>{chapters.length + 1}. {title.trim() || 'New chapter'}</option>}
              {slug.current && <option value={NEW_CHAPTER}>＋ New chapter</option>}
            </select>
          </label>
        </div>

        <p className="status" role="status" aria-live="polite" data-state={status}>
          {status === 'saving' && <span className="spin" aria-hidden />}
          {statusIcon && <Icon name={statusIcon} size={14} />}
          <span className="st">{statusText}</span>
          {status === 'error' && <button className="linkish" onClick={() => void save()}>Retry</button>}
        </p>

        <div className="r">
          <button className="icon-btn hide-sm" disabled={!prevCh} onClick={() => prevCh && void leave(chapterEditHref(novelId, prevCh.slug))}
                  aria-label="Previous chapter" title={`Previous chapter (${alt} ↑)`}>
            <Icon name="up" />
          </button>
          <button className="icon-btn hide-sm" onClick={() => void leave(chapterEditHref(novelId, nextCh?.slug ?? NEW_CHAPTER))}
                  aria-label={nextCh ? 'Next chapter' : 'New chapter'} title={`${nextCh ? 'Next chapter' : 'New chapter'} (${alt} ↓)`}>
            <Icon name={nextCh ? 'down' : 'plus'} />
          </button>
          <button className="icon-btn" aria-pressed={preview} onClick={() => setPreview(p => !p)}
                  aria-label={preview ? 'Back to writing' : 'Preview'} title={`Preview (${alt} P)`}>
            <Icon name={preview ? 'pen' : 'eye'} />
          </button>
          <Menu
            label="Chapter actions"
            items={[
              ...(slug.current ? [{ label: 'Read this chapter', icon: 'book' as const, onSelect: () => void leave(localChapterHref(novelId, slug.current)) }] : []),
              { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', onSelect: () => setKeys(true) },
              ...(slug.current ? ['sep' as const, { label: 'Delete chapter', icon: 'trash' as const, tone: 'danger' as const, onSelect: () => setAsk({ kind: 'delete' }) }] : [])
            ]}
          />
          <button className="btn done" data-variant="primary" data-size="sm" onClick={() => void leave(back)} title={`${mod} ↵`}>Done</button>
        </div>
      </header>

      {!preview && (
        <div className="tools chrome" role="toolbar" aria-label="Formatting">
          {tools.map((t, i) => (
            <span key={t.label} className="tw">
              {(i === 2 || i === 5) && <span className="sep" aria-hidden />}
              <button onMouseDown={e => e.preventDefault()} onClick={t.run} aria-label={t.label} title={t.key ? `${t.label} — ${t.key}` : t.label}>
                <Icon name={t.icon} size={18} />
              </button>
            </span>
          ))}
        </div>
      )}

      <main className="sheet">
        <p className="eyebrow">{chapterLabel(number)}<span className="of"> · {novel.title}</span></p>

        {preview ? (
          <>
            <h1 className="ctitle as-text">{title.trim() || 'Untitled chapter'}</h1>
            {body.trim()
              ? <article className="prose pv" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              : <p className="caption">Nothing written yet.</p>}
          </>
        ) : (
          <>
            <input
              className="ctitle"
              value={title}
              onChange={e => edit(() => setTitle(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); area.current?.focus(); } }}
              placeholder="Chapter title"
              aria-label="Chapter title"
              spellCheck
              autoFocus={!slug.current}
            />
            <textarea
              ref={area}
              className="cbody"
              value={body}
              onChange={e => edit(() => setBody(e.target.value))}
              onInput={grow}
              onKeyDown={() => setTyping(true)}
              placeholder="Start writing…"
              aria-label="Chapter text"
              spellCheck
            />
          </>
        )}
      </main>

      <footer className="counts caption mono" aria-label="Counts">
        <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
        <span>{chars.toLocaleString()} characters</span>
        {words > 0 && <span>{readingMinutes(words)} min read</span>}
      </footer>

      <Shortcuts
        open={keys}
        onClose={() => setKeys(false)}
        groups={[
          { name: 'Writing', items: [
            { keys: [mod, 'B'], label: 'Bold' }, { keys: [mod, 'I'], label: 'Italic' },
            { keys: [mod, 'K'], label: 'Link' }, { keys: [mod, 'S'], label: 'Save now' }
          ] },
          { name: 'Moving', items: [
            { keys: [alt, '↑'], label: 'Previous chapter' }, { keys: [alt, '↓'], label: 'Next / new chapter' },
            { keys: [alt, 'P'], label: 'Preview' }, { keys: [mod, '↵'], label: 'Done' }, { keys: ['Esc'], label: 'Back to the book' }
          ] }
        ]}
      />

      <ConfirmDialog
        open={ask?.kind === 'leave'}
        title="This chapter didn’t save"
        body="Your writing is still on screen. Leaving now loses the changes made since the last save."
        onDismiss={() => setAsk(null)}
        choices={[
          { label: 'Keep editing', onPick: () => setAsk(null), variant: 'primary' },
          { label: 'Try saving again', onPick: async () => { const to = ask?.kind === 'leave' ? ask.to : back; setAsk(null); if (await save()) router.push(to); } },
          { label: 'Discard and leave', onPick: () => { const to = ask?.kind === 'leave' ? ask.to : back; setAsk(null); setStatus('clean'); router.push(to); }, variant: 'danger' }
        ]}
      />

      <ConfirmDialog
        open={ask?.kind === 'delete'}
        title={`Delete “${title.trim() || 'this chapter'}”?`}
        body="The text is removed from this device. You’ll have a few seconds to undo."
        onDismiss={() => setAsk(null)}
        choices={[
          { label: 'Keep it', onPick: () => setAsk(null), variant: 'primary' },
          {
            label: 'Delete chapter',
            variant: 'danger',
            onPick: async () => {
              setAsk(null);
              if (timer.current) clearTimeout(timer.current);
              const before = upsertChapter(novel, { slug: slug.current, title, body });
              try {
                await putNovel(removeChapter(before, slug.current));
                setStatus('clean');
                router.push(back);
                toast({
                  message: `Deleted “${title.trim() || 'Untitled chapter'}”`,
                  action: { label: 'Undo', onClick: async () => { await putNovel(before); notifyChanged(); } }
                });
              } catch { setStatus('error'); }
            }
          }
        ]}
      />

      <style jsx>{`
        .screen { min-height: 100dvh; display: flex; flex-direction: column; }

        .bar {
          position: sticky; top: 0; z-index: var(--z-crumb);
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--s-4);
          height: calc(3.5rem + env(safe-area-inset-top, 0px));
          padding: env(safe-area-inset-top, 0px) max(var(--s-3), env(safe-area-inset-right)) 0 max(var(--s-3), env(safe-area-inset-left));
          box-shadow: 0 1px 0 var(--rule);
          transition: opacity var(--dur-4) var(--ease-out);
        }
        .l, .r { display: flex; align-items: center; gap: var(--s-1); min-width: 0; }
        .r { justify-content: flex-end; }
        .picker { min-width: 0; max-width: 18rem; flex: 1 1 auto; }
        .picker :global(.select) { width: 100%; background-color: transparent; font-weight: 500; text-overflow: ellipsis; }
        .picker :global(.select:hover) { background-color: var(--fill); }
        .r :global(.done) { margin-left: var(--s-2); }

        .status {
          margin: 0; display: inline-flex; align-items: center; gap: var(--s-2);
          font-size: var(--t-caption); color: var(--ink-3); white-space: nowrap;
          padding: 0.25rem 0.7rem; border-radius: var(--r-round); background: var(--fill);
        }
        .status[data-state='saved'], .status[data-state='clean'] { color: var(--ink-3); }
        .status[data-state='saved'] :global(svg), .status[data-state='clean'] :global(svg) { color: var(--ok); }
        .status[data-state='dirty'] { color: var(--ink-2); }
        .status[data-state='error'] { color: var(--err); background: var(--err-bg); }
        .spin {
          width: 0.75rem; height: 0.75rem; border-radius: var(--r-round);
          border: 1.5px solid var(--ink-3); border-right-color: transparent; animation: spin 700ms linear infinite;
        }

        .tools {
          position: sticky; top: calc(3.5rem + env(safe-area-inset-top, 0px)); z-index: var(--z-sticky);
          display: flex; justify-content: center; align-items: center; gap: 2px;
          padding: var(--s-2) var(--s-4); box-shadow: 0 1px 0 var(--rule);
          transition: opacity var(--dur-4) var(--ease-out);
        }
        .tw { display: inline-flex; align-items: center; }
        .tools button {
          display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: var(--r-sm); border: 0;
          background: none; color: var(--ink-2); cursor: pointer;
          transition: color var(--dur-2), background-color var(--dur-2), transform var(--dur-1) var(--ease-spring);
        }
        .tools button:hover { color: var(--ink); background: var(--fill); }
        .tools button:active { background: var(--fill-2); transform: scale(0.92); }
        .sep { width: 1px; height: 1.1rem; background: var(--rule-strong); margin: 0 var(--s-3); }

        /* Writing: the chrome steps back, never away — it's still there to find. */
        .screen[data-typing] .bar, .screen[data-typing] .tools { opacity: 0.28; }
        .screen[data-typing] .bar:focus-within, .screen[data-typing] .tools:focus-within { opacity: 1; }

        .sheet {
          flex: 1; width: 100%; max-width: calc(var(--measure) + 2 * var(--gutter));
          margin-inline: auto; padding: clamp(var(--s-7), 7vw, var(--s-9)) var(--gutter) 12rem;
          display: flex; flex-direction: column;
        }
        .sheet .eyebrow { margin-bottom: var(--s-4); }
        .of { color: var(--ink-3); font-weight: 500; letter-spacing: 0.08em; }

        /* Title and body are the page. No boxes, no rounded inputs — a border here
           would make writing a chapter feel like filling in a form. */
        .ctitle {
          background: none; border: 0; outline: none; padding: 0; width: 100%; margin: 0 0 var(--s-6);
          color: var(--ink); font-family: var(--font-serif); font-weight: 500;
          font-size: clamp(1.9rem, 1.3rem + 2.4vw, 2.75rem);
          line-height: 1.1; letter-spacing: -0.022em; font-optical-sizing: auto;
        }
        .ctitle::placeholder { color: var(--ink-4); }
        .ctitle:focus-visible { outline: none; }
        .cbody {
          background: none; border: 0; outline: none; padding: 0; width: 100%;
          resize: none; overflow: hidden;   /* it grows instead — the page scrolls */
          color: var(--ink); font-family: var(--prose-font);
          font-size: var(--prose); line-height: var(--prose-leading); letter-spacing: 0.002em;
          min-height: 50vh;
        }
        .cbody::placeholder { color: var(--ink-4); }
        .cbody:focus-visible { outline: none; }
        .pv { margin: 0; max-width: none; }

        .counts {
          position: fixed; left: var(--s-5); bottom: max(var(--s-4), env(safe-area-inset-bottom)); z-index: var(--z-sticky);
          display: flex; gap: var(--s-4); padding: var(--s-2) var(--s-4);
          border-radius: var(--r-round); background: var(--chrome); color: var(--ink-3);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 0 0 1px var(--rule);
          font-size: var(--t-micro);
        }

        @media (max-width: 40rem) {
          .bar { grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--s-2); }
          .picker { display: none; }
          .status { justify-self: center; max-width: 100%; overflow: hidden; }
          .st { overflow: hidden; text-overflow: ellipsis; }
          .bar :global(.hide-sm) { display: none; }
          .sheet { padding-bottom: 9rem; }
          /* Formatting moves to the thumb, and stays out of the prose. */
          .tools {
            position: fixed; top: auto; inset: auto 0 0 0; z-index: var(--z-nav);
            justify-content: space-around; gap: 0;
            padding: var(--s-1) var(--s-2) max(var(--s-1), env(safe-area-inset-bottom));
            box-shadow: 0 -1px 0 var(--rule);
          }
          .tools button { width: 2.75rem; height: 2.75rem; }
          .sep { display: none; }
          .counts { left: 50%; transform: translateX(-50%); bottom: calc(3.6rem + env(safe-area-inset-bottom, 0px)); }
          .counts span:nth-child(2) { display: none; }
        }
      `}</style>
    </div>
  );
}
