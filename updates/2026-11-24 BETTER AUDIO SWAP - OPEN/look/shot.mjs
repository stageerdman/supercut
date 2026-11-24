// Screenshots the Replace audio popup from the real src/index.html, app.css and src/ui/audio-popup.js in WebKit
// (main.js swapped for a stub: no Tauri here). node shot.mjs → popup-idle.png, popup-over.png.
// Uses the Playwright installed for the smooth-playback measure (npm ci there first).
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
import { createAudioPopup } from './ui/audio-popup.js';
const $ = (id) => document.getElementById(id);
$('editor').classList.remove('hidden'); $('editor').classList.add('flex');
$('title').textContent = 'my-video';
const b = $('audio-button'); b.classList.remove('hidden'); b.classList.add('flex');
b.innerHTML = '<span>Replace audio</span>';
window.popup = createAudioPopup({ popup: $('audio-popup'), area: $('audio-popup-area'), headline: $('audio-popup-headline'),
  sub: $('audio-popup-sub'), anchor: b }, { onChoose: () => {} });
b.onclick = () => window.popup.toggle();
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
const page = await browser.newPage({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready);
await page.click('#audio-button');
await page.screenshot({ path: join(here, 'popup-idle.png') });
await page.evaluate(() => window.popup.drag('audio'));
await page.waitForTimeout(200);
await page.screenshot({ path: join(here, 'popup-over.png') });
await page.mouse.click(100, 300); // a click away
console.log('open after click away:', await page.evaluate(() => window.popup.isOpen()));
await page.click('#audio-button');
await page.keyboard.press('Escape');
console.log('open after Esc:', await page.evaluate(() => window.popup.isOpen()));
await browser.close();
server.close();
