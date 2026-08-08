'use client';
// Folder → StoredNovel, and staying linked to that folder afterwards.
//
// Three ways in, because the platform gives three: the directory picker (Chromium),
// <input webkitdirectory> (Firefox/Safari), and drag-and-drop. Only the first hands
// back a handle we can keep, so only the first can ever reconnect. The other two leave
// a copy on the device, which is still permanent — just not live.

import { chapterMeta, isSkippable, slugify, sortChapters, type ChapterMeta } from './reader/markdown';
import {
  deleteHandle, getHandle, getNovel, persist, putHandle, putNovel, type StoredNovel
} from './library';
import { describeMerge, mergeScan, type Scanned } from './sync';

type Parsed = ChapterMeta & { file: string };

export const supportsDirectoryPicker = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const toChapters = (list: Parsed[]): Scanned[] =>
  sortChapters(list).map((c, i) => ({
    slug: slugify(c.title) || `chapter-${i + 1}`,
    title: c.title,
    body: c.body,
    ordinal: c.order ?? i + 1
  }));

function toNovel(list: Parsed[], name: string): StoredNovel {
  return {
    id: slugify(name) || 'library',
    title: name,
    addedAt: Date.now(),
    chapters: toChapters(list).map(c => ({ ...c, words: c.body.trim().split(/\s+/).filter(Boolean).length }))
  };
}

/** Same shape every caller wants back: what to open, or why nothing opened. */
export type ImportResult = { novel: StoredNovel; note?: string } | { error: string };

/**
 * Importing a folder that is already a book updates it instead of making a second copy.
 * The id comes from the folder name, so re-importing lands on the same id — before this
 * it overwrote the book wholesale and took any chapter written in the app with it.
 */
async function finish(list: Parsed[], name: string): Promise<ImportResult> {
  if (!list.length) return { error: 'No .md chapters found in that folder.' };
  const fresh = toNovel(list, name);
  try {
    const existing = await getNovel(fresh.id);
    if (existing) {
      const merged = mergeScan(existing, toChapters(list));
      await putNovel(merged.novel);
      await persist();
      return { novel: merged.novel, note: describeMerge(merged) };
    }
    await putNovel(fresh);
    await persist();
    return { novel: fresh };
  } catch {
    return { error: 'Could not save to this device. Private browsing blocks storage.' };
  }
}

async function scan(dir: any): Promise<Parsed[]> {
  const files: { file: string; handle: any }[] = [];
  const walk = async (d: any, prefix = '') => {
    for await (const [name, h] of d.entries()) {
      if (h.kind === 'directory') { if (!name.startsWith('.')) await walk(h, `${prefix}${name}/`); }
      else if (/\.md$/i.test(name) && !isSkippable(name)) files.push({ file: prefix + name, handle: h });
    }
  };
  await walk(dir);
  return Promise.all(
    files.map(async f => ({ file: f.file, ...chapterMeta(f.file, await (await f.handle.getFile()).text()) }))
  );
}

/* ---------- linking ---------- */

export type LinkState =
  | 'unsupported'      // this browser has no handle API; the stored copy is all there is
  | 'none'             // never linked, or the link was dropped
  | 'linked'           // permission survived; refresh works with no prompt
  | 'needs-permission';// handle kept, but the browser wants a click before reading again

/**
 * Browsers deliberately downgrade file permission between sessions. That is the whole
 * reason a "Reconnect" button has to exist: the grant can only be renewed inside a real
 * user gesture, so nothing here can quietly restore it on page load.
 */
export async function linkState(novelId: string): Promise<LinkState> {
  if (!supportsDirectoryPicker()) return 'unsupported';
  try {
    const h = await getHandle(novelId);
    if (!h?.queryPermission) return 'none';
    return (await h.queryPermission({ mode: 'read' })) === 'granted' ? 'linked' : 'needs-permission';
  } catch {
    return 'none';
  }
}

/** Chromium: a real directory handle, kept against this novel's id. */
export async function importFromPicker(): Promise<ImportResult | null> {
  try {
    const dir = await (window as any).showDirectoryPicker({ id: 'novels', mode: 'read' });
    const result = await finish(await scan(dir), dir.name);
    if ('novel' in result) await putHandle(result.novel.id, dir).catch(() => {});
    return result;
  } catch (e: any) {
    if (e?.name === 'AbortError') return null;   // they changed their mind; not an error
    return { error: 'Could not read that folder. Check the folder still exists and try again.' };
  }
}

