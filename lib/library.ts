'use client';
// Persistent on-device library (IndexedDB). This is what makes the static build a real
// app rather than a file viewer: import a folder once, it's there next visit, offline.
//
// ponytail: raw IndexedDB, ~90 lines. A wrapper library would be bigger than this file.

export type StoredChapter = { slug: string; title: string; ordinal: number; body: string; words: number };
export type StoredNovel = {
  id: string;              // slug
  title: string;
  author?: string;
  addedAt: number;
  chapters: StoredChapter[];
};
export type Progress = { novelId: string; chapterSlug: string; scroll: number; at: number };

const DB = 'novel-reader';
const VERSION = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('novels')) db.createObjectStore('novels', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'novelId' });
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

export const listNovels = () => tx<StoredNovel[]>('novels', 'readonly', s => s.getAll());
export const getNovel = (id: string) => tx<StoredNovel | undefined>('novels', 'readonly', s => s.get(id));
export const putNovel = (n: StoredNovel) => tx<IDBValidKey>('novels', 'readwrite', s => s.put(n));
export const deleteNovel = (id: string) => tx<undefined>('novels', 'readwrite', s => s.delete(id));

export const saveProgress = (p: Progress) => tx<IDBValidKey>('progress', 'readwrite', s => s.put(p));
export const getProgress = (novelId: string) =>
  tx<Progress | undefined>('progress', 'readonly', s => s.get(novelId));

/** Directory handle, so "reopen last folder" survives a reload where supported. */
export const putHandle = (h: unknown) => tx<IDBValidKey>('kv', 'readwrite', s => s.put(h, 'dir'));
export const getHandle = () => tx<any>('kv', 'readonly', s => s.get('dir'));

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
