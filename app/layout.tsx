import type { Metadata } from 'next';
import { SITE } from '@/lib/seo';
import PWA from '@/components/PWA';
import './globals.css';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Novel Reader', template: '%s · Novel Reader' },
  description: 'Read and listen to serialized fiction. Word-synced narration, no install, free.',
  applicationName: 'Novel Reader',
  formatDetection: { telephone: false },
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'Reader', statusBarStyle: 'black-translucent' },
  icons: { icon: `${BASE}/icon.svg`, apple: `${BASE}/icon.svg` },
  openGraph: { siteName: 'Novel Reader', type: 'website' }
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d0c0b' },
    { media: '(prefers-color-scheme: light)', color: '#faf6ee' }
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        {children}
        <PWA />
      </body>
    </html>
  );
}