export type RefreshResult = { note: string; novel: StoredNovel } | { error: string } | null;

/**
 * Re-read a linked folder and merge what changed.
 *
 * `interactive` must only be true when called straight from a click — requestPermission
 * throws outside a user gesture, and a rejected prompt would then look like a bug.
 */
export async function refreshFromFolder(novelId: string, interactive: boolean): Promise<RefreshResult> {
  if (!supportsDirectoryPicker()) return null;
  let handle: any;
  try {
    handle = await getHandle(novelId);
  } catch {
    return null;
  }
  if (!handle?.queryPermission) return null;

  try {
    let granted = (await handle.queryPermission({ mode: 'read' })) === 'granted';
    if (!granted) {
      if (!interactive) return null;                      // silent path never prompts
      granted = (await handle.requestPermission({ mode: 'read' })) === 'granted';
    }
    if (!granted) return { error: 'Reading that folder still needs your permission.' };

    const novel = await getNovel(novelId);
    if (!novel) return null;

    const merged = mergeScan(novel, toChapters(await scan(handle)));
    await putNovel(merged.novel);
    return { note: describeMerge(merged), novel: merged.novel };
  } catch (e: any) {
    // A folder that was renamed, deleted or on an unplugged drive lands here. Drop the
    // dead handle so the UI stops offering a reconnect that cannot succeed.
    if (e?.name === 'NotFoundError') {
      await deleteHandle(novelId).catch(() => {});
      return { error: 'That folder has moved or is no longer available. Link it again to reconnect.' };
    }
    return { error: 'Could not read that folder. Your saved copy is untouched.' };
  }
}

/** Every linked novel, refreshed quietly — only the ones whose permission survived. */
export async function refreshAllLinked(ids: string[]): Promise<number> {
  let changed = 0;
  for (const id of ids) {
    const r = await refreshFromFolder(id, false);
    if (r && 'note' in r && r.note !== 'Already up to date.') changed += 1;
  }
  return changed;
}

/** Firefox / Safari: <input type="file" webkitdirectory>. No handle, so no reconnect. */
export async function importFromFiles(files: FileList | null): Promise<ImportResult | null> {
  if (!files?.length) return null;
  const list = await Promise.all(
    [...files]
      .filter(f => /\.md$/i.test(f.name) && !isSkippable(f.name))
      .map(async f => {
        const path = (f as any).webkitRelativePath || f.name;
        return { file: path, ...chapterMeta(path, await f.text()) };
      })
  );
  const name = [...files][0]?.webkitRelativePath?.split('/')[0] || 'Local folder';
  return finish(list, name);
}

/** Drag and drop, including nested folders. */
export async function importFromDrop(e: React.DragEvent): Promise<ImportResult | null> {
  const out: Parsed[] = [];
  let root = '';
  const walk = async (entry: any, prefix = ''): Promise<void> => {
    if (entry.isFile) {
      if (!/\.md$/i.test(entry.name) || isSkippable(entry.name)) return;
      const file: File = await new Promise(r => entry.file(r));
      out.push({ file: prefix + entry.name, ...chapterMeta(entry.name, await file.text()) });
    } else if (entry.isDirectory) {
      if (!root) root = entry.name;
      const rd = entry.createReader();
      const batch = (): Promise<any[]> => new Promise(r => rd.readEntries(r));
      for (let b = await batch(); b.length; b = await batch())
        for (const x of b) await walk(x, `${prefix}${entry.name}/`);
    }
  };
  // Both of these must be read synchronously: DataTransfer items are emptied as soon as
  // the drop handler yields, so grabbing them after the first await returns nothing.
  const items = [...e.dataTransfer.items];
  const entries = items.map(x => x.webkitGetAsEntry?.()).filter(Boolean);
  // Chromium also offers a real directory handle here, which lets a dropped folder stay
  // linked exactly like a picked one.
  const dropped: Promise<any> | null = (items[0] as any)?.getAsFileSystemHandle?.() ?? null;

  if (!entries.length) return null;
  await Promise.all(entries.map(x => walk(x)));

  const result = await finish(out, root || 'Dropped folder');
  if ('novel' in result && dropped) {
    const h = await dropped.catch(() => null);
    if (h?.kind === 'directory') await putHandle(result.novel.id, h).catch(() => {});
  }
  return result;
}
