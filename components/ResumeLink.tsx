'use client';
// The landing page's primary button. For a first-time visitor it opens the library;
// for anyone mid-book it goes back to the exact chapter — the one link most likely to
// be what they came for.
//
// Renders the first-visit label on the server and swaps after hydration, so the button
// is never missing and never flashes an empty box.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { lastRead, type Progress } from '@/lib/library';

export default function ResumeLink() {
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => { lastRead().then(r => setP(r ?? null)).catch(() => {}); }, []);

  return (
    <Link href={p?.href ?? '/library'} className="btn" data-variant="primary" data-size="lg">
      {p ? `Continue ${p.title}` : 'Start reading'}
    </Link>
  );
}
