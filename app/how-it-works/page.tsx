import type { Metadata } from 'next';
import Link from 'next/link';
import { HowItWorksJourney } from '@/components/HowItWorks';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'From a folder of chapters to a book you can read or listen to: how Novel Reader works, step by step. No account, nothing uploaded, works offline.'
};

export default function HowItWorksPage() {
  return (
    <main className="hiwpage">
      <header className="hiw-intro">
        <p className="eyebrow">How it works</p>
        <h1 className="display">From a folder of chapters to a book you can listen to.</h1>
        <p className="lede">
          Five steps, a couple of minutes. You don’t need an account, and your writing never
          leaves your device.
        </p>
      </header>

      <HowItWorksJourney />

      <section className="hiw-end" aria-labelledby="hiw-end-h">
        <h2 id="hiw-end-h" className="title-1">See it for yourself</h2>
        <p className="lede" style={{ margin: 0 }}>A short sample story comes with the app. Open it and press play.</p>
        <div className="cta center">
          <Link href="/read" className="btn" data-variant="primary" data-size="lg">Try the sample book</Link>
          <Link href="/publish" className="btn" data-size="lg">Add your own</Link>
        </div>
      </section>
    </main>
  );
}
