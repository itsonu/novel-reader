import type { Metadata } from 'next';
import NovelScreen from './NovelScreen';

// A book that lives only on the reader's device — nothing here exists to a crawler.
export const metadata: Metadata = {
  title: 'Novel',
  robots: { index: false, follow: false }
};

export default function NovelPage() {
  return <NovelScreen />;
}
