import Link from 'next/link';
import Icon from '@/components/Icon';

export default function NotFound() {
  return (
    <main className="wrap">
      <div className="empty">
        <span className="glyph"><Icon name="book" size={26} /></span>
        <p className="eyebrow">Page not found</p>
        <h1 className="display" style={{ fontSize: 'var(--t-title-1)' }}>This page isn’t in the book</h1>
        <p>The link may be old, or the novel may have moved. Your library and your place in it are untouched.</p>
        <div className="actions">
          <Link href="/library" className="btn" data-variant="primary">Open your library</Link>
          <Link href="/" className="btn">Discover</Link>
        </div>
      </div>
    </main>
  );
}
