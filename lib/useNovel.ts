'use client';
// One loader for every screen that shows a local novel — the book page, the chapter
// manager — so they agree on what "loaded", "missing" and "changed" mean, and all of
// them pick up an Undo raised on another screen.

import { useCallback, useEffect, useState } from 'react';
import {
  getNovel, getProgress, listBookmarks, onLibraryChanged, putNovel,
  type Bookmark, type Progress, type StoredNovel
} from './library';

export type NovelPhase = 'loading' | 'ready' | 'missing';

export function useLocalNovel(id: string) {
  const [phase, setPhase] = useState<NovelPhase>('loading');
  const [novel, setNovel] = useState<StoredNovel | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [marks, setMarks] = useState<Bookmark[]>([]);

  const load = useCallback(async () => {
    if (!id) { setPhase('missing'); return; }
    try {
      const n = await getNovel(id);
      if (!n) { setPhase('missing'); return; }
      setNovel(n);
      setProgress((await getProgress(id)) ?? null);
      setMarks((await listBookmarks()).filter(b => b.novelId === id).sort((a, b) => b.at - a.at));
      setPhase('ready');
    } catch {
      setPhase('missing');
    }
  }, [id]);

  useEffect(() => { void load(); return onLibraryChanged(() => void load()); }, [load]);

  /** Optimistic write: the screen shows the new state at once and rolls back if storage refuses. */
  const commit = useCallback(async (next: StoredNovel) => {
    const prev = novel;
    setNovel(next);
    try { await putNovel(next); return true; }
    catch { setNovel(prev); return false; }
  }, [novel]);

  return { phase, novel, progress, marks, setMarks, setNovel, load, commit };
}
