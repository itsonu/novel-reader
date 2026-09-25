'use client';
// The chapter editor: a page of the book with a pen in it.
//
// A route, not a panel — `/write?novel=<id>&chapter=<slug|new>` — so back, forward,
// refresh and a link to "the chapter I was writing" all behave. It shares the reader's
// type, measure and palette; only the chrome differs, and the chrome is kept to one bar
// on top (where am I, formatting, save, done) and one quiet line at the foot (where the
// neighbouring chapters are, how long this one is). While you type, both step back.
//
// Saving is automatic, and nothing typed is left behind by any way of leaving: the idle
// timer, the explicit Save, the chapter switcher, Done, the browser's own Back button
// (a pending save is flushed as the page goes), a tab close (the browser asks).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import Icon, { type IconName } from '@/components/Icon';
import Menu, { type MenuItem } from '@/components/Menu';
import Shortcuts from '@/components/Shortcuts';
import { toast } from '@/components/Toaster';
import { getNovel, notifyChanged, putNovel, type StoredNovel } from '@/lib/library';
import {
  countWords, draftSlug, orderedChapters, readingMinutes, removeChapter, upsertChapter
} from '@/lib/chapters';
import { md } from '@/lib/reader/markdown';
import { NEW_CHAPTER, chapterEditHref, chaptersHref, localChapterHref } from '@/lib/routes';
import { isMac, isTyping } from '@/lib/ui';

type Status = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

/** How long after the last keystroke a save fires. Long enough not to write on every
 *  letter, short enough that closing the laptop mid-sentence still keeps the sentence. */
const IDLE_MS = 900;

