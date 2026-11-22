// Transcribes each test recording with the app's own pipeline (`supercut --transcribe`: bundled ffmpeg +
// Parakeet), caches the words next to it, then runs compare.js on it.
// Usage: node run.js <supercut binary> <model dir> <data dir> <silero_vad.onnx> [file.wav ...]
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [bin, modelDir, data, vad, ...files] = process.argv.slice(2).map((a) => path.resolve(a));
const list = files.length ? files : ['clean', 'room', 'noisy'].map((n) => path.join(data, `${n}.wav`));
const ffmpeg = path.join(__dirname, '../../../src-tauri/binaries/ffmpeg-aarch64-apple-darwin');
for (let f of list) {
  if (!f.endsWith('.wav')) { // a real take: 16 kHz mono WAV next to it, like the app decodes
    const w = f.replace(/\.[^.]+$/, '.wav');
    if (!fs.existsSync(w)) execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', f, '-vn', '-ac', '1', '-ar', '16000', w]);
    f = w;
  }
  const words = f.replace(/\.wav$/, '.words.json');
  if (!fs.existsSync(words)) {
    const t0 = Date.now();
    const json = execFileSync(bin, ['--transcribe', f], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, SUPERCUT_MODEL_DIR: modelDir } });
    fs.writeFileSync(words, json);
    console.log(`transcribed ${path.basename(f)} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const truth = path.join(path.dirname(f), 'truth.json');
  const script = fs.existsSync(truth) ? 'compare.js' : 'inspect.js';
  execFileSync('node', [path.join(__dirname, script), f, words, fs.existsSync(truth) ? truth : '-', vad], { stdio: 'inherit' });
}
