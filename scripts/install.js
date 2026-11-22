// npm run install-app: build a release and install it as /Applications/<productName>.app,
// replacing older copies (including the pre-rename SuperCut.app), then index it for Spotlight.
// Why: the build only lands in the hidden shared Cargo target, which Spotlight never shows.
// The shared target is written by every checkout, so the install proves (by build id) that
// the app it copies, and the copy in /Applications, embed this checkout's frontend.
// Pass --no-build to install the last build as is (still checked);
// --any-branch to install a checkout that is behind main.
const { execFileSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const path = require('node:path');
const { root, productName, appPath } = require('./bundle');
const { frontendId, appBuildId } = require('./build-id');

const APPLICATIONS = '/Applications';
const OLD_NAMES = ['SuperCut'];
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
const read = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();
const log = (msg) => console.log(`[install] ${msg}`);

// Installing an older branch over the app would hide everything merged since.
function assertNotBehindMain() {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', 'main', 'HEAD'], { cwd: root, stdio: 'ignore' });
  } catch {
    throw new Error('this checkout is behind main; installing it would roll the app back (pass --any-branch to do it anyway)');
  }
}

function assertBuildId(app, expected, what) {
  const actual = appBuildId(app);
  if (actual !== expected) {
    throw new Error(`${what} ${app} embeds frontend ${actual}, this checkout is ${expected}` +
      ' (another checkout built into the shared target meanwhile? run install-app again)');
  }
}

function quit(name) {
  try {
    execFileSync('osascript', ['-e', `quit app "${name}"`], { stdio: 'ignore' });
  } catch {
    // Not running: nothing to quit.
  }
}

function removeOld(dest) {
  for (const name of [productName, ...OLD_NAMES]) {
    quit(name);
    const old = path.join(APPLICATIONS, `${name}.app`);
    if (!existsSync(old)) continue;
    rmSync(old, { recursive: true, force: true });
    log(`removed ${old}`);
  }
  if (existsSync(dest)) throw new Error(`could not remove ${dest}`);
}

function indexForSpotlight(dest, built) {
  // Only the installed copy should be known to Launch Services, so Spotlight, the Dock and
  // `open` never pick the build output. Then hand the bundle to Spotlight right away,
  // instead of waiting for the background indexer to notice the copy.
  run(LSREGISTER, ['-u', built]);
  run(LSREGISTER, ['-f', dest]);
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
  const args = process.argv.slice(2);
  if (!args.includes('--any-branch')) assertNotBehindMain();
  if (!args.includes('--no-build')) run('npm', ['run', 'build']);

  const built = appPath();
  if (!existsSync(built)) throw new Error(`no built app at ${built}; run npm run build`);
  const expected = frontendId(path.join(root, 'src'));
  assertBuildId(built, expected, 'built app');

  const dest = path.join(APPLICATIONS, `${productName}.app`);
  removeOld(dest);
  run('ditto', [built, dest]);
  assertBuildId(dest, expected, 'installed app');
  log(`installed ${dest} (commit ${read('git', ['rev-parse', '--short', 'HEAD'])}, frontend ${expected})`);

  indexForSpotlight(dest, built);
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
