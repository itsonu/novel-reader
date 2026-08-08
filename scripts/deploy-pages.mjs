// Publish ./out to the gh-pages branch.
//
// ponytail: a throwaway git repo inside out/ rather than a worktree or a deploy
// action. No history to prune, no orphan-branch dance, and it can't touch the
// working tree of the real repo.
//
// The GitHub Actions path (deploy/pages.yml) is the better long-term answer — this
// exists because the first push happened with a token lacking `workflow` scope.

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'out';
const REMOTE = 'https://github.com/itsonu/novel-reader.git';
const BRANCH = 'gh-pages';

if (!existsSync(join(OUT, 'index.html'))) {
  console.error('No build in ./out — run `npm run build:pages` first.');
  process.exit(1);
}
if (!existsSync(join(OUT, '.nojekyll'))) {
  // Pages runs Jekyll by default and drops every _-prefixed folder, i.e. all of /_next.
  console.error('./out/.nojekyll is missing — the deploy would render a blank site.');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { cwd: OUT, stdio: 'inherit' });
const quiet = (...args) =>
  execFileSync('git', args, { cwd: OUT, encoding: 'utf8' }).trim();

rmSync(join(OUT, '.git'), { recursive: true, force: true });

git('init', '-q');
git('checkout', '-qb', BRANCH);
git('add', '-A');
git('commit', '-q', '-m', `deploy: ${new Date().toISOString().slice(0, 16)}Z`);
git('remote', 'add', 'origin', REMOTE);
git('push', '-f', '-q', 'origin', BRANCH);

console.log(`\ndeployed ${quiet('rev-parse', '--short', 'HEAD')} to ${BRANCH}`);
console.log('https://itsonu.github.io/novel-reader/');
