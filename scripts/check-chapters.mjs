// Chapter mutations: the rules that decide slugs, ordinals and counts. Every branch here
// can lose someone's writing if it is wrong, which is why it has a check. Run: npm run check
import assert from 'node:assert/strict';
import {
  countWords, readingMinutes, orderedChapters, chapterIndex, draftSlug,
  upsertChapter, removeChapter, moveChapter, chapterLabel
} from '../lib/chapters.ts';

const ch = (slug, ordinal, body = 'one two three') => ({
  slug, title: slug, ordinal, body, words: countWords(body)
});
// Deliberately out of order in storage — IndexedDB returns insertion order, not reading order.
const novel = { id: 'n', title: 'N', addedAt: 0, chapters: [ch('c', 3), ch('a', 1), ch('b', 2)] };

/* --- counting --- */
assert.equal(countWords(''), 0);
assert.equal(countWords('   \n  '), 0, 'whitespace is not a word');
assert.equal(countWords('one'), 1);
assert.equal(countWords('  one   two \n three '), 3, 'runs of whitespace collapse');
assert.equal(readingMinutes(0), 0, 'an empty chapter has no read time, not "1 min"');
assert.equal(readingMinutes(1), 1, 'anything at all rounds up to a minute');
assert.equal(readingMinutes(238), 1);
assert.equal(readingMinutes(1200), 5);

/* --- ordering --- */
assert.deepEqual(orderedChapters(novel).map(c => c.slug), ['a', 'b', 'c'], 'reading order, not storage order');
assert.equal(chapterIndex(novel, 'b'), 1);
assert.equal(chapterIndex(novel, 'nope'), -1);
assert.equal(chapterLabel(0), 'Chapter 01');
assert.equal(chapterLabel(11), 'Chapter 12');

/* --- slugs: decided once, never changed, never collide --- */
assert.equal(draftSlug('The Storm', [], 0), 'the-storm');
assert.equal(draftSlug('The Storm', ['the-storm'], 0), 'the-storm-2', 'a repeated title does not overwrite');
assert.equal(draftSlug('The Storm', ['the-storm', 'the-storm-2'], 0), 'the-storm-3');
assert.match(draftSlug('', [], 1234), /^untitled-/, 'an untitled draft still gets a stable id');
assert.equal(draftSlug('', [], 1234), draftSlug('', [], 1234), 'same moment, same slug — saves are idempotent');
assert.notEqual(draftSlug('', [], 1), draftSlug('', [], 2));
assert.equal(draftSlug('!!!', [], 7), `untitled-${(7).toString(36)}`, 'a title of pure punctuation is not a slug');

/* --- upsert --- */
const added = upsertChapter(novel, { slug: 'd', title: 'Fourth', body: 'a b' });
assert.equal(added.chapters.length, 4);
assert.equal(added.chapters.find(c => c.slug === 'd').ordinal, 4, 'a new chapter lands last');
assert.equal(added.chapters.find(c => c.slug === 'd').words, 2);
assert.equal(novel.chapters.length, 3, 'the input novel is not mutated');

const edited = upsertChapter(novel, { slug: 'a', title: 'Renamed', body: 'one two three four' });
assert.equal(edited.chapters.length, 3, 'editing does not add a chapter');
assert.equal(edited.chapters.find(c => c.slug === 'a').title, 'Renamed');
assert.equal(edited.chapters.find(c => c.slug === 'a').words, 4, 'word count follows the body');
assert.equal(edited.chapters.find(c => c.slug === 'a').ordinal, 1, 'editing keeps its position');

assert.equal(
  upsertChapter(novel, { slug: 'e', title: '   ', body: '' }).chapters.find(c => c.slug === 'e').title,
  'Untitled chapter',
  'a blank title is filled in, not saved blank'
);

/* --- remove: renumbers, so no gap survives to confuse a reorder --- */
const removed = removeChapter(novel, 'b');
assert.deepEqual(removed.chapters.map(c => [c.slug, c.ordinal]), [['a', 1], ['c', 2]]);
assert.deepEqual(removeChapter(novel, 'missing').chapters.map(c => c.slug), ['a', 'b', 'c']);

/* --- move --- */
assert.deepEqual(moveChapter(novel, 0, 2).chapters.map(c => [c.slug, c.ordinal]),
  [['b', 1], ['c', 2], ['a', 3]], 'first to last');
assert.deepEqual(moveChapter(novel, 2, 0).chapters.map(c => c.slug), ['c', 'a', 'b'], 'last to first');
assert.deepEqual(moveChapter(novel, 1, 1).chapters.map(c => c.slug), ['a', 'b', 'c'], 'no-op stays put');
assert.deepEqual(moveChapter(novel, 0, 99).chapters.map(c => c.slug), ['b', 'c', 'a'], 'overshoot clamps to last');
assert.deepEqual(moveChapter(novel, 0, -5).chapters.map(c => c.slug), ['a', 'b', 'c'], 'undershoot clamps to first');
assert.deepEqual(moveChapter(novel, 9, 0).chapters.map(c => c.slug), ['a', 'b', 'c'], 'moving nothing changes nothing');

console.log('chapter rules: all checks passed');
