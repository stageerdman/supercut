// Spike: how fast can the bundled ffmpeg render a preview of an edit (kept parts back to back)?
// Makes a long 1080p30 source once (media/long.mp4), then renders: each kept span its own clip (VideoToolbox, 540p,
// exact frame count), joined by the concat demuxer without re-encoding, and the sound cut in one pass.
// Run: node "updates/2026-11-24 SMOOTH PLAYBACK - OPEN/spike/render.mjs"   (MIN=10 for a 10-minute source)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ff = join(here, '../../../node_modules/ffmpeg-static/ffmpeg');
const media = join(here, 'media');
mkdirSync(media, { recursive: true });
const min = Number(process.env.MIN || 5);
const src = join(media, `long-${min}.mp4`);
const run = (args) => execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const time = (label, f) => { const a = Date.now(); const r = f(); console.log(label, ((Date.now() - a) / 1000).toFixed(1), 's'); return r; };

if (!existsSync(src)) time('make source', () => run(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440',
  '-t', String(min * 60), '-c:v', 'h264_videotoolbox', '-b:v', '8M', '-g', '120', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]));

// A cut every ~4 s: keep 3 s, cut 1 s (some kept spans short: 0.5 s).
const spans = [];
for (let t = 0; t + 4 <= min * 60; t += 4) spans.push({ s: t, e: t + (spans.length % 5 === 4 ? 0.5 : 3) });
const FPS = 30;
const frames = (sp) => Math.max(1, Math.round((sp.e - sp.s) * FPS));

const segs = spans.map((sp, k) => join(media, `seg-${k}.mp4`));
const clipArgs = (sp, k) => [...(process.env.HW === '0' ? [] : ['-hwaccel', 'videotoolbox']), '-ss', String(sp.s), '-i', src, '-an',
  '-vf', `fps=${FPS},scale=-2:540,tpad=stop_mode=clone:stop_duration=0.2`,
  '-frames:v', String(frames(sp)), ...(process.env.ENC === 'x264' ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'] : ['-c:v', 'h264_videotoolbox', '-b:v', '2.5M']),
  '-g', '30', segs[k]];
const POOL = Number(process.env.POOL || 6);
const a0 = Date.now();
await new Promise((done) => {
  let next = 0, live = 0;
  const go = () => {
    if (next >= spans.length && !live) return done();
    while (live < POOL && next < spans.length) {
      const k = next++; live++;
      const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...clipArgs(spans[k], k)]);
      p.on('exit', () => { live--; go(); });
    }
  };
  go();
});
console.log(`video: ${spans.length} clips, pool ${POOL}:`, ((Date.now() - a0) / 1000).toFixed(1), 's');

const list = join(media, 'list.txt');
writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
const parts = spans.map((sp, k) => `[0:a]atrim=start=${sp.s}:duration=${frames(sp) / FPS},asetpts=PTS-STARTPTS[a${k}]`);
const graph = `[1:a]asplit=${spans.length}${spans.map((_, k) => `[s${k}]`).join('')};` +
  parts.map((p, k) => p.replace('[0:a]', `[s${k}]`)).join(';') + ';' + spans.map((_, k) => `[a${k}]`).join('') + `concat=n=${spans.length}:v=0:a=1[a]`;
writeFileSync(join(media, 'graph.txt'), graph);
const out = join(media, 'preview.mp4');
time('join + sound', () => run(['-f', 'concat', '-safe', '0', '-i', list, '-i', src, '-filter_complex_script', join(media, 'graph.txt'),
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]));
const want = spans.reduce((s, sp) => s + frames(sp) / FPS, 0);
const info = execFileSync(ff, ['-hide_banner', '-i', out, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
console.log('want', want.toFixed(3), 's', info.slice(-300));
