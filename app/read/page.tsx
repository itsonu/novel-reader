import type { Metadata } from 'next';
import LocalLibrary from './LocalLibrary';

// Local mode is private by definition — nothing to index, nothing leaves the device.
export const metadata: Metadata = {
  title: 'Read a local folder',
  description: 'Open a folder of markdown chapters and read or listen. Files never leave your device.',
  robots: { index: false, follow: false }
};

export default function ReadPage() {
  return <LocalLibrary />;
}
