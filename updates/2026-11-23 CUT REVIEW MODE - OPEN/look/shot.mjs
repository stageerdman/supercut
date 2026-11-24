// Screenshots page.html (the real bar and cut views, the app's CSS) in WebKit: node shot.mjs → look.png.
// Uses the Playwright installed for the smooth-playback measure (../../2026-11-24 SMOOTH PLAYBACK - OPEN/measure).
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = join(here, '../../..');
const require = createRequire(join(repo, 'updates/2026-11-24 SMOOTH PLAYBACK - OPEN/measure/package.json'));
const { webkit } = require('playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/' ? join(here, 'page.html') : join(repo, url);
  if (!file.startsWith(repo) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
const port = Number(process.env.PORT || 3277);
await new Promise((r) => server.listen(port, r));
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 560 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready);
await page.screenshot({ path: join(here, 'look.png'), fullPage: true });
await browser.close();
server.close();
console.log('look.png');
