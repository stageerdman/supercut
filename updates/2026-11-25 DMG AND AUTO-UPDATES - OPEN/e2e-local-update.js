// End-to-end updater check without Cloudflare: does an older build find, download, verify and install a newer one?
// Setup (from the repo root):
//   npm run release -- --local http://localhost:3277          then copy dist/bucket/<old>/MagicCut.app.tar.gz to dist/e2e/old.tar.gz
//   npm run release -- <newer> --local http://localhost:3277  (then put the version files back with git checkout)
// Run: PORT=3277 node "updates/2026-11-25 DMG AND AUTO-UPDATES - OPEN/e2e-local-update.js" <newer>
// It unpacks the old app into dist/e2e/app, serves dist/bucket, runs the old app until it logs "update ready",
// then reads the version of the app now on disk.
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const dist = path.join(root, 'dist');
const want = process.argv[2];
const port = Number(process.env.PORT || 3277);
const appDir = path.join(dist, 'e2e', 'app');
const app = path.join(appDir, 'Magic Cut.app');

const plistVersion = () =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
execFileSync('tar', ['-xzf', path.join(dist, 'e2e', 'old.tar.gz'), '-C', appDir]);
const before = plistVersion();
console.log(`[e2e] old app on disk: ${before}`);

const server = http.createServer((req, res) => {
  const file = path.join(dist, 'bucket', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  console.log(`[e2e] GET ${req.url}`);
  if (!file.startsWith(path.join(dist, 'bucket')) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-length': fs.statSync(file).size });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  const child = spawn(path.join(app, 'Contents', 'MacOS', 'supercut'), [], { stdio: ['ignore', 'ignore', 'pipe'] });
  const timer = setTimeout(() => finish('timed out after 120 s'), 120_000);
  child.stderr.on('data', (d) => {
    const lines = String(d).split('\n').filter((l) => l.includes(' updates '));
    lines.forEach((l) => console.log(`[app] ${l}`));
    if (lines.some((l) => l.includes('update ready'))) finish();
  });
  function finish(failure) {
    clearTimeout(timer);
    child.kill();
    server.close();
    const after = plistVersion();
    console.log(`[e2e] app on disk now: ${after}`);
    const ok = !failure && after === want && before !== want;
    console.log(ok ? `[e2e] PASS: ${before} found and installed ${want}` : `[e2e] FAIL: ${failure ?? `expected ${want}`}`);
    process.exit(ok ? 0 : 1);
  }
});
