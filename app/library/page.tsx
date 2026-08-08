import type { Metadata } from 'next';
import LibraryScreen from './LibraryScreen';

// Everything on this page is the reader's own device — there is nothing here to index.
export const metadata: Metadata = {
  title: 'Library',
  description: 'Your books, your place in them, your bookmarks — kept on this device.',
  robots: { index: false, follow: false }
};

export default function LibraryPage() {
  return <LibraryScreen />;
}
