// npm run install-app: build a release and install it as /Applications/<productName>.app,
// replacing older copies (including the pre-rename SuperCut.app), then index it for Spotlight.
// Why: the build only lands in the hidden shared Cargo target, which Spotlight never shows.
// Pass --no-build to install the last build as is.
const { execFileSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const path = require('node:path');
const { root, productName, appPath } = require('./bundle');

const APPLICATIONS = '/Applications';
const OLD_NAMES = ['SuperCut'];

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
const read = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const log = (msg) => console.log(`[install] ${msg}`);

function quit(name) {
  try {
    execFileSync('osascript', ['-e', `quit app "${name}"`], { stdio: 'ignore' });
  } catch {
    // Not running: nothing to quit.
  }
}

function removeOld(dest) {
  for (const name of [productName, ...OLD_NAMES]) {
    const old = path.join(APPLICATIONS, `${name}.app`);
    if (!existsSync(old)) continue;
    quit(name);
    rmSync(old, { recursive: true, force: true });
    log(`removed ${old}`);
  }
  if (existsSync(dest)) throw new Error(`could not remove ${dest}`);
}

function indexForSpotlight(dest) {
  // Register with Launch Services and hand the bundle to Spotlight right away,
  // instead of waiting for the background indexer to notice the copy.
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  run(lsregister, ['-f', dest]);
  run('mdimport', [dest]);
}

function waitForSpotlight(dest, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const found = read('mdfind', [`kMDItemDisplayName == "${productName}*"`]).split('\n');
    if (found.includes(dest)) return true;
    execFileSync('sleep', ['1']);
  }
  return false;
}

function main() {
  if (!process.argv.includes('--no-build')) run('npm', ['run', 'build']);

  const built = appPath();
  if (!existsSync(built)) throw new Error(`no built app at ${built}; run npm run build`);

  const dest = path.join(APPLICATIONS, `${productName}.app`);
  removeOld(dest);
  run('ditto', [built, dest]);
  log(`installed ${dest}`);

  indexForSpotlight(dest);
  if (!waitForSpotlight(dest)) throw new Error(`Spotlight does not list ${dest} yet`);
  log(`Spotlight finds ${dest}`);

  run('open', [dest]);
  log(`opened ${dest}`);
}

try {
  main();
} catch (err) {
  console.error(`[install] failed: ${err.message}`);
  process.exit(1);
}
