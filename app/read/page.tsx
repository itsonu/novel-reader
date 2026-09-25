import type { Metadata } from 'next';
import { Suspense } from 'react';
import LocalReader, { ReaderSkeleton } from './LocalReader';

// Local mode is private by definition — nothing to index, nothing leaves the device.
export const metadata: Metadata = {
  title: 'Reading',
  description: 'Read or listen to a chapter from your own library. Files never leave your device.',
  robots: { index: false, follow: false }
};

export default function ReadPage() {
  // The chapter lives in the query string, and useSearchParams can't run during
  // prerender — so the static build ships this shell and fills it in on hydration.
  return (
    <Suspense fallback={<ReaderSkeleton />}>
      <LocalReader />
    </Suspense>
  );
}
