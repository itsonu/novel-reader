// Post-export tidy for GitHub Pages.
import { rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = 'out';
const EMPTY_SLUG = '__none';

// 1. Pages serves with Jekyll by default, which drops any folder starting with "_"
//    — that silently kills every file in /_next. This one empty file prevents it.
await writeFile(join(OUT, '.nojekyll'), '');

// 2. Remove the placeholder route emitted only because Next 15 rejects an empty
//    generateStaticParams(). See lib/mode.ts.
await rm(join(OUT, 'n', EMPTY_SLUG), { recursive: true, force: true });

// 3. Pages has no SPA rewrite; 404.html is what it serves for unknown paths.
try { await access(join(OUT, '404.html')); }
catch { await writeFile(join(OUT, '404.html'), '<meta http-equiv="refresh" content="0; url=./">'); }

console.log('static export ready in ./out');
