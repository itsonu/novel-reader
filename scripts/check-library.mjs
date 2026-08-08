// The one runnable check. Library selection is the only place in this feature with
// real branching (status thresholds, join-by-id, tie-breaks), so it is the only place
// worth a test. Run: npm run check
//
// ponytail: no test framework. node's own type stripping runs the .ts directly and
// assert throws loudly enough. Add vitest when there's a second thing worth testing.
import assert from 'node:assert/strict';
import {
  buildCards, selectCards, continueReading, history, favorites,
  statusOf, novelPercent, searchBookmarks
} from '../lib/library-select.ts';

const chapter = (i) => ({ slug: `c${i}`, title: `Chapter ${i}`, ordinal: i, body: 'x', words: 100 });

const novels = [
  { id: 'zephyr', title: 'Zephyr', author: 'Ada', addedAt: 30, chapters: [chapter(1), chapter(2)] },
  { id: 'anvil', title: 'Anvil', author: 'Bo', addedAt: 20, favorite: true, chapters: [chapter(1)] },
  { id: 'mist', title: 'Mist', addedAt: 10, chapters: [chapter(1), chapter(2), chapter(3)] }
];
const saved = [
  { id: 'n:orbit', slug: 'orbit', title: 'Orbit', author: 'Cy', chapters: 4, addedAt: 40, favorite: true }
];
const progress = [
  // half way through Zephyr
  { novelId: 'zephyr', title: 'Zephyr', chapterSlug: 'c1', chapterTitle: 'Chapter 1', chapterIndex: 0,
    chapters: 2, scroll: 0, percent: 0.5, at: 500, href: '/read?novel=zephyr&chapter=c1' },
  // finished Anvil
  { novelId: 'anvil', title: 'Anvil', chapterSlug: 'c1', chapterTitle: 'Chapter 1', chapterIndex: 0,
    chapters: 1, scroll: 0, percent: 1, at: 900, href: '/read?novel=anvil&chapter=c1' },
  // barely started the published one
  { novelId: 'n:orbit', title: 'Orbit', chapterSlug: 'a', chapterTitle: 'A', chapterIndex: 0,
    chapters: 4, scroll: 0, percent: 0.1, at: 700, href: '/n/orbit/a', remote: true }
];

const cards = buildCards(novels, saved, progress);
const by = (id) => cards.find(c => c.id === id);

/* --- join and derived state --- */
assert.equal(cards.length, 4, 'every novel becomes exactly one card');
assert.equal(by('zephyr').status, 'reading');
assert.equal(by('anvil').status, 'finished');
assert.equal(by('mist').status, 'new', 'no progress row is "new", not a hole');
assert.equal(by('mist').percent, 0);
assert.equal(by('zephyr').words, 200, 'words sum across chapters');
assert.equal(by('n:orbit').remote, true);
assert.equal(by('n:orbit').offline, false, 'a published novel is not on the device');
assert.equal(by('mist').offline, true);

/* --- resume href: the thing "Continue reading" depends on --- */
assert.equal(by('zephyr').resumeHref, '/read?novel=zephyr&chapter=c1', 'resumes where they stopped');
assert.equal(by('mist').resumeHref, '/read?novel=mist&chapter=c1', 'unread falls back to chapter one');
assert.equal(by('n:orbit').resumeHref, '/n/orbit/a');
assert.equal(by('mist').detailsHref, '/novel?id=mist');

/* --- status thresholds --- */
assert.equal(statusOf(0), 'new');
assert.equal(statusOf(0.001), 'reading');
assert.equal(statusOf(0.979), 'reading');
assert.equal(statusOf(0.98), 'finished', '98% counts as finished — trailing matter is not a chapter');

/* --- percent maths --- */
assert.equal(novelPercent(0, 10, 0), 0, 'top of chapter one is 0%, not 10%');
assert.equal(novelPercent(9, 10, 1), 1);
assert.equal(novelPercent(4, 10, 0.5), 0.45);
assert.equal(novelPercent(0, 0, 0.5), 0, 'no chapters cannot divide by zero');

/* --- sections --- */
assert.deepEqual(continueReading(cards).map(c => c.id), ['n:orbit', 'zephyr'],
  'in-progress only, most recent first, finished excluded');
assert.deepEqual(history(cards).map(c => c.id), ['anvil', 'n:orbit', 'zephyr'],
  'history includes finished books');
assert.deepEqual(favorites(cards).map(c => c.id), ['anvil', 'n:orbit']);

/* --- search, filter, sort --- */
assert.deepEqual(selectCards(cards, { sort: 'title' }).map(c => c.id), ['anvil', 'mist', 'n:orbit', 'zephyr']);
assert.deepEqual(selectCards(cards, { sort: 'recent' }).map(c => c.id), ['anvil', 'n:orbit', 'zephyr', 'mist'],
  'never-read sorts last, not first');
assert.deepEqual(selectCards(cards, { sort: 'progress' }).map(c => c.id), ['anvil', 'zephyr', 'n:orbit', 'mist']);
assert.deepEqual(selectCards(cards, { sort: 'added' }).map(c => c.id), ['n:orbit', 'zephyr', 'anvil', 'mist']);
assert.deepEqual(selectCards(cards, { status: 'finished' }).map(c => c.id), ['anvil']);
assert.deepEqual(selectCards(cards, { status: 'new' }).map(c => c.id), ['mist']);
assert.deepEqual(selectCards(cards, { q: 'ZEPH' }).map(c => c.id), ['zephyr'], 'search is case-insensitive');
assert.deepEqual(selectCards(cards, { q: 'bo' }).map(c => c.id), ['anvil'], 'search matches author');
assert.deepEqual(selectCards(cards, { q: '  ' }).map(c => c.id).length, 4, 'blank search filters nothing');
assert.deepEqual(selectCards(cards, { q: 'nothing here' }), []);
assert.deepEqual(selectCards(cards, { status: 'reading', q: 'orb' }).map(c => c.id), ['n:orbit'],
  'filter and search compose');

/* --- bookmarks --- */
const marks = [
  { id: 'a', novelId: 'zephyr', novelTitle: 'Zephyr', chapterSlug: 'c1', chapterTitle: 'One',
    note: 'the lamps went out', scroll: 0, href: '/x', at: 2 },
  { id: 'b', novelId: 'mist', novelTitle: 'Mist', chapterSlug: 'c1', chapterTitle: 'Two',
    note: 'a door', scroll: 0, href: '/y', at: 5 }
];
assert.deepEqual(searchBookmarks(marks, '').map(m => m.id), ['b', 'a'], 'newest first');
assert.deepEqual(searchBookmarks(marks, 'lamps').map(m => m.id), ['a'], 'searches the saved line');
assert.deepEqual(searchBookmarks(marks, 'mist').map(m => m.id), ['b'], 'searches the novel title');

console.log('library selection: all checks passed');
