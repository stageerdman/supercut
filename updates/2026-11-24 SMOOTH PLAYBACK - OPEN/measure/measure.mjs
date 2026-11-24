// Measure: does playing over cuts ever freeze, and does the playhead ever step back? Real WebKit (Playwright), the
// real src/ui/player.js, and the preview rendered by the app's own Rust renderer (an ignored cargo test).
// node measure.mjs   env: RUNS (default 20), SRC (a video of yours; default: a made 1080p30 clip, 4 s keyframes),
//   OFFSET (s added to every cut, to place them in your video), FROM (s where play starts, default 2), PORT,
//   TWIN=1 (the old way: no preview), HEADED=1 (watch).
// A run passes when: no seen frame stands over one frame longer than normal (from the first preview frame on),
// the preview is what is seen all along, and the playhead's edited time never goes down.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = join(here, '../../..');
const media = join(here, 'media');
const ff = join(repo, 'node_modules/ffmpeg-static/ffmpeg');
const RUNS = Number(process.env.RUNS || 20);
const OFFSET = Number(process.env.OFFSET || 0);
const FROM = OFFSET + Number(process.env.FROM ?? 2);
// Short kept parts on purpose: 7.5-8.2 leaves 1.5 s, 16-16.5 leaves 0.9 s, 17.3-18 leaves 0.8 s.
const CUTS = [[4, 6], [7.5, 8.2], [9.5, 13], [14.2, 15.1], [16, 16.5], [17.3, 18]].map(([s, e]) => ({ part: 1, s: s + OFFSET, e: e + OFFSET, by: 'you' }));
const END = OFFSET + 19.5; // play until about here

function madeSource() {
  const file = join(media, 'source.mp4');
  if (existsSync(file)) return file;
  mkdirSync(media, { recursive: true });
  execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '20', '-c:v', 'libx264', '-g', '120', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
  return file;
}

/** { duration, width, height } as ffmpeg reads them. */
function probe(file) {
  const text = spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
  const [, width, height] = /Video: .*?(\d{3,5})x(\d{3,5})/.exec(text);
  return { duration: h * 3600 + m * 60 + Number(s), width: Number(width), height: Number(height) };
}

const kept = (duration) => {
  const spans = [];
  let at = 0;
  for (const c of CUTS) { if (c.s > at) spans.push([at, c.s]); at = c.e; }
  if (at < duration) spans.push([at, duration]);
  return spans;
};

