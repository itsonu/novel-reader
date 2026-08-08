// Folder-merge rules. This is the code path that could silently destroy a manuscript,
// so it gets the most paranoid check in the repo. Run: npm run check
import assert from 'node:assert/strict';
import { mergeScan, describeMerge } from '../lib/sync.ts';

const stored = (slug, ordinal, body, title = slug) => ({
  slug, title, ordinal, body, words: body.trim().split(/\s+/).filter(Boolean).length
});
const scan = (slug, ordinal, body, title = slug) => ({ slug, title, ordinal, body });

const novel = {
  id: 'n', title: 'N', addedAt: 0,
  chapters: [stored('one', 1, 'a b c'), stored('two', 2, 'd e'), stored('three', 3, 'f')]
};

/* --- nothing changed --- */
const same = mergeScan(novel, [scan('one', 1, 'a b c'), scan('two', 2, 'd e'), scan('three', 3, 'f')]);
assert.deepEqual([same.added, same.updated, same.missing], [0, 0, 0]);
assert.equal(describeMerge(same), 'Already up to date.');
assert.deepEqual(same.novel.chapters.map(c => c.slug), ['one', 'two', 'three']);

/* --- a new file appears --- */
const grown = mergeScan(novel, [
  scan('one', 1, 'a b c'), scan('two', 2, 'd e'), scan('three', 3, 'f'), scan('four', 4, 'g h i j')
]);
assert.equal(grown.added, 1);
assert.equal(grown.updated, 0);
assert.equal(grown.novel.chapters.length, 4);
assert.equal(grown.novel.chapters.find(c => c.slug === 'four').words, 4, 'new chapters get counted');
assert.equal(grown.novel.chapters.find(c => c.slug === 'four').ordinal, 4);
assert.match(describeMerge(grown), /1 new chapter/);

/* --- a file was rewritten --- */
const edited = mergeScan(novel, [scan('one', 1, 'a b c d e f'), scan('two', 2, 'd e'), scan('three', 3, 'f')]);
assert.equal(edited.updated, 1);
assert.equal(edited.added, 0);
assert.equal(edited.novel.chapters.find(c => c.slug === 'one').words, 6, 'word count follows the new body');

/* --- a retitled file, same body --- */
const retitled = mergeScan(novel, [scan('one', 1, 'a b c', 'A Better Name'), scan('two', 2, 'd e'), scan('three', 3, 'f')]);
assert.equal(retitled.updated, 1);
assert.equal(retitled.novel.chapters.find(c => c.slug === 'one').title, 'A Better Name');

/* --- identical bytes are never counted as an update, whatever the filesystem says --- */
assert.equal(mergeScan(novel, [scan('one', 1, 'a b c')]).updated, 0,
  'a touched-but-unchanged file must not churn');

/* --- THE IMPORTANT ONE: a file disappears --- */
const gone = mergeScan(novel, [scan('one', 1, 'a b c')]);
assert.equal(gone.missing, 2, 'missing files are reported');
assert.equal(gone.novel.chapters.length, 3, 'and are NEVER deleted from the device');
assert.deepEqual(gone.novel.chapters.map(c => c.slug), ['one', 'two', 'three'],
  'survivors keep their relative order, after what the folder still has');
assert.deepEqual(gone.novel.chapters.map(c => c.ordinal), [1, 2, 3], 'ordinals stay contiguous');
assert.match(describeMerge(gone), /no longer in the folder — kept on this device/);

/* --- an empty scan must not empty the book --- */
const emptied = mergeScan(novel, []);
assert.equal(emptied.novel.chapters.length, 3, 'an unreadable or empty folder deletes nothing');
assert.equal(emptied.missing, 3);

/* --- chapters written in the app survive a folder refresh --- */
const mixed = { ...novel, chapters: [...novel.chapters, stored('handwritten', 4, 'x y')] };
const after = mergeScan(mixed, [scan('one', 1, 'a b c'), scan('two', 2, 'd e'), scan('three', 3, 'f')]);
assert.ok(after.novel.chapters.some(c => c.slug === 'handwritten'), 'app-written chapters are not disk-owned');
assert.equal(after.novel.chapters.find(c => c.slug === 'handwritten').ordinal, 4, 'and land after the scanned ones');

/* --- reordering on disk reorders the book --- */
const flipped = mergeScan(novel, [scan('three', 1, 'f'), scan('two', 2, 'd e'), scan('one', 3, 'a b c')]);
assert.deepEqual(flipped.novel.chapters.map(c => c.slug), ['three', 'two', 'one']);
assert.deepEqual(flipped.novel.chapters.map(c => c.ordinal), [1, 2, 3]);
assert.equal(flipped.updated, 0, 'moving a file is not editing it');

/* --- the input is never mutated --- */
assert.equal(novel.chapters.length, 3);
assert.equal(novel.chapters[0].words, 3);

console.log('folder merge: all checks passed');
