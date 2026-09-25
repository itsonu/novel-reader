'use client';
// Persistent on-device library (IndexedDB). This is what makes the static build a real
// app rather than a file viewer: import a folder once, it's there next visit, offline.
//
// Five stores, one job each:
//   novels     full local novels (chapters and all) — imported folders, hand-written books
//   saved      a *published* novel the reader has touched; card data only, body stays remote
//   progress   one row per novel: where they are, and the exact href that resumes it
//   bookmarks  many rows per novel: a saved position inside a chapter
//   kv         the directory handle, so "reopen last folder" survives a reload
//
// ponytail: raw IndexedDB. A wrapper library would be bigger than this file. Ceiling:
// no indexes — bookmarks are read with getAll() and filtered in memory, which is right
// for tens of rows per reader and wrong at ten thousand.

import { SAMPLE_ID, SAMPLE_NOVEL } from './sample-novel';
// Routes live in their own module because server components need them too, and a
// 'use client' module's exports can only be rendered on the server, never called.
import { isRemoteId } from './routes';

export type StoredChapter = { slug: string; title: string; ordinal: number; body: string; words: number };
export type StoredNovel = {
  id: string;              // slug
  title: string;
  author?: string;
  genre?: string;
  addedAt: number;
  favorite?: boolean;
  chapters: StoredChapter[];
};

/** A published novel the reader favourited or opened. The text stays on the server;
 *  this is only what the library needs to draw a card and link back. */
export type SavedNovel = {
  id: string;              // `n:${slug}` — namespaced so it can never collide with a local id
  slug: string;
  title: string;
  author?: string;
  cover?: string;
  chapters: number;
  words?: number;
  favorite?: boolean;
  addedAt: number;
};

export type Progress = {
  novelId: string;
  title: string;
  author?: string;
  chapterSlug: string;
  chapterTitle: string;
  chapterIndex: number;    // 0-based
  chapters: number;
  scroll: number;
  percent: number;         // 0..1 across the whole novel
  at: number;
  /** Exact resume destination. Storing it means "Continue reading" never has to know
   *  whether the novel is local or published — one field, no branching at the call site. */
  href: string;
  remote?: boolean;
};

export type Bookmark = {
  id: string;              // `${novelId}::${chapterSlug}::${at}`
  novelId: string;
  novelTitle: string;
  chapterSlug: string;
  chapterTitle: string;
  note: string;            // the line the reader was on, for recognising the spot
  scroll: number;
  href: string;
  at: number;
};

const DB = 'novel-reader';
const VERSION = 3;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('novels')) db.createObjectStore('novels', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'novelId' });
      if (!db.objectStoreNames.contains('saved')) db.createObjectStore('saved', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); res(req.result as T); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}

/* ---- local novels ---- */
export const listNovels = () => tx<StoredNovel[]>('novels', 'readonly', s => s.getAll());
export const getNovel = (id: string) => tx<StoredNovel | undefined>('novels', 'readonly', s => s.get(id));
export const putNovel = (n: StoredNovel) => tx<IDBValidKey>('novels', 'readwrite', s => s.put(n));

export async function deleteNovel(id: string) {
  await tx<undefined>('novels', 'readwrite', s => s.delete(id));
  await deleteProgress(id);
  await deleteBookmarksFor(id);
  await deleteHandle(id).catch(() => {});
  // Removing the bundled sample is a decision, not an accident — remember it, or the
  // next visit helpfully puts it back. Set here so every removal path is covered.
  if (id === SAMPLE_ID) localStorage.setItem('nr:sample', 'removed');
}

/* ---- published novels the reader keeps ---- */
export const listSaved = () => tx<SavedNovel[]>('saved', 'readonly', s => s.getAll());
export const getSaved = (id: string) => tx<SavedNovel | undefined>('saved', 'readonly', s => s.get(id));
export const putSaved = (n: SavedNovel) => tx<IDBValidKey>('saved', 'readwrite', s => s.put(n));
export async function deleteSaved(id: string) {
  await tx<undefined>('saved', 'readwrite', s => s.delete(id));
  await deleteProgress(id);
  await deleteBookmarksFor(id);
}

/** Favourite works on either kind — the caller has a card id, not a store name. */
export async function setFavorite(id: string, on: boolean) {
  if (isRemoteId(id)) {
    const n = await getSaved(id);
    if (n) await putSaved({ ...n, favorite: on });
    return;
  }
  const n = await getNovel(id);
  if (n) await putNovel({ ...n, favorite: on });
}

export const removeFromLibrary = (id: string) =>
  isRemoteId(id) ? deleteSaved(id) : deleteNovel(id);

