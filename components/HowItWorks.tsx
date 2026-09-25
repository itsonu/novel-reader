// How it works, told as the journey a reader actually takes: a folder of chapters, a
// book on the shelf, a page to read, a voice that reads along, a place kept for later.
//
// Every picture is drawn from the app's own pieces (a cover, a page, the spoken-word
// highlight) rather than stock illustration, so what someone sees here is exactly what
// they'll meet when they open a book. Server component: no JavaScript, fully indexable.
// The one moving part — the highlight stepping across a sentence — is CSS, starts when
// the step scrolls into view, plays a few times and rests; reduced motion holds it still.

import Link from 'next/link';
import Cover from './Cover';
import Icon from './Icon';
import Reveal from './Reveal';

const FILES = ['01 The Girl With the Long Pole.md', '02 The Boy Who Had Nowhere to Be.md', '03 What the Storm Did.md', 'notes.md'];
const SPOKEN = ['Every', 'lamp', 'on', 'the', 'lane', 'had', 'gone', 'out.'];

function FolderPicture() {
  return (
    <div className="hiw-pic hiw-folder" aria-hidden>
      <div className="hiw-folder-bar"><Icon name="folder" size={15} /> The Lamplighter</div>
      <ul>
        {FILES.map(f => (
          <li key={f} data-skip={f === 'notes.md' || undefined}>
            <Icon name="file" size={14} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookPicture() {
  return (
    <div className="hiw-pic hiw-book" aria-hidden>
      <Cover title="The Lamplighter" author="A. Writer" size="sm" />
      <div className="hiw-book-meta">
        <span className="hiw-book-t">The Lamplighter</span>
        <span>3 chapters · 12 min</span>
        <span className="hiw-toc"><b>1</b> The Girl With the Long Pole</span>
        <span className="hiw-toc"><b>2</b> The Boy Who Had Nowhere to Be</span>
        <span className="hiw-toc"><b>3</b> What the Storm Did</span>
      </div>
    </div>
  );
}

function PagePicture() {
  return (
    <div className="hiw-pic hiw-page" aria-hidden>
      <div className="hiw-page-bar">
        <span className="hiw-aa">Aa</span>
        <span className="hiw-sizes"><span>A</span><span className="big">A</span></span>
        <span className="hiw-modes"><Icon name="sun" size={14} /><Icon name="moon" size={14} /></span>
      </div>
      <p className="hiw-page-h">What the Storm Did</p>
      <p className="hiw-page-p">The storm arrived properly at midnight. Ila woke to the sound of it — not the rain, which was ordinary, but the wind, which had opinions.</p>
    </div>
  );
}

function VoicePicture() {
  return (
    <div className="hiw-pic hiw-voice" aria-hidden>
      <p className="hiw-voice-line">
        {SPOKEN.map((w, i) => (
          <span key={i} className="hiw-w" style={{ ['--i' as string]: i }}>{w}</span>
        ))}
      </p>
      <div className="hiw-transport">
        <span className="hiw-play"><Icon name="play" size={16} fill /></span>
        <span className="hiw-track"><span /></span>
        <span className="hiw-time">0:12</span>
      </div>
    </div>
  );
}

function ResumePicture() {
  return (
    <div className="hiw-pic hiw-resume" aria-hidden>
      <span className="hiw-resume-k">Continue reading</span>
      <span className="hiw-resume-t">The Lamplighter</span>
      <span className="hiw-resume-c">Chapter 3 · What the Storm Did</span>
      <span className="hiw-resume-m"><span /></span>
      <span className="hiw-resume-f"><Icon name="bookmark" size={13} fill /> 2 bookmarks</span>
    </div>
  );
}

type Step = { title: string; body: React.ReactNode; picture: React.ReactNode };

const STEPS: Step[] = [
  {
    title: 'Keep your chapters in one folder',
    body: <>One plain-text file per chapter, the kind most writing apps can save as <code>.md</code>. Put a number in each name — 01, 02, 03 — and that’s the order they’ll appear in. Notes and read-me files are left out.</>,
    picture: <FolderPicture />
  },
  {
    title: 'Open the folder here',
    body: <>Choose <b>Add</b> and pick the folder. It becomes a book on your shelf — named after the folder, chapters titled and in order, with a cover. Nothing is uploaded: the book lives on this device.</>,
    picture: <BookPicture />
  },
  {
    title: 'Read it like a book',
    body: <>Chapters open as clean pages, with nothing else on screen. Make the text bigger, switch to dark for night reading, or change the typeface — whatever’s easiest on your eyes.</>,
    picture: <PagePicture />
  },
  {
    title: 'Or press play and listen',
    body: <>A voice reads the chapter aloud, and the word being spoken lights up, so you can look away and find your place again in a glance. While it’s reading, tap any word to jump there.</>,
    picture: <VoicePicture />
  },
  {
    title: 'Come back to where you stopped',
    body: <>Close the tab, come back next week — the book opens on the same line. Bookmark a moment you want to find again, and it waits for you in your library.</>,
    picture: <ResumePicture />
  }
];

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  { q: 'Do I need an account?', a: 'No. Open the site and start reading. There’s nothing to sign up for.' },
  { q: 'Where do my chapters go?', a: 'They stay in this browser, on this device. Nothing is sent anywhere, and no one else can see them.' },
  { q: 'Does it work without the internet?', a: <>Yes — once a book is on your shelf. On a phone, use <b>Add to Home Screen</b> and it opens like an app, even on a plane.</> },
  { q: 'What’s a .md file?', a: <>Plain text with a few simple marks, like <code>*this*</code> for <em>italics</em>. Obsidian, iA Writer, Ulysses and Google Docs (<b>File → Download → Markdown</b>) can all save chapters this way.</> },
  { q: 'I changed a chapter. How do I update the book?', a: 'In Chrome and Edge the book stays linked to its folder and picks up changes when you open it — sometimes after one click to allow it. In other browsers, add the same folder again — it updates the book you already have and keeps your place.' },
  { q: 'The voice sounds a bit robotic. Can it sound better?', a: <>Your device’s own voice starts instantly. For a more natural one, open the player’s settings and choose <b>Neural voices</b> — a one-time download of about 80&nbsp;MB, which then works offline too.</> }
];

/** The full page body for /how-it-works. */
export function HowItWorksJourney() {
  return (
    <>
      <ol className="hiw-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="hiw-step">
            <Reveal>
              <div className="hiw-row">
                <div className="hiw-text">
                  <span className="hiw-n" aria-hidden>{i + 1}</span>
                  <h2 className="hiw-h">{s.title}</h2>
                  <p className="hiw-p">{s.body}</p>
                </div>
                {s.picture}
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal>
        <aside className="hiw-writer" aria-labelledby="hiw-writer-h">
          <Icon name="pen" size={20} />
          <div>
            <h2 id="hiw-writer-h" className="title-3">Writing the book yourself?</h2>
            <p>
              Start a chapter right here and it saves as you type. Keep a chapter as a draft until
              it’s ready — readers won’t see it — and move chapters around as the story changes.
            </p>
          </div>
        </aside>
      </Reveal>

      <section className="hiw-faq" aria-labelledby="hiw-faq-h">
        <h2 id="hiw-faq-h" className="title-1">Good to know</h2>
        <div className="hiw-qs">
          {QUESTIONS.map(x => (
            <details key={x.q} className="hiw-q">
              <summary>{x.q}<Icon name="down" size={16} /></summary>
              <p>{x.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

/** Three lines for the home page, with the way to the whole story. */
export function HowItWorksSummary() {
  const brief = [
    { t: 'Choose a folder of chapters', d: 'It becomes a book on your shelf. Nothing is uploaded.' },
    { t: 'Read, or press play', d: 'A voice reads aloud and the page follows word by word.' },
    { t: 'Come back any time', d: 'It opens right where you stopped — even offline.' }
  ];
  return (
    <section id="how" className="hiw-summary" aria-labelledby="hiw-sum-h">
      <Reveal>
        <div className="hiw-sum-head">
          <h2 id="hiw-sum-h" className="section-h display">How it works</h2>
          <Link href="/how-it-works" className="btn" data-variant="ghost">
            The whole journey <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      </Reveal>
      <ol className="hiw-sum-list">
        {brief.map((b, i) => (
          <li key={b.t}>
            <Reveal delay={i * 70}>
              <span className="hiw-sum-n" aria-hidden>{i + 1}</span>
              <h3 className="hiw-sum-t">{b.t}</h3>
              <p className="hiw-sum-d">{b.d}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
