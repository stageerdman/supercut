// The real end to end, against the live update site: the app installed in /Applications (an older version) finds
// the release on Cloudflare, its pill is told about it, it downloads and installs it, and opens again as the new one.
// Setup: install the older version in /Applications, then npm run release -- <newer>.
// Run: node "updates/2026-11-25 DMG AND AUTO-UPDATES - OPEN/e2e-cloudflare-update.js" <newer>
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

const want = process.argv[2];
const app = '/Applications/Magic Cut.app';
const bin = path.join(app, 'Contents', 'MacOS', 'supercut');
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const plistVersion = () =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();

function running() {
  try {
    return execFileSync('pgrep', ['-f', bin], { encoding: 'utf8' }).trim().split('\n').map(Number);
  } catch {
    return [];
  }
}

/** Runs the app, collecting its updater log lines. */
function launch() {
  const child = spawn(bin, [], { stdio: ['ignore', 'ignore', 'pipe'] });
  const lines = [];
  child.stderr.on('data', (d) => {
    for (const l of String(d).split('\n').filter((x) => x.includes(' updates '))) {
      console.log(`[app ${secs()} s] ${l}`);
      lines.push(l);
    }
  });
  const until = async (text, ms) => {
    for (let t = 0; t < ms; t += 250) {
      if (lines.some((l) => l.includes(text))) return;
      if (lines.some((l) => l.includes('look failed'))) throw new Error('the app could not read the update site');
      await wait(250);
    }
    throw new Error(`no "${text}" within ${ms / 1000} s`);
  };
  return { child, until };
}

async function main() {
  const before = plistVersion();
  console.log(`[e2e] installed app: ${before}; release on the site: ${want}`);
  if (before === want) throw new Error(`the installed app is already ${want}; install the older version first`);

  const { child, until } = launch();
  try {
    await until(`found ${want}`, 60_000);
    await until(`pill shows update ${want}`, 30_000);
    await until(`update ready ${want}`, 180_000);
  } finally {
    child.kill();
  }
  await wait(1500);

  const after = plistVersion();
  console.log(`[e2e] app on disk now: ${after}`);
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  console.log('[e2e] codesign --verify: ok');
  execFileSync('open', [app]); // what the pill's Restart does: launch the bundle again
  await wait(8000);
  const pids = running();
  console.log(`[e2e] reopened: ${pids.length ? `running (pid ${pids.join(', ')})` : 'NOT running'}`);
  if (after !== want || !pids.length) throw new Error(`expected ${want} running, got ${after}${pids.length ? '' : ' (not running)'}`);
  console.log(`[e2e] PASS in ${secs()} s: ${before} found ${want} on the site, installed it and opened as ${after}`);
}

main().catch((err) => {
  console.log(`[e2e] FAIL after ${secs()} s: ${err.message}`);
  process.exit(1);
});