/* ---- progress ---- */
export const listProgress = () => tx<Progress[]>('progress', 'readonly', s => s.getAll());
export const getProgress = (novelId: string) =>
  tx<Progress | undefined>('progress', 'readonly', s => s.get(novelId));
export const saveProgress = (p: Progress) => tx<IDBValidKey>('progress', 'readwrite', s => s.put(p));
export const deleteProgress = (novelId: string) =>
  tx<undefined>('progress', 'readwrite', s => s.delete(novelId));

/** The single most recent read, whatever kind of novel it was. Drives "resume". */
export async function lastRead(): Promise<Progress | undefined> {
  const all = await listProgress().catch(() => [] as Progress[]);
  return all.sort((a, b) => b.at - a.at)[0];
}

/* ---- bookmarks ---- */
export const listBookmarks = () => tx<Bookmark[]>('bookmarks', 'readonly', s => s.getAll());
export const putBookmark = (b: Bookmark) => tx<IDBValidKey>('bookmarks', 'readwrite', s => s.put(b));
export const deleteBookmark = (id: string) => tx<undefined>('bookmarks', 'readwrite', s => s.delete(id));

export async function deleteBookmarksFor(novelId: string) {
  const all = await listBookmarks().catch(() => [] as Bookmark[]);
  for (const b of all.filter(x => x.novelId === novelId)) await deleteBookmark(b.id);
}

/* ---- directory handles ----
   Keyed per novel. There used to be a single 'dir' slot, which meant importing a second
   folder silently forgot the first — the feature looked like it worked right up until
   you owned two books. FileSystemDirectoryHandle is structured-cloneable, so IndexedDB
   can store the handle itself; localStorage could not, which is why this lives here. */
const handleKey = (novelId: string) => `dir:${novelId}`;
export const putHandle = (novelId: string, h: unknown) =>
  tx<IDBValidKey>('kv', 'readwrite', s => s.put(h, handleKey(novelId)));
export const getHandle = (novelId: string) =>
  tx<any>('kv', 'readonly', s => s.get(handleKey(novelId)));
export const deleteHandle = (novelId: string) =>
  tx<undefined>('kv', 'readwrite', s => s.delete(handleKey(novelId)));

/** Ask the browser not to evict the library under storage pressure. */
export async function persist(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function usage(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage ?? 0, quota: e.quota ?? 0 };
}

/**
 * First ever visit gets the bundled sample story, so the library and the reader both
 * have something real in them before anyone owns a folder of markdown.
 * Idempotent, and honours a reader who deleted it.
 */
export async function ensureSeeded(): Promise<void> {
  const saved = await listNovels();
  if (saved.length) return;
  if (localStorage.getItem('nr:sample') === 'removed') return;
  await putNovel({
    id: SAMPLE_NOVEL.id,
    title: SAMPLE_NOVEL.title,
    author: SAMPLE_NOVEL.author,
    genre: SAMPLE_NOVEL.genre,
    addedAt: Date.now(),
    chapters: SAMPLE_NOVEL.chapters.map(c => ({
      ...c,
      words: c.body.trim().split(/\s+/).filter(Boolean).length
    }))
  });
  await persist();
}

/* ---- undo ----
   Everything a removal destroys, captured first, so "Undo" can put it all back —
   the book, where you were in it, its bookmarks and the folder link. */
export type Snapshot = {
  novel?: StoredNovel; saved?: SavedNovel; progress?: Progress; bookmarks: Bookmark[]; handle?: unknown;
};

export async function snapshot(id: string): Promise<Snapshot> {
  const remote = isRemoteId(id);
  const [novel, saved, progress, bookmarks, handle] = await Promise.all([
    remote ? undefined : getNovel(id),
    remote ? getSaved(id) : undefined,
    getProgress(id).catch(() => undefined),
    listBookmarks().then(all => all.filter(b => b.novelId === id)).catch(() => [] as Bookmark[]),
    remote ? undefined : getHandle(id).catch(() => undefined)
  ]);
  return { novel, saved, progress, bookmarks, handle };
}

/** Screens holding a copy of the library listen for this and reload — so an Undo raised
 *  by one screen shows up on whichever screen is open when it's pressed. */
const CHANGED = 'nr:library-changed';
export const notifyChanged = () => window.dispatchEvent(new CustomEvent(CHANGED));
export function onLibraryChanged(fn: () => void) {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

export async function restore(s: Snapshot) {
  if (s.novel) {
    await putNovel(s.novel);
    if (s.novel.id === SAMPLE_ID) localStorage.removeItem('nr:sample');
  }
  if (s.saved) await putSaved(s.saved);
  if (s.progress) await saveProgress(s.progress);
  for (const b of s.bookmarks) await putBookmark(b);
  if (s.handle && s.novel) await putHandle(s.novel.id, s.handle).catch(() => {});
  notifyChanged();
}
