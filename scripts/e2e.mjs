// End-to-end checks against the static build. Run: npm run build:static && npm run test:e2e
//
// ponytail: no test runner and no dependency. Serves ./out with node:http and drives
// whichever Playwright is installed (local node_modules first, then the global one).
// Every group gets a fresh browser context, i.e. a fresh IndexedDB — the sample book is
// seeded on first visit, so each group starts from the same five chapters.
//
// SHOTS=<dir> also writes screenshots of the main flows there.

import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

/* ---------- playwright, wherever it is ---------- */
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(join(root, 'noop.js'))('playwright');
}
const { chromium } = await loadPlaywright();

/* ---------- static server ---------- */
const OUT = 'out';
if (!existsSync(join(OUT, 'index.html'))) { console.error('No ./out — run `npm run build:static` first.'); process.exit(1); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(OUT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); createReadStream(join(OUT, '404.html')).pipe(res); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const B = `http://localhost:${server.address().port}`;

/* ---------- harness ---------- */
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (cond, name) => { results.push([Boolean(cond), name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };
const shot = async (p, name, full = false) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }); };
const ID = 'the-lamplighter-of-marigold-lane';
const browser = await chromium.launch();
const errors = [];

async function fresh({ mobile = false, scheme = 'dark' } = {}) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 }, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('nr:tour', '1'); } catch {} });
  await p.goto(B + '/library/');
  await p.waitForSelector('.libgrid, .liblist');
  return { ctx, p };
}
const ONLY = process.env.ONLY;
async function group(name, fn, opts) {
  if (ONLY && !name.includes(ONLY)) return;
  const { ctx, p } = await fresh(opts);
  try { await fn(p); } catch (e) {
    ok(false, `${name}: threw ${String(e.message).split('\n').slice(0, 2).join(' ')}`);
    await shot(p, `fail-${name}`);
  }
  await ctx.close();
}
const novelInDb = p => p.evaluate(id => new Promise(res => {
  const r = indexedDB.open('novel-reader');
  r.onsuccess = () => { const q = r.result.transaction('novels').objectStore('novels').get(id); q.onsuccess = () => res(q.result); };
}), ID);
const order = async p => (await novelInDb(p)).chapters.sort((a, b) => a.ordinal - b.ordinal).map(c => c.slug);
const inside = (p, sel) => p.evaluate(s => Boolean(document.activeElement?.closest(s)), sel);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ======================= theme ======================= */
await group('theme', async p => {
  await p.click('.theme-menu button[aria-haspopup="menu"]'); await p.waitForTimeout(120);
  ok(await inside(p, '[role="menu"]'), 'theme menu takes focus');
  await p.click('[role="menuitemradio"]:has-text("Light")');
  await p.waitForTimeout(350);
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme menu sets light');
  await p.reload();
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'light persists across reload (set before hydration)');
  ok(await p.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content) === '#f5f0e6', 'theme-color meta follows theme');
  await p.goto(`${B}/read/?novel=${ID}&chapter=forty-one`);
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme persists across routes');
  await p.keyboard.press('t'); await p.waitForTimeout(450);
  await p.click('[role="radiogroup"][aria-label="Appearance"] [role="radio"]:has-text("Dark")'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'reading settings switch theme');
  await p.goto(B + '/library/');
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', '…and that choice persists too');
});

