// Spike helper: serves the repo (for /src) and this folder's pages and media (with byte ranges, which <video> needs),
// makes media/a.mp4 with ffmpeg-static on first use, and opens a page in Playwright WebKit.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = join(here, '../../..');
const media = join(here, 'media');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.mp4': 'video/mp4' };

// Frames between keyframes (GOP=30 for a phone-like 1 s; default 120, a camera-like 4 s). /media/a.mp4 serves it.
const gop = Number(process.env.GOP || 120);
const clip = join(media, gop === 120 ? 'a.mp4' : `a-g${gop}.mp4`);

function makeMedia() {
  if (existsSync(clip)) return;
  mkdirSync(media, { recursive: true });
  // 30 fps with a tone.
  execFileSync(join(repo, 'node_modules/ffmpeg-static/ffmpeg'), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '20', '-c:v', 'libx264', '-g', String(gop), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    clip]);
}

function handle(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  const file = path === '/media/a.mp4' ? clip : path.startsWith('/src/') ? join(repo, path) : join(here, path);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const size = statSync(file).size;
  const head = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  if (!m) { res.writeHead(200, { ...head, 'Content-Length': size }); createReadStream(file).pipe(res); return; }
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : size - 1;
  res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
  createReadStream(file, { start: a, end: b }).pipe(res);
}

/** Open `page` (path + query) in WebKit; returns { page, close }. */
export async function open(path) {
  makeMedia();
  const port = Number(process.env.PORT || 3277);
  const server = createServer(handle);
  await new Promise((r) => server.listen(port, r));
  const browser = await webkit.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('page:', m.text()));
  await page.goto(`http://localhost:${port}${path}`);
  await page.waitForFunction(() => window.ready);
  return { page, close: async () => { await browser.close(); server.close(); } };
}