function savedAgo(at: number, now: number): string {
  const s = Math.round((now - at) / 1000);
  if (s < 10) return 'Saved';
  if (s < 60) return 'Saved just now';
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m} min ago`;
  return `Saved ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function ChapterEditorScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const novelId = params.get('novel') ?? '';
  const param = params.get('chapter') ?? NEW_CHAPTER;

  const [novel, setNovelState] = useState<StoredNovel | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraftFlag] = useState(false);
  const [status, setStatus] = useState<Status>('clean');
  const [savedAt, setSavedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [ask, setAsk] = useState<null | { kind: 'leave'; to: string } | { kind: 'delete' }>(null);
  const [preview, setPreview] = useState(false);
  const [typing, setTyping] = useState(false);
  const [focus, setFocus] = useState(false);
  const [keys, setKeys] = useState(false);
  const [mac, setMac] = useState(true);

  const area = useRef<HTMLTextAreaElement>(null);
  const titleEl = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The slug this draft settled on. A new chapter has none until its first save, and
   *  once it has one it never changes — that slug is the chapter's URL. */
  const slug = useRef(param === NEW_CHAPTER ? '' : param);
  const latest = useRef({ title: '', body: '', draft: false });
  latest.current = { title, body, draft };
  /** The novel as last written. A save reads this, not render state: two saves close
   *  together must each build on the other's result, not on the same stale copy. */
  const novelRef = useRef<StoredNovel | null>(null);
  const setNovel = (n: StoredNovel) => { novelRef.current = n; setNovelState(n); };
  /** Bumped on every edit. A save that finishes after a newer keystroke must not
   *  report "Saved" — that would clear the dirty flag and the autosave would never
   *  fire again, so the last thing typed would be the one thing lost. */
  const rev = useRef(0);
  const statusRef = useRef<Status>('clean');
  statusRef.current = status;

  useEffect(() => setMac(isMac()), []);

  /* ---- load ----
     Runs per chapter. When the URL changes only because this draft just got its slug
     (the replace after a first save), the text on screen is already the truth — reloading
     would overwrite anything typed while the save was in flight. */
  useEffect(() => {
    if (!novelId) { setPhase('missing'); return; }
    if (param !== NEW_CHAPTER && param === slug.current && novelRef.current?.id === novelId && phase === 'ready') return;
    let live = true;
    (async () => {
      try {
        // Arriving from another chapter in this same editor (Back/Forward, the switcher)
        // leaves this component mounted. Anything still pending belongs to the chapter
        // we're leaving: save it *before* slug and text switch over, or it's dropped —
        // or worse, an idle timer firing mid-switch writes it into the new chapter.
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (statusRef.current === 'dirty' || statusRef.current === 'saving') await saveRef.current();
        if (!live) return;
        const n = await getNovel(novelId);
        if (!live) return;
        if (!n) { setPhase('missing'); return; }
        setNovel(n);
        if (param === NEW_CHAPTER) {
          slug.current = ''; setTitle(''); setBody(''); setDraftFlag(false);
        } else {
          const c = n.chapters.find(x => x.slug === param);
          if (!c) { setPhase('missing'); return; }
          slug.current = c.slug; setTitle(c.title); setBody(c.body); setDraftFlag(Boolean(c.draft));
        }
        rev.current = 0;
        setStatus('clean'); setPreview(false); setSavedAt(0);
        setPhase('ready');
        window.scrollTo(0, 0);
      } catch { if (live) setPhase('missing'); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, param]);

  /* A blank chapter starts in its title; an existing one starts in its text. Done after
     the page is on screen — autoFocus on mount loses to the link that brought us here. */
  useEffect(() => {
    if (phase !== 'ready') return;
    const id = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.closest('.sheet')) return;
      if (!slug.current) titleEl.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [phase, param]);

  /* ---- save ---- */
  const save = useCallback(async (): Promise<boolean> => {
    const base = novelRef.current;
    if (!base) return false;
    const { title: t, body: b, draft: d } = latest.current;
    // Never create a row for a chapter nobody has written yet — an accidental visit to
    // the editor should leave no trace in the novel.
    if (!slug.current && !t.trim() && !b.trim()) { setStatus('clean'); return true; }

    setStatus('saving');
    const at = rev.current;
    const isNew = !slug.current;
    if (isNew) slug.current = draftSlug(t, base.chapters.map(c => c.slug), Date.now());

    const next = upsertChapter(base, { slug: slug.current, title: t, body: b, draft: d });
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
  }, [router]);
  const saveRef = useRef(save);
  saveRef.current = save;

  /* Autosave on idle. */
  useEffect(() => {
    if (status !== 'dirty') return;
    timer.current = setTimeout(() => void save(), IDLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [status, save]);

  /* Leaving by any door the app doesn't own — the browser's Back, a closed tab going to
     the background, a route change from the command palette — still keeps the words.
     IndexedDB writes outlive the component, so a fire-and-forget save is enough. */
  useEffect(() => {
    const flush = () => { if (statusRef.current === 'dirty') void saveRef.current(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  /* Last line of defence: a reload or tab close while a save is still pending. */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === 'dirty' || status === 'saving' || status === 'error') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  /* Age the timestamp only while one is on screen. */
  useEffect(() => {
    if (status !== 'saved') return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [status]);

  /* Chrome steps back while typing; the pointer brings it home. */
  useEffect(() => {
    if (!typing) return;
    const wake = () => setTyping(false);
    window.addEventListener('pointermove', wake, { once: true });
    return () => window.removeEventListener('pointermove', wake);
  }, [typing]);

  /* Focus mode: fullscreen where allowed; leaving fullscreen by Esc leaves the mode. */
  const toggleFocus = useCallback(async () => {
    const on = !focus;
    setFocus(on);
    try {
      if (on && document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* refused: the mode still clears the chrome */ }
    area.current?.focus();
  }, [focus]);
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFocus(false); };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

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

  /** A scene break sits on its own line with a blank line either side, wherever the
   *  cursor was — so it can't glue itself onto the end of a paragraph. */
  const sceneBreak = () => {
    const el = area.current;
    if (!el) return;
    el.focus();
    const v = el.value, at = el.selectionStart;
    const before = v.slice(0, at).replace(/\s*$/, '');
    const lead = before ? '\n\n' : '';
    el.setSelectionRange(before.length, el.selectionEnd);
    document.execCommand('insertText', false, `${lead}* * *\n\n`);
    setBody(el.value);
  };

  /* ---- leaving / moving between chapters ---- */
  const back = chaptersHref(novelId);

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
  // Position comes from the URL, which is right the instant a navigation starts — the
  // loaded slug lags until the next chapter arrives, and a second Alt+↓ pressed in that
  // gap would otherwise step from the chapter being left rather than the one arriving.
  const here = param !== NEW_CHAPTER ? param : slug.current;
  const index = here ? chapters.findIndex(c => c.slug === here) : -1;
  const position = index >= 0 ? index : chapters.length;          // 0-based
  const total = index >= 0 ? chapters.length : chapters.length + 1;
  const prevCh = index > 0 ? chapters[index - 1] : index < 0 ? chapters[chapters.length - 1] : undefined;
  const nextCh = index >= 0 ? chapters[index + 1] : undefined;
  const goPrev = () => { if (prevCh) void leave(chapterEditHref(novelId, prevCh.slug)); };
  const goNext = () => void leave(chapterEditHref(novelId, nextCh?.slug ?? NEW_CHAPTER));

  /* ---- keyboard ----
     Escape steps out of a mode (preview, focus) and never out of the page: a key that
     sits next to the one you meant should not be able to close your chapter. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (meta && k === 's') { e.preventDefault(); void save(); return; }
      if (meta && k === 'b' && !preview) { e.preventDefault(); edit(() => wrap('**')); return; }
      if (meta && k === 'i' && !preview) { e.preventDefault(); edit(() => wrap('*')); return; }
      if (meta && k === 'k' && !preview) { e.preventDefault(); edit(link); return; }
      if (meta && e.key === 'Enter') { e.preventDefault(); void leave(back); return; }
      if (e.altKey && (e.code === 'KeyP' || k === 'p')) { e.preventDefault(); setPreview(p => !p); return; }
      if (e.altKey && (e.code === 'KeyF' || k === 'f')) { e.preventDefault(); void toggleFocus(); return; }
      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); goPrev(); return; }
      if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); goNext(); return; }
      if (e.key === 'Escape') {
        if (preview) { e.preventDefault(); setPreview(false); }
        else if (focus && !document.fullscreenElement) { e.preventDefault(); setFocus(false); }
        return;
      }
      if (e.key === '?' && !isTyping(e)) { e.preventDefault(); setKeys(true); }
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
            {novelId && <Link href={chaptersHref(novelId)} className="btn" data-variant="primary">Back to the chapters</Link>}
            <Link href="/library" className="btn">Your library</Link>
          </div>
        </div>
      </main>
    );

  /* One control for both save state and the manual save: it says what's true, and when
     there is something to save, pressing it saves. */
  const saveLabel =
    status === 'saving' ? 'Saving…'
    : status === 'error' ? 'Retry save'
    : status === 'dirty' ? 'Save'
    : status === 'saved' ? savedAgo(savedAt, now)
    : slug.current ? 'Saved' : 'Not saved yet';
  const saveIcon: IconName | null = status === 'error' ? 'alert' : status === 'saved' || (status === 'clean' && slug.current) ? 'check' : null;
  const mod = mac ? '⌘' : 'Ctrl';
  const alt = mac ? '⌥' : 'Alt';
  const shownTitle = title.trim() || 'Untitled';

  const tools: { icon?: IconName; text?: string; label: string; key?: string; run: () => void }[] = [
    { icon: 'bold', label: 'Bold', key: `${mod} B`, run: () => edit(() => wrap('**')) },
    { icon: 'italic', label: 'Italic', key: `${mod} I`, run: () => edit(() => wrap('*')) },
    { icon: 'heading', label: 'Heading', run: () => edit(() => prefixLines('## ')) },
    { icon: 'quote', label: 'Quotation', run: () => edit(() => prefixLines('> ')) },
    { icon: 'bullets', label: 'List', run: () => edit(() => prefixLines('- ')) },
    { icon: 'link', label: 'Link', key: `${mod} K`, run: () => edit(link) },
    { text: '* * *', label: 'Scene break', run: () => edit(sceneBreak) }
  ];

  const switcher: MenuItem[] = [
    ...chapters.map((c, i) => ({
      label: `${i + 1}. ${c.title}${c.draft ? ' — draft' : ''}`,
      checked: c.slug === slug.current,
      onSelect: () => { if (c.slug !== slug.current) void leave(chapterEditHref(novelId, c.slug)); }
    })),
    ...(slug.current ? ['sep' as const, { label: 'New chapter', icon: 'plus' as const, onSelect: () => void leave(chapterEditHref(novelId, NEW_CHAPTER)) }] : [])
  ];

  const more: MenuItem[] = [
    ...(slug.current && !draft ? [{ label: 'Read this chapter', icon: 'book' as const, onSelect: () => void leave(localChapterHref(novelId, slug.current)) }] : []),
    { label: preview ? 'Back to writing' : 'Preview', icon: preview ? 'pen' : 'eye', hint: `${alt} P`, onSelect: () => setPreview(p => !p) },
    { label: focus ? 'Leave focus mode' : 'Focus mode', icon: focus ? 'collapse' : 'expand', hint: `${alt} F`, onSelect: () => void toggleFocus() },
    { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', onSelect: () => setKeys(true) },
    ...(slug.current ? ['sep' as const, { label: 'Delete chapter', icon: 'trash' as const, tone: 'danger' as const, onSelect: () => setAsk({ kind: 'delete' }) }] : [])
  ];

  return (
    <div className="screen" data-editor data-typing={typing || undefined} data-focus={focus || undefined}>
      {/* Solid, not frosted: a backdrop-filter here would become the containing block of
          the phone's fixed formatting strip and pin it to the top of the screen. */}
      <header className="bar">
        <div className="where">
          <button className="icon-btn" onClick={() => void leave(back)} aria-label={`Back to the chapters of ${novel.title}`} title="Back to chapters">
            <Icon name="back" />
          </button>
          <div className="crumb">
            <span className="book">{novel.title}</span>
            <Menu
              label="Switch chapter"
              placement="bottom-start"
              className="switch-ch"
              trigger={<><span className="cur">{position + 1}. {shownTitle}</span><Icon name="down" size={14} /></>}
              variant="ghost"
              items={switcher}
            />
          </div>
        </div>

        {!preview && (
          <div className="tools" role="toolbar" aria-label="Formatting">
            {tools.map((t, i) => (
              <span key={t.label} className="tw">
                {(i === 2 || i === 5) && <span className="sep" aria-hidden />}
                <button
                  onMouseDown={e => e.preventDefault()}   // keep the caret in the text
                  onClick={t.run}
                  aria-label={t.label}
                  title={t.key ? `${t.label} (${t.key})` : t.label}
                  data-text={t.text ? '' : undefined}
                >
                  {t.icon ? <Icon name={t.icon} size={18} /> : <span aria-hidden>{t.text}</span>}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="acts">
          <button
            className="save"
            data-state={status}
            onClick={() => void save()}
            disabled={status === 'saving' || (status !== 'dirty' && status !== 'error')}
            aria-keyshortcuts={mac ? 'Meta+S' : 'Control+S'}
            title={`Save (${mod} S) — also saves as you type`}
          >
            {status === 'saving' && <span className="spin" aria-hidden />}
            {saveIcon && <Icon name={saveIcon} size={14} />}
            <span>{saveLabel}</span>
          </button>
          <span className="sr-only" role="status" aria-live="polite">{status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : ''}</span>
          <button className="icon-btn hide-sm" aria-pressed={preview} onClick={() => setPreview(p => !p)}
                  aria-label="Preview" title={`Preview (${alt} P)`}>
            <Icon name="eye" />
          </button>
          <button className="icon-btn hide-sm" aria-pressed={focus} onClick={() => void toggleFocus()}
                  aria-label="Focus mode" title={`Focus mode (${alt} F)`}>
            <Icon name={focus ? 'collapse' : 'expand'} />
          </button>
          <Menu label="Chapter actions" items={more} />
          <button className="btn done" data-variant="primary" data-size="sm" onClick={() => void leave(back)} title={`Done (${mod} ↵)`}>Done</button>
        </div>
      </header>

      <main className="sheet">
        <div className="meta">
          <span className="eyebrow">Chapter {position + 1} <span className="of">of {total}</span></span>
          <label className="draft">
            <span>Draft</span>
            <button
              className="switch" role="switch" aria-checked={draft}
              aria-label="Draft — hidden from readers until it’s ready"
              title={draft ? 'Hidden from readers' : 'Visible to readers'}
              onClick={() => edit(() => setDraftFlag(d => !d))}
            ><i /></button>
          </label>
        </div>

        {preview ? (
          <>
            <h1 className="ctitle as-text">{shownTitle}</h1>
            {body.trim()
              ? <article className="prose pv" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              : <p className="caption">Nothing written yet.</p>}
          </>
        ) : (
          <>
            <input
              ref={titleEl}
              className="ctitle"
              value={title}
              onChange={e => edit(() => setTitle(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); area.current?.focus(); } }}
              placeholder="Chapter title"
              aria-label="Chapter title"
              spellCheck
            />
            <textarea
              ref={area}
              className="cbody"
              value={body}
              onChange={e => edit(() => setBody(e.target.value))}
              onInput={grow}
              onKeyDown={e => { if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') setTyping(true); }}
              placeholder="Begin the chapter…"
              aria-label="Chapter text"
              spellCheck
            />
          </>
        )}
      </main>

      <footer className="foot">
        <button className="nav prev" onClick={goPrev} disabled={!prevCh} title={`Previous chapter (${alt} ↑)`}>
          <Icon name="arrowLeft" size={16} />
          <span className="nl"><span className="caption">Previous</span><span className="nt">{prevCh?.title ?? '—'}</span></span>
        </button>
        <p className="counts mono" aria-label="Length">
          <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
          <span>{chars.toLocaleString()} characters</span>
          {words > 0 && <span>{readingMinutes(words)} min read</span>}
        </p>
        <button className="nav next" onClick={goNext} title={`${nextCh ? 'Next chapter' : 'New chapter'} (${alt} ↓)`}>
          <span className="nl"><span className="caption">{nextCh ? 'Next' : 'After this'}</span><span className="nt">{nextCh?.title ?? 'New chapter'}</span></span>
          <Icon name={nextCh ? 'arrowRight' : 'plus'} size={16} />
        </button>
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
            { keys: [alt, '↑'], label: 'Previous chapter' }, { keys: [alt, '↓'], label: 'Next or new chapter' },
            { keys: [alt, 'P'], label: 'Preview' }, { keys: [alt, 'F'], label: 'Focus mode' },
            { keys: [mod, '↵'], label: 'Done' }, { keys: ['Esc'], label: 'Leave preview / focus' }
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
        title={`Delete “${shownTitle}”?`}
        body="The chapter’s text is removed from this device. You’ll have a few seconds to undo."
        onDismiss={() => setAsk(null)}
        choices={[
          { label: 'Keep it', onPick: () => setAsk(null), variant: 'primary' },
          {
            label: 'Delete chapter',
            variant: 'danger',
            onPick: async () => {
              setAsk(null);
              if (timer.current) clearTimeout(timer.current);
              const before = upsertChapter(novel, { slug: slug.current, title, body, draft });
              try {
                await putNovel(removeChapter(before, slug.current));
                setStatus('clean');
                router.push(back);
                toast({
                  message: `Deleted “${shownTitle}”`,
                  action: { label: 'Undo', onClick: async () => { await putNovel(before); notifyChanged(); } }
                });
              } catch { setStatus('error'); }
            }
          }
        ]}
      />

      <style jsx>{`
        .screen { min-height: 100dvh; display: flex; flex-direction: column; }

        /* ---- the bar: where you are · how it's set · what's saved ---- */
        .bar {
          position: sticky; top: 0; z-index: var(--z-crumb);
          display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: var(--s-4);
          min-height: calc(3.5rem + env(safe-area-inset-top, 0px));
          padding: env(safe-area-inset-top, 0px) max(var(--s-3), env(safe-area-inset-right)) 0 max(var(--s-2), env(safe-area-inset-left));
          background: var(--bg); box-shadow: 0 1px 0 var(--rule);
          transition: opacity var(--dur-4) var(--ease-out), transform var(--dur-3) var(--ease-spring);
        }
        .where { display: flex; align-items: center; gap: var(--s-1); min-width: 0; }
        .crumb { display: grid; min-width: 0; line-height: 1.1; }
        .book { font-size: var(--t-micro); color: var(--ink-3); padding-left: var(--s-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .crumb :global(.switch-ch) { min-width: 0; }
        .crumb :global(.switch-ch > .btn) {
          min-height: 1.9rem; padding: 0 var(--s-3); gap: var(--s-1); max-width: 100%;
          font-family: var(--font-serif); font-size: 1rem; font-weight: 500; color: var(--ink);
        }
        .cur { overflow: hidden; text-overflow: ellipsis; }

        .tools { display: flex; align-items: center; gap: 1px; }
        .tw { display: inline-flex; align-items: center; }
        .tools button {
          display: grid; place-items: center; min-width: 2.25rem; height: 2.25rem; padding: 0 var(--s-1);
          border-radius: var(--r-sm); border: 0; background: none; color: var(--ink-2); cursor: pointer;
          transition: color var(--dur-2), background-color var(--dur-2), transform var(--dur-1) var(--ease-spring);
        }
        .tools button[data-text] { font-family: var(--font-serif); font-size: 0.8rem; letter-spacing: 0.08em; padding: 0 var(--s-3); }
        .tools button:hover { color: var(--ink); background: var(--fill); }
        .tools button:active { background: var(--fill-2); transform: scale(0.92); }
        .sep { width: 1px; height: 1.1rem; background: var(--rule-strong); margin: 0 var(--s-2); }

        .acts { display: flex; align-items: center; justify-content: flex-end; gap: var(--s-1); }
        .acts :global(.done) { margin-left: var(--s-2); }
        .save {
          display: inline-flex; align-items: center; gap: var(--s-2); white-space: nowrap;
          min-height: 2rem; padding: 0 var(--s-3); margin-right: var(--s-2);
          border: 0; border-radius: var(--r-sm); background: transparent;
          font-size: var(--t-caption); color: var(--ink-3); cursor: default;
          transition: color var(--dur-3) var(--ease-out), background-color var(--dur-3) var(--ease-out);
        }
        .save[data-state='saved'] :global(svg), .save[data-state='clean'] :global(svg) { color: var(--ok); }
        .save[data-state='dirty'] { color: var(--ink); background: var(--fill); cursor: pointer; font-weight: 500; }
        .save[data-state='dirty']:hover { background: var(--fill-2); }
        .save[data-state='error'] { color: var(--err); background: var(--err-bg); cursor: pointer; font-weight: 500; }
        .spin {
          width: 0.75rem; height: 0.75rem; border-radius: var(--r-round);
          border: 1.5px solid var(--ink-3); border-right-color: transparent; animation: spin 700ms linear infinite;
        }

        /* Writing: the chrome steps back, never away — it's still there to find. */
        .screen[data-typing] .bar, .screen[data-typing] .foot { opacity: 0.25; }
        .screen[data-typing] .bar:focus-within, .screen[data-typing] .foot:focus-within { opacity: 1; }
        /* Focus mode: gone until the pointer reaches an edge. */
        .screen[data-focus] .bar { opacity: 0; transform: translate3d(0, -100%, 0); }
        .screen[data-focus] .bar:hover, .screen[data-focus] .bar:focus-within { opacity: 1; transform: none; }
        .screen[data-focus] .foot { opacity: 0; }
        .screen[data-focus] .foot:hover, .screen[data-focus] .foot:focus-within { opacity: 1; }

        /* ---- the page ---- */
        .sheet {
          flex: 1; width: 100%; max-width: calc(var(--measure) + 2 * var(--gutter));
          margin-inline: auto; padding: clamp(var(--s-7), 8vh, var(--s-9)) var(--gutter) var(--s-9);
          display: flex; flex-direction: column;
        }
        .meta { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-4); }
        .of { color: var(--ink-3); }
        .draft { display: inline-flex; align-items: center; gap: var(--s-3); font-size: var(--t-caption); color: var(--ink-3); cursor: pointer; }
        .draft :global(.switch) { transform: scale(0.85); transform-origin: right center; }

        /* Title and body are the page. No boxes, no rounded inputs — a border here
           would make writing a chapter feel like filling in a form. */
        .ctitle {
          background: none; border: 0; outline: none; padding: 0; width: 100%; margin: 0 0 var(--s-7);
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
          min-height: 55vh; caret-color: var(--accent);
        }
        .cbody::placeholder { color: var(--ink-4); font-style: italic; }
        .cbody:focus-visible { outline: none; }
        .pv { margin: 0; max-width: none; }

        /* ---- the foot: neighbours and length, in the flow of the page ---- */
        .foot {
          position: sticky; bottom: 0; z-index: var(--z-sticky);
          display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: var(--s-4);
          padding: var(--s-2) max(var(--s-3), env(safe-area-inset-right)) max(var(--s-2), env(safe-area-inset-bottom)) max(var(--s-3), env(safe-area-inset-left));
          background: var(--chrome); backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
          box-shadow: 0 -1px 0 var(--rule);
          transition: opacity var(--dur-4) var(--ease-out);
        }
        .nav {
          display: flex; align-items: center; gap: var(--s-3); min-width: 0; min-height: 2.75rem;
          padding: 0 var(--s-3); border: 0; border-radius: var(--r-sm); background: transparent;
          color: var(--ink-2); cursor: pointer; text-align: start;
          transition: background-color var(--dur-2), color var(--dur-2);
        }
        .nav:hover:not(:disabled) { background: var(--fill); color: var(--ink); }
        .nav:disabled { opacity: 0.4; cursor: default; }
        .nav.next { justify-self: end; text-align: end; }
        .nl { display: grid; min-width: 0; line-height: 1.25; }
        .nt { font-size: var(--t-callout); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 16rem; }
        .counts { display: flex; gap: var(--s-4); margin: 0; font-size: var(--t-micro); color: var(--ink-3); white-space: nowrap; }

        @media (max-width: 64rem) {
          .bar { grid-template-columns: minmax(0, 1fr) auto; }
          .tools {
            grid-column: 1 / -1; grid-row: 2; justify-content: center;
            margin: 0 calc(max(var(--s-3), env(safe-area-inset-right)) * -1) 0 calc(max(var(--s-2), env(safe-area-inset-left)) * -1);
            padding: var(--s-1) 0; box-shadow: 0 -1px 0 var(--rule);
          }
        }
        /* Phones: one bar at the top (back, chapter, save, Done), formatting at the thumb,
           and everything else behind the ··· — not a strip of eleven buttons. */
        @media (max-width: 40rem) {
          .bar { gap: var(--s-2); }
          .bar :global(.hide-sm) { display: none; }
          .book { display: none; }
          .save { margin-right: 0; padding: 0 var(--s-2); }
          .save span:not(.spin) { max-width: 5.5rem; overflow: hidden; text-overflow: ellipsis; }
          .tools {
            position: fixed; inset: auto 0 0 0; z-index: var(--z-nav); margin: 0;
            justify-content: space-between; padding: var(--s-1) var(--s-2) max(var(--s-1), env(safe-area-inset-bottom));
            background: var(--chrome); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          }
          .tools button { min-width: 2.75rem; height: 2.75rem; }
          .sep { display: none; }
          .sheet { padding-bottom: var(--s-6); }
          .foot { position: static; grid-template-columns: 1fr 1fr; padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px)); box-shadow: none; background: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
          .counts { grid-column: 1 / -1; grid-row: 1; justify-content: center; }
          .counts span:nth-child(2) { display: none; }
          .nt { max-width: 9rem; }
        }
      `}</style>
    </div>
  );
}
