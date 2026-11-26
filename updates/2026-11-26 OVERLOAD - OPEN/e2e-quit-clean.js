// The installed app quits clean: opened (it reopens the last project, which starts preview renders), then quit the
// way ⌘Q does (an Apple Event, so RunEvent::Exit runs), and no ffmpeg from its bundle is left, now or a minute on.
// Run: node "updates/2026-11-26 OVERLOAD - OPEN/e2e-quit-clean.js" [expected version]
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const want = process.argv[2];
const app = '/Applications/Magic Cut.app';
const bin = path.join(app, 'Contents', 'MacOS', 'supercut');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[quit-clean] ${msg}`);

const version = () =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();

/** Processes started from the app bundle, split into the app itself and its ffmpegs. */
function ours() {
  const rows = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n');
  const mine = rows.filter((r) => r.includes(`${app}/`));
  return { app: mine.filter((r) => r.includes(bin)), ffmpeg: mine.filter((r) => /\/ffmpeg/.test(r)) };
}

async function main() {
  const v = version();
  log(`installed: ${v}`);
  if (want && v !== want) throw new Error(`expected ${want} installed, found ${v}`);
  execFileSync('open', [app]); // a running app is only brought forward
  await wait(20_000);
  const during = ours();
  log(`running: ${during.app.length} app, ${during.ffmpeg.length} ffmpeg`);
  if (!during.app.length) throw new Error('the app did not start');

  execFileSync('osascript', ['-e', 'quit app "Magic Cut"']);
  await wait(3000);
  for (let s = 0; s <= 60; s += 10) {
    const left = ours();
    log(`${s} s after quit: ${left.app.length} app, ${left.ffmpeg.length} ffmpeg`);
    if (left.app.length || left.ffmpeg.length) throw new Error(`left running:\n${[...left.app, ...left.ffmpeg].join('\n')}`);
    if (s < 60) await wait(10_000);
  }
  log(`PASS: ${v} quit with no ffmpeg left, none came back in 60 s`);
}

main().catch((err) => {
  log(`FAIL: ${err.message}`);
  process.exit(1);
});
