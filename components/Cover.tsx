// A book cover. A real image when the novel has one; otherwise a typeset cloth cover —
// title and author on a colour chosen from the title, so a book keeps the same face
// everywhere it appears and a shelf of imported folders doesn't read as a row of
// identical grey boxes with a letter in them.
//
// Server-safe (no hooks), so published pages can render it at build time.

const CLOTH = [
  ['#5b2a2a', '#f1dccb'],   // oxblood
  ['#27413a', '#dfe9dc'],   // forest
  ['#243650', '#dbe4ef'],   // navy
  ['#6b4f1d', '#f5e6c4'],   // ochre
  ['#3d4148', '#e4e5e8'],   // slate
  ['#4a2e48', '#efdcec'],   // plum
  ['#1f4a4f', '#d6ecec'],   // teal
  ['#2b2825', '#eee4d4'],   // charcoal
] as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export default function Cover({
  title, author, src, size = 'md', className
}: {
  title: string; author?: string | null; src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string;
}) {
  const [bg, fg] = CLOTH[hash(title) % CLOTH.length];
  return (
    <span className={`cover cover-${size} ${className ?? ''}`} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" width={400} height={600} />
      ) : (
        <span className="cloth" style={{ ['--c-bg' as string]: bg, ['--c-fg' as string]: fg }}>
          <span className="ct">{title}</span>
          <span className="rule" />
          {author && size !== 'xs' && <span className="ca">{author}</span>}
        </span>
      )}
    </span>
  );
}
