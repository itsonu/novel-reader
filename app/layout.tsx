import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible, Inter, Newsreader } from 'next/font/google';
import { SITE } from '@/lib/seo';
import { BOOT_SCRIPT } from '@/lib/theme';
import Nav from '@/components/Nav';
import PWA from '@/components/PWA';
import AppChrome from '@/components/AppChrome';
import 'driver.js/dist/driver.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/prose.css';
import './styles/app.css';
import './styles/landing.css';
import './styles/how.css';
import './styles/fx.css';

// Fonts are self-hosted by next/font at build time: no third-party request at runtime,
// subset to Latin, and a metric-matched fallback so the swap doesn't shift the page.
// Newsreader is the book face — optical sizes from caption to display in one file.
const newsreader = Newsreader({
  subsets: ['latin'], style: ['normal', 'italic'], axes: ['opsz'],
  display: 'swap', variable: '--font-newsreader'
});
// Only fetched where the platform has no UI face of its own earlier in the stack.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter', preload: false });
// The legibility face is a reading setting; nobody downloads it until they pick it.
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'],
  display: 'swap', variable: '--font-atkinson', preload: false
});

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

// theme-color is written by the boot script, from the resolved theme — a media-query
// pair here would be wrong for anyone who chose a theme other than their OS's.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark light'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${newsreader.variable} ${inter.variable} ${atkinson.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint: theme and reading settings. See lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        {/* One navigation for the whole app. It removes itself on reading routes. */}
        <Nav />
        <div id="main">{children}</div>
        <AppChrome />
        <PWA />
      </body>
    </html>
  );
}