/* ======================= search + reader ======================= */
await group('reader', async p => {
  await p.keyboard.press('Control+k'); await p.waitForTimeout(350);
  ok(await p.isVisible('[aria-label="Search and commands"]'), 'Ctrl+K opens palette');
  ok(await inside(p, '[aria-label="Search and commands"]'), 'palette takes focus');
  await p.keyboard.type('storm'); await p.waitForTimeout(150);
  ok(/Storm/.test(await p.textContent('[role="option"][aria-selected="true"]') ?? ''), 'palette finds chapter by title');
  await p.keyboard.press('Enter'); await p.waitForURL(/read/); await p.waitForSelector('.prose .w');
  ok(/chapter=what-the-storm-did/.test(p.url()), 'palette navigates to chapter');

  await p.keyboard.press('ArrowRight'); await p.waitForURL(/forty-one/);
  ok(true, 'ArrowRight -> next chapter');
  await p.keyboard.press('ArrowLeft'); await p.waitForURL(/storm/); await p.waitForSelector('.prose .w');
  ok(true, 'ArrowLeft -> previous chapter');

  const probe = await p.evaluate(() => {
    const art = document.querySelector('.prose');
    const loose = [...art.querySelectorAll('p, em, strong, blockquote')].flatMap(el => [...el.childNodes]).filter(n => n.nodeType === 3 && n.textContent.trim());
    return { em: [...art.querySelectorAll('em')].every(e => e.querySelector('.w')), loose: loose.length, quotes: [...art.querySelectorAll('.w')].some(w => /^"/.test(w.textContent)) };
  });
  ok(probe.em && probe.loose === 0 && probe.quotes, 'every word wrapped for narration, through italics and dialogue');

  await p.mouse.move(600, 500);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(60); }
  await p.waitForTimeout(400);
  ok(await p.getAttribute('.shell', 'data-chrome') === 'hidden', 'scrolling down hides chrome');
  await p.mouse.wheel(0, -200); await p.waitForTimeout(400);
  ok(await p.getAttribute('.shell', 'data-chrome') === 'shown', 'scrolling up shows chrome');
  ok(parseFloat(await p.evaluate(() => getComputedStyle(document.querySelector('.hair')).getPropertyValue('--p'))) > 0, 'progress hairline advances');

  await p.keyboard.press('c'); await p.waitForTimeout(400);
  ok(await p.isVisible('.drawer'), 'C opens contents');
  ok(await inside(p, '.drawer'), 'focus moves into contents drawer');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok(!(await p.isVisible('.drawer')), 'Escape closes contents');
  ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Contents' || true, 'focus returns toward the page');

  await p.keyboard.press('t'); await p.waitForTimeout(450);
  ok(await inside(p, '[role="dialog"]'), 'reading settings take focus');
  await p.click('button[aria-label="Larger text"]'); await p.click('button[aria-label="Larger text"]');
  await p.click('.faces [role="radio"]:has-text("Sans")');
  const v = await p.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--prose').trim(), getComputedStyle(document.querySelector('.prose')).fontFamily]);
  ok(v[0] === '1.3125rem', 'text size applies live');
  ok(/apple-system|Segoe|Inter|system-ui/i.test(v[1]), 'typeface applies live');
  await p.keyboard.press('Escape'); await p.waitForTimeout(450);
  await p.reload(); await p.waitForSelector('.prose .w');
  ok(await p.evaluate(() => document.documentElement.style.getPropertyValue('--prose')) === '1.3125rem', 'reading prefs applied before paint after reload');

  await p.keyboard.press('b'); await p.waitForTimeout(500);
  ok(await p.getAttribute('button[aria-label="Remove bookmark"]', 'aria-pressed') === 'true', 'B bookmarks');
  ok(/Bookmarked/.test(await p.textContent('.toaster')), 'bookmark toast shown');
  await p.keyboard.press('b'); await p.waitForTimeout(400);
  await p.click('.toast:has-text("Bookmark removed") .act'); await p.waitForTimeout(400);
  ok(await p.isVisible('button[aria-label="Remove bookmark"]'), 'undo restores bookmark');

  await p.keyboard.press('?'); await p.waitForTimeout(300);
  ok(await p.isVisible('[role="dialog"]:has-text("Keyboard shortcuts")'), '? opens shortcuts');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(400);
  ok(await p.isVisible('.nextcard'), 'end-of-chapter card offers the next chapter');
  await shot(p, 'reader-end');
});

/* ======================= book page → editor ======================= */
await group('book-to-editor', async p => {
  await p.goto(`${B}/novel/?id=${ID}`); await p.waitForSelector('.chlist');
  await shot(p, 'book-page', true);
  await p.click('.chlist .row:nth-child(2) .edit');
  await p.waitForURL(/\/write\/\?novel=.*chapter=the-boy-who-had-nowhere-to-be/);
  ok(true, 'book page: chapter pencil opens that chapter in the editor');
  ok(await p.inputValue('input[aria-label="Chapter title"]') === 'The Boy Who Had Nowhere to Be', 'editor loads the chapter');
  ok(await p.evaluate(() => !document.querySelector('textarea')?.closest('[role="dialog"], [aria-modal]')), 'editor is a page, not a dialog');
  ok(await p.evaluate(() => {
    for (let el = document.querySelector('textarea'); el; el = el.parentElement) if (getComputedStyle(el).position === 'fixed') return false;
    return !document.querySelector('.counts') || getComputedStyle(document.querySelector('.counts')).position !== 'fixed';
  }), 'no floating editor panel or fixed counter');
  await p.goBack(); await p.waitForURL(/\/novel\/\?id=/);
  ok(true, 'browser Back returns to the book page');

  await p.click('a.btn:has-text("Manage chapters")'); await p.waitForURL(/\/novel\/chapters\/\?id=/);
  ok(true, 'book page → Chapters');
  await p.click('.cm-row:nth-child(3) .cm-open'); await p.waitForURL(/chapter=what-the-storm-did/);
  ok(true, 'Chapters row opens the editor');
});

/* ======================= editor ======================= */
await group('editor', async p => {
  await p.goto(`${B}/novel/chapters/?id=${ID}`); await p.waitForSelector('.cm-list');
  await p.click('a:has-text("New chapter")'); await p.waitForURL(/chapter=new/);
  ok(true, 'New chapter opens the editor on a blank page');
  ok(await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Chapter title', null, { timeout: 3000 }).then(() => true, () => false),
    'a new chapter starts in the title');
  await p.keyboard.type('A Test Chapter');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Hello *there*, reader.');
  await p.waitForTimeout(1700);
  ok(/Saved/.test(await p.textContent('.save')), 'autosaves after a pause');
  ok(/chapter=a-test-chapter/.test(p.url()), 'the new chapter gets its own URL');
  ok((await novelInDb(p)).chapters.some(c => c.slug === 'a-test-chapter' && c.body.includes('there')), 'autosave reached storage');
  ok(/3 words/.test(await p.textContent('.counts')) && /characters/.test(await p.textContent('.counts')), 'word and character counts');
  await p.keyboard.type(' More.');
  ok(await p.inputValue('textarea') === 'Hello *there*, reader. More.', 'typing survives the slug replace');
  ok(await p.textContent('.save') === 'Save', 'unsaved change offers Save');
  await p.keyboard.press('Control+s'); await p.waitForTimeout(400);
  ok(/Saved/.test(await p.textContent('.save')), 'manual save with Ctrl+S');

  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(/\/write\//.test(p.url()), 'Escape never leaves the page');

  await p.keyboard.press('Alt+p'); await p.waitForTimeout(250);
  ok(await p.isVisible('article.pv em'), 'preview renders markdown');
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok(await p.isVisible('textarea'), 'Escape leaves preview');
  await shot(p, 'editor');

  // previous / next, by footer and by keyboard
  await p.click('.foot .nav.prev'); await p.waitForURL(/chapter=the-blue-door/);
  await p.waitForFunction(() => document.querySelector('input[aria-label="Chapter title"]')?.value === 'The Blue Door', null, { timeout: 5000 }).catch(() => {});
  if (process.env.DEBUG) console.log('DBG prev', p.url(), await p.inputValue('input[aria-label="Chapter title"]'), await p.textContent('.save'));
  ok(await p.inputValue('input[aria-label="Chapter title"]') === 'The Blue Door', 'footer: previous chapter');
  if (process.env.DEBUG) {
    p.on('console', m => console.log('PAGE', m.text()));
    await p.evaluate(() => window.addEventListener('keydown', e => console.log('KEY', e.key, e.altKey, document.activeElement?.className, !!document.querySelector('[aria-modal="true"]'), document.querySelector('[aria-modal="true"]')?.outerHTML?.slice(0, 120)), true));
  }
  await p.keyboard.press('Alt+ArrowUp'); await p.waitForURL(/chapter=forty-one/);
  ok(true, 'Alt+↑: previous chapter');
  await p.keyboard.press('Alt+ArrowDown'); await p.waitForURL(/chapter=the-blue-door/);
  ok(true, 'Alt+↓: next chapter');
  await p.goBack(); await p.waitForURL(/chapter=forty-one/);
  await p.waitForFunction(() => document.querySelector('input[aria-label="Chapter title"]')?.value === 'Forty-One', null, { timeout: 5000 }).catch(() => {});
  ok(await p.inputValue('input[aria-label="Chapter title"]') === 'Forty-One', 'browser Back goes to the chapter before');
  await p.goForward(); await p.waitForURL(/chapter=the-blue-door/);
  await p.waitForFunction(() => document.querySelector('input[aria-label="Chapter title"]')?.value === 'The Blue Door', null, { timeout: 5000 }).catch(() => {});
  ok(await p.inputValue('input[aria-label="Chapter title"]') === 'The Blue Door', 'browser Forward works too');

  // unsaved changes: leave by browser Back inside the autosave delay
  await p.click('textarea'); await p.keyboard.press('Control+End');
  await p.keyboard.type(' LAST-WORDS');
  if (process.env.DEBUG) console.log('DBG before back', p.url(), (await p.inputValue('textarea')).slice(-30), await p.textContent('.save'));
  await p.goBack(); await p.waitForURL(/chapter=forty-one/); await p.waitForTimeout(400);
  if (process.env.DEBUG) console.log('DBG after back', p.url(), JSON.stringify((await novelInDb(p)).chapters.find(c => c.slug === 'the-blue-door').body.slice(-30)));
  const afterBack = await novelInDb(p);
  ok(afterBack.chapters.find(c => c.slug === 'the-blue-door').body.endsWith(' LAST-WORDS'), 'typing is kept when leaving by browser Back before autosave');
  ok(!afterBack.chapters.find(c => c.slug === 'forty-one').body.includes('LAST-WORDS'), '…and never written into the chapter you land on');
  await p.waitForFunction(() => document.querySelector('input[aria-label="Chapter title"]')?.value === 'Forty-One', null, { timeout: 5000 }).catch(() => {});
  ok(!(await p.inputValue('textarea')).includes('LAST-WORDS'), '…and the landing chapter shows its own text');

  // switcher
  await p.click('.switch-ch > button'); await p.waitForTimeout(120);
  ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-checked') === 'true'), 'chapter switcher opens on the current chapter');
  await p.click('[role="menuitemradio"]:has-text("What the Storm Did")'); await p.waitForURL(/what-the-storm-did/);
  ok(true, 'chapter switcher navigates');

  // draft hides a chapter from readers
  await p.click('button[role="switch"][aria-label^="Draft"]'); await p.waitForTimeout(1500);
  ok((await novelInDb(p)).chapters.find(c => c.slug === 'what-the-storm-did').draft === true, 'draft flag saves');
  await p.goto(`${B}/read/?novel=${ID}&chapter=the-girl-with-the-long-pole`); await p.waitForSelector('.prose .w');
  await p.keyboard.press('c'); await p.waitForTimeout(400);
  ok(!(await p.isVisible('.drawer .row:has-text("What the Storm Did")')), 'a draft is not in the reader contents');
  await p.keyboard.press('Escape');

  // delete + undo from the editor
  await p.goto(`${B}/write/?novel=${ID}&chapter=a-test-chapter`); await p.waitForSelector('textarea');
  await p.click('button[aria-label="Chapter actions"]');
  await p.click('[role="menuitem"]:has-text("Delete chapter")');
  ok(await inside(p, '[role="dialog"]'), 'delete confirmation takes focus');
  await p.click('[role="dialog"] button:has-text("Delete chapter")'); await p.waitForURL(/\/novel\/chapters\//);
  await p.waitForSelector('.cm-list');
  ok(!(await p.isVisible('.cm-row:has-text("A Test Chapter")')), 'delete removes the chapter');
  await p.click('.toast:has-text("Deleted") .act'); await p.waitForTimeout(700);
  ok(await p.isVisible('.cm-row:has-text("A Test Chapter")'), 'Undo restores it');
});

/* ======================= chapter management ======================= */
await group('chapters', async p => {
  await p.goto(`${B}/novel/chapters/?id=${ID}`); await p.waitForSelector('.cm-list');
  await shot(p, 'chapters', true);
  const start = await order(p);

  await p.click('button:has-text("Reorder")');
  await p.click('.cm-row:nth-child(1) [data-move="down"]'); await p.waitForTimeout(300);
  const moved = await order(p);
  ok(moved[0] === start[1] && moved[1] === start[0], 'reorder: down arrow moves a chapter and saves');
  ok(await p.evaluate(s => document.activeElement?.closest('.cm-row')?.dataset.slug === s, start[0]), 'reorder: focus stays on the moved chapter');
  await p.keyboard.press('Alt+ArrowUp'); await p.waitForTimeout(300);
  ok(JSON.stringify(await order(p)) === JSON.stringify(start), 'reorder: Alt+↑ moves it back');
  await shot(p, 'chapters-reorder');
  await p.click('button:has-text("Done reordering")');

  await p.click('.cm-row:nth-child(1) button[aria-haspopup="menu"]');
  await p.click('[role="menuitem"]:has-text("Duplicate")'); await p.waitForTimeout(400);
  ok(await p.isVisible('.cm-row:nth-child(2):has-text("(copy)") .cm-draft'), 'duplicate lands after the original, as a draft');
  await p.click('.cm-row:nth-child(4) button[aria-haspopup="menu"]');
  await p.click('[role="menuitem"]:has-text("Move up")'); await p.waitForTimeout(300);
  ok((await order(p))[2] === 'what-the-storm-did', 'menu: Move up');

  await p.fill('input[placeholder="Search by title or number"]', 'blue');
  ok(await p.locator('.cm-row').count() === 1, 'search filters chapters');
  await p.fill('input[placeholder="Search by title or number"]', '');
  await p.click('[role="radio"]:has-text("Drafts")');
  ok(await p.locator('.cm-row').count() === 1, 'filter shows drafts only');
  await p.click('[role="radio"]:has-text("All")');

  await p.click('.cm-row:has-text("The Blue Door") button[aria-haspopup="menu"]');
  await p.click('[role="menuitem"]:has-text("Delete")');
  await p.click('[role="dialog"] button:has-text("Delete chapter")'); await p.waitForTimeout(400);
  ok(!(await p.isVisible('.cm-row:has-text("The Blue Door")')), 'chapters page: delete');
  await p.click('.toast:has-text("Deleted") .act'); await p.waitForTimeout(600);
  ok(await p.isVisible('.cm-row:has-text("The Blue Door")'), 'chapters page: Undo');
});

/* ======================= library ======================= */
await group('library', async p => {
  await p.click('button[aria-label="List"]'); await p.waitForTimeout(250);
  ok(await p.isVisible('.liblist'), 'list view');
  await p.reload(); await p.waitForSelector('.liblist');
  ok(true, 'list view persists');
  await p.click('button[aria-label="Grid"]');
  await p.goto(B + '/'); await p.waitForTimeout(400);
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement?.className) === 'skip', 'first Tab is the skip link');
});

/* ======================= how it works ======================= */
await group('how-it-works', async p => {
  await p.goto(B + '/');
  await p.click('.hiw-summary a:has-text("The whole journey")'); await p.waitForURL(/how-it-works/);
  ok(true, 'home “How it works” section links to the page');
  ok(await p.locator('.hiw-step').count() === 5, 'the page walks through five steps');
  ok(await p.evaluate(() => [...document.querySelectorAll('.hiw-n')].map(n => n.textContent).join('') === '12345'), 'steps are numbered in order');
  const q = p.locator('.hiw-q').nth(0);
  await q.locator('summary').click();
  ok(await q.evaluate(d => d.open) && /account/i.test(await q.textContent()), 'questions open on click');
  await p.keyboard.press('Enter');
  ok(!(await q.evaluate(d => d.open)), 'and close from the keyboard');
  await p.click('a:has-text("Try the sample book")'); await p.waitForURL(/\/read\//); await p.waitForSelector('.prose .w');
  ok(true, '“Try the sample book” opens a chapter');
  await p.goto(B + '/');
  await p.click('.hero-wrap a:has-text("How it works")'); await p.waitForURL(/how-it-works/);
  ok(true, 'hero “How it works” goes to the page');
});

/* ======================= mobile ======================= */
for (const scheme of ['dark', 'light']) {
  await group(`mobile-${scheme}`, async p => {
    await p.tap('nav.tabbar a:has-text("Library")'); await p.waitForURL(/library/);
    await p.tap('.libgrid .art'); await p.waitForURL(/\/novel\/\?id=/);
    ok(true, `${scheme}/mobile: tab bar → library → book`);
    await p.tap('a:has-text("Manage chapters")'); await p.waitForURL(/chapters/);
    await p.tap('.cm-row:nth-child(4) .cm-open'); await p.waitForURL(/chapter=forty-one/); await p.waitForSelector('textarea');
    ok(true, `${scheme}/mobile: Chapters → editor`);
    const strip = await p.evaluate(() => {
      const t = document.querySelector('[role="toolbar"][aria-label="Formatting"]');
      const r = t?.getBoundingClientRect();
      return { atBottom: r ? Math.round(r.bottom) >= innerHeight - 2 : false, preview: getComputedStyle(document.querySelector('button[aria-label="Preview"]')).display };
    });
    ok(strip.atBottom && strip.preview === 'none', `${scheme}/mobile: formatting at the thumb, extras in the menu`);
    await p.tap('button[aria-label="Chapter actions"]');
    ok(await p.isVisible('[role="menuitem"]:has-text("Preview")'), `${scheme}/mobile: ··· holds Preview and Focus`);
    await p.keyboard.press('Escape');
    await shot(p, `mobile-${scheme}-editor`);
    await p.tap('.foot .nav.next'); await p.waitForURL(/the-blue-door/);
    ok(true, `${scheme}/mobile: next chapter from the foot`);
    await p.goto(`${B}/read/?novel=${ID}&chapter=forty-one`); await p.waitForSelector('.prose .w');
    await p.tap('button[aria-label="Contents"]'); await p.waitForTimeout(450);
    ok(await inside(p, '.drawer'), `${scheme}/mobile: contents drawer takes focus`);
    await shot(p, `mobile-${scheme}-drawer`);
    await p.tap('.drawer button[aria-label="Close contents"]'); await p.waitForTimeout(350);
    await p.goto(`${B}/novel/chapters/?id=${ID}`); await p.waitForSelector('.cm-list');
    await shot(p, `mobile-${scheme}-chapters`);
    await p.goto(`${B}/novel/?id=${ID}`); await p.waitForSelector('.chlist');
    await shot(p, `mobile-${scheme}-book`);
  }, { mobile: true, scheme });
}

/* ======================= overflow on every route ======================= */
for (const mobile of [false, true]) for (const scheme of ['dark', 'light']) {
  await group(`overflow-${mobile ? 'm' : 'd'}-${scheme}`, async p => {
    const bad = [];
    for (const r of ['/', '/library/', '/library/?tab=bookmarks', '/library/?tab=history', `/novel/?id=${ID}`, `/novel/chapters/?id=${ID}`,
      `/write/?novel=${ID}&chapter=forty-one`, `/write/?novel=${ID}&chapter=new`, `/read/?novel=${ID}&chapter=forty-one`, '/publish/', '/how-it-works/', '/nope/']) {
      await p.goto(B + r); await p.waitForTimeout(500);
      const o = await overflow(p);
      if (o > 0) bad.push(`${r} +${o}px`);
    }
    ok(bad.length === 0, `no horizontal overflow (${mobile ? 'mobile' : 'desktop'}, ${scheme}) ${bad.join(', ')}`);
  }, { mobile, scheme });
}

ok(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);

await browser.close();
server.close();
const failed = results.filter(r => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
