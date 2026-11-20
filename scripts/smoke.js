// Proves the built .app works on its own: it talks to this Mac's Claude Code, and its
// bundled ffmpeg + ONNX Runtime + Parakeet transcribe real speech.
// Run after `npm run build` and `npm run fetch-model`; needs Claude Code installed and signed in.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Cargo's shared target dir (~/.cargo/config.toml); CARGO_TARGET_DIR if set.
const target = process.env.CARGO_TARGET_DIR || path.join(os.homedir(), '.cargo-shared-target');
const app = path.join(target, 'release/bundle/macos/SuperCut.app');
const bin = path.join(app, 'Contents/MacOS/supercut');
const wav = path.join(__dirname, '..', 'models', 'en.wav');

console.log('app:', app);
console.log('contents:', fs.readdirSync(path.join(app, 'Contents/MacOS')).join(', '));
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log('codesign --verify: ok');

// The packaged app asks this Mac's Claude Code about a sample transcript (on the subscription).
const c0 = Date.now();
const picks = JSON.parse(execFileSync(bin, ['--claude-test'], { encoding: 'utf8' }));
console.log(`claude answered in ${((Date.now() - c0) / 1000).toFixed(1)} s:`, JSON.stringify(picks));
if (!picks.keep.includes(2) || !picks.keep.includes(3)) throw new Error('claude dropped the good take');

// A real 720p H.264 + AAC .mov, like a camera take: the speech clip looped to ~2.5 min
// (two chunks, one seam), made with the app's own bundled ffmpeg.
const mov = path.join(os.tmpdir(), 'supercut-smoke-take.mov');
execFileSync(path.join(app, 'Contents/MacOS/ffmpeg'), [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-stream_loop', '39', '-i', wav,
  '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mov,
]);

const t0 = Date.now();
const t = JSON.parse(execFileSync(bin, ['--transcribe', mov], { encoding: 'utf8', maxBuffer: 1 << 26 }));
console.log(`transcribed ${path.basename(mov)}: ${t.seconds.toFixed(1)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${t.words.length} words`);
console.log('timed transcript (first 20 words):');
for (const w of t.words.slice(0, 20)) console.log(`  ${w.s.toFixed(2).padStart(6)}–${w.e.toFixed(2).padEnd(6)} ${w.w}`);
console.log('around the 105–120 s seam:', t.words.filter((w) => w.s > 110 && w.s < 115).map((w) => `${w.w}@${w.s}`).join(' '));
if (t.words.length < 5) throw new Error('too few words');
for (let i = 1; i < t.words.length; i++) if (t.words[i].s < t.words[i - 1].s) throw new Error(`time goes backwards at word ${i}`);

// Magic end to end on a recording with three bad takes (`npm run sample-retakes`).
const retakes = path.join(__dirname, '..', 'models', 'retakes.wav');
if (fs.existsSync(retakes)) {
  const m0 = Date.now();
  const cuts = JSON.parse(execFileSync(bin, ['--auto-cut', retakes], { encoding: 'utf8' }));
  console.log(`magic: ${cuts.length} cuts in ${((Date.now() - m0) / 1000).toFixed(1)} s`);
  for (const c of cuts) console.log(`  ${c.s.toFixed(2).padStart(6)}–${c.e.toFixed(2).padEnd(6)} ${c.reason}`);
  if (cuts.length !== 3) throw new Error('expected the three bad takes cut');
} else console.log('magic: skipped (run npm run sample-retakes)');
console.log('smoke: ok');
