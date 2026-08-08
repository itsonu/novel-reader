import type { Metadata } from 'next';
import { Suspense } from 'react';
import ChapterEditorScreen from './ChapterEditorScreen';

// Someone's unpublished draft on their own device. Nothing here is for a crawler.
export const metadata: Metadata = {
  title: 'Writing',
  robots: { index: false, follow: false }
};

export default function WritePage() {
  // The chapter is in the query string, and useSearchParams can't run during prerender.
  return (
    <Suspense fallback={<main className="wrap"><p className="caption">Opening the editor…</p></main>}>
      <ChapterEditorScreen />
    </Suspense>
  );
}
