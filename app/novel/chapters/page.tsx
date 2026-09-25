import type { Metadata } from 'next';
import ChaptersScreen from './ChaptersScreen';

// Someone's own book on their own device — nothing to index.
export const metadata: Metadata = {
  title: 'Chapters',
  robots: { index: false, follow: false }
};

export default function ChaptersPage() {
  return <ChaptersScreen />;
}
