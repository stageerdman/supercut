// Screenshots the update pill from the real src/index.html, app.css and src/ui/update.js in WebKit, in every state
// (main.js swapped for a stub with a fake updater: no Tauri here). node shot.mjs → pill-*.png.
// Uses the Playwright installed for the smooth-playback measure (npm ci there first), and `npm run css` first.
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

const STUB = `
import { createUpdatePill } from './ui/update.js';
const $ = (id) => document.getElementById(id);
$('editor').classList.remove('hidden'); $('editor').classList.add('flex');
$('title').textContent = 'Interview take 3';
for (const id of ['audio-button', 'magic', 'review']) { $(id).classList.remove('hidden'); $(id).classList.add('flex'); }
$('audio-button').innerHTML = '<span>Replace audio</span>';
$('magic').className = 'flex h-8 items-center rounded-[10px] bg-accent px-3 font-semibold text-on-accent mr-2';
$('magic').textContent = '✦ Magic Cut';
$('review').className = 'flex h-8 items-center rounded-[10px] bg-raised px-3';
let progress, finish;
window.pill = createUpdatePill(
  { button: $('update'), glyph: $('update-glyph'), label: $('update-label'), notes: $('update-notes'), track: $('update-track'), bar: $('update-bar') },
  {
    invoke: async (cmd) => cmd === 'update_check' ? { version: '0.2.0', notes: 'Faster audio swap and a calmer review bar', date: null }
      : cmd === 'update_install' ? new Promise((r) => { finish = r; }) : null,
    listen: (n, f) => { progress = f; },
  });
window.emit = (d, t) => progress({ payload: { downloaded: d, total: t } });
window.done = () => finish(null);
window.ready = true;`;

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/main.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(STUB); }
  const file = join(repo, 'src', url === '/' ? 'index.html' : url);
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
const port = Number(process.env.PORT || 3277);
await new Promise((r) => server.listen(port, r));
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 160 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready);
const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: join(here, `pill-${name}.png`), clip: { x: 0, y: 0, width: 1100, height: 60 } }); };
await shot('none');
await page.evaluate(() => window.pill.check());
await shot('available');
await page.click('#update');
await page.evaluate(() => window.emit(21e6, 50e6));
await shot('downloading');
await page.evaluate(() => window.done());
await shot('ready');
await page.setViewportSize({ width: 800, height: 160 });
await page.screenshot({ path: join(here, 'pill-ready-800.png'), clip: { x: 0, y: 0, width: 800, height: 60 } });
console.log('label:', await page.textContent('#update-label'));
await browser.close();
server.close();
