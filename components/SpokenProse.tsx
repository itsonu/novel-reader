import { Fragment } from 'react';

/**
 * The landing's argument, told the way the app tells a chapter.
 *
 * Every word is its own span carrying a monotonic index. CSS gives each span a
 * view() timeline offset by that index, so scrolling walks the highlight across
 * the passage exactly as the narrator walks it across a paragraph — same three
 * states the player uses (unread / speaking / read), same accent.
 *
 * Server component on purpose: the whole effect is markup plus CSS. No observer,
 * no scroll listener, no hydration cost. Where view() is unsupported the words
 * render already-read, which is just prose.
 *
 * ponytail: index is global across the passage rather than per rendered line —
 * line boxes aren't known until layout. Geometry supplies the line-to-line
 * cadence; the index supplies the left-to-right lean within one. Monotonic, so
 * the sweep can never run backwards mid-line.
 */
const PASSAGE = [
  'Point it at a folder of markdown and it becomes a book. Chapter order, titles and word counts come from the files themselves — nothing to configure, nothing to upload.',
  'Your device speaks the first sentence instantly. A better neural voice downloads once, then works offline forever, and the page follows the narrator word by word.',
  'It reads like a book: serif prose at a real measure, adjustable size, light and dark, and no advertisement between paragraphs.',
  'The library lives on your device. Install it, and it works with no connection at all.',
];

export default function SpokenProse() {
  let n = 0;
  return (
    <div className="passage">
      {PASSAGE.map((para, pi) => {
        const words = para.split(' ');
        // The drop-capped word stays a bare text node. ::first-letter can only
        // reach into inline content, and .sw has to be inline-block for view()
        // to give it a real range — so the opening word opts out of the sweep.
        // One unanimated word, and it is the one already carrying the drop cap.
        const lead = pi === 0 ? words.shift() : null;
        return (
          <p key={pi} className="sp" data-lean={pi % 2 === 1 ? 'right' : undefined}>
            {lead ? `${lead} ` : null}
            {words.map((w, wi) => (
              // Space outside the span, so the mark ends where the word does.
              <Fragment key={wi}>
                <span className="sw" style={{ ['--w' as string]: n++ }}>{w}</span>{' '}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