/** The app's own preview of the kept spans: { file, map }. */
function rendered(src, { duration, width, height }) {
  const out = join(media, 'cache');
  const env = { ...process.env, MEASURE_SRC: src, MEASURE_OUT: out, MEASURE_SIZE: `${width}x${height}`,
    MEASURE_SPANS: kept(duration).map(([s, e]) => `${s.toFixed(3)}-${e.toFixed(3)}`).join(',') };
  const a = Date.now();
  const r = spawnSync('cargo', ['test', '--manifest-path', join(repo, 'src-tauri/Cargo.toml'), 'render_for_measure', '--', '--ignored'], { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`preview render failed:\n${r.stdout}\n${r.stderr}`);
  console.log(`preview rendered (or cached) in ${((Date.now() - a) / 1000).toFixed(1)} s`);
  return JSON.parse(readFileSync(join(out, 'preview.json'), 'utf8'));
}

const types = { '.js': 'text/javascript', '.html': 'text/html', '.mp4': 'video/mp4' };
const serve = (src, previewFile) => (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path === '/source' ? src : path === '/preview' ? previewFile : path.startsWith('/src/') ? join(repo, path) : join(here, basename(path));
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const size = statSync(file).size;
  const head = { 'Content-Type': types[extname(file)] ?? 'video/mp4', 'Accept-Ranges': 'bytes' };
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  if (!m) { res.writeHead(200, { ...head, 'Content-Length': size }); createReadStream(file).pipe(res); return; }
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : size - 1;
  res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
  createReadStream(file, { start: a, end: b }).pipe(res);
};

// Edited time: the source clock with the cuts taken out.
const edited = (t) => t - CUTS.reduce((s, c) => s + Math.max(0, Math.min(c.e, t) - c.s), 0);

function report({ frames, samples, pv }) {
  const twin = !!process.env.TWIN;
  // From the first frame that moves on: before it is the start (WebKit takes ~0.3 s to get going), not a cut.
  const ours = (f) => f.seen && (twin || f.k === pv);
  const firstShown = frames.find(ours);
  const start = frames.findIndex((f) => ours(f) && f.media > firstShown.media + 1e-3);
  const startMs = frames[start].now - firstShown.now;
  const early = !twin && frames.some((f) => f.seen && f.k === pv && f.media < edited(FROM) - 0.05); // a frame from before where you pressed play
  const shown = frames.slice(start).filter((f) => f.seen).map((f) => ({ ...f, edit: f.k === pv ? f.media : edited(f.media) }));
  const holds = shown.slice(1).map((f, i) => ({ edit: shown[i].edit, gap: f.now - shown[i].now }));
  const frame = holds.map((h) => h.gap).sort((a, b) => a - b)[Math.floor(holds.length / 2)];
  const over = (h) => h.gap - frame > 1.2 * frame; // over one frame longer than normal
  const atCut = CUTS.map((c) => {
    const E = edited(c.s);
    const near = holds.filter((h) => h.edit >= E - 0.1 && h.edit <= E + 0.5);
    return { c, w: near.reduce((w, h) => (h.gap > w.gap ? h : w), { gap: 0 }), crossed: shown.some((f) => f.edit > E + 0.05) };
  });
  const long = holds.filter(over);
  const fallback = !twin && frames.slice(start).some((f) => f.seen && f.k !== pv);
  const back = samples.filter((s, i) => i && s.edit < samples[i - 1].edit - 1e-6).map((s, i) => s.edit);
  const live = samples.filter((s) => s.now >= (shown[0]?.now ?? 0));
  const behind = live.length > 1 ? (live.at(-1).now - live[0].now) / 1000 - (live.at(-1).edit - live[0].edit) : NaN;
  const pass = !long.length && !fallback && !early && !back.length && atCut.every((x) => x.crossed);
  const line = atCut.map(({ c, w, crossed }) => `${c.s}-${c.e} ${!crossed ? 'NOT CROSSED' : over(w) ? 'HOLD' : 'ok'} +${Math.max(0, w.gap - frame).toFixed(0)}ms`);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${line.join(' | ')}  (frame ${frame.toFixed(1)} ms, start ${startMs.toFixed(0)} ms, playhead behind ${(behind * 1000).toFixed(0)} ms)`);
  if (long.length) console.log(`      holds: ${long.map((h) => `${h.edit.toFixed(2)}s ${h.gap.toFixed(0)}ms`).join(', ')}`);
  if (fallback) console.log('      the source was seen while playing');
  if (early) console.log('      the preview was seen before it reached where play started');
  if (back.length) console.log(`      playhead stepped back ${back.length}×`);
  return pass;
}

const src = process.env.SRC || madeSource();
const info = probe(src);
const p = rendered(src, info);
const port = Number(process.env.PORT || 3277);
const server = createServer(serve(src, p.file));
await new Promise((r) => server.listen(port, r));
const browser = await webkit.launch({ headless: !process.env.HEADED });
let passed = 0;
for (let r = 0; r < RUNS; r++) {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('page:', m.text()));
  const q = new URLSearchParams({ cuts: JSON.stringify(CUTS), map: JSON.stringify(p.map), file: '/preview', duration: String(info.duration), twin: process.env.TWIN ?? '' });
  await page.goto(`http://localhost:${port}/page.html?${q}`);
  await page.waitForFunction(() => window.ready);
  if (report(await page.evaluate(([f, s]) => window.run(f, s), [FROM, edited(END) - edited(FROM)]))) passed++;
  await page.close();
}
await browser.close();
server.close();
console.log(`${passed}/${RUNS} runs: no hold over one frame at any cut or anywhere, the preview seen all along, the playhead never back`);
process.exitCode = passed === RUNS ? 0 : 1;
