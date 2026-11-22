// Root-cause test: does Parakeet miss fewer words when it gets short pieces split at silences
// (Silero speech, pieces up to MAX s) instead of the app's fixed 120 s chunks?
// Writes <audio>.seg<MAX>.words.json in the app's transcript shape.
// Usage: SUPERCUT_BIN=… SUPERCUT_MODEL_DIR=… node segment.js <audio.wav> <silero_vad.onnx> [max seconds = 30]
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const wav = require('./wav');
const { runsOf, silero, f2 } = require('./compare');

async function main() {
  const [audio, model, maxArg] = process.argv.slice(2);
  const MAX = Number(maxArg || 30), PAD = 0.25;
  const { rate, samples } = wav.read(audio);
  const v = await silero(samples, rate, model);
  const runs = runsOf(v.frames, v.hop, 0.3);
  const pieces = [];
  for (const r of runs) {
    const last = pieces.at(-1);
    if (last && r.e - last.s <= MAX) last.e = r.e; else pieces.push({ s: r.s, e: r.e });
  }
  const dir = path.join(path.dirname(audio), path.basename(audio, '.wav') + `-seg${MAX}`);
  fs.mkdirSync(dir, { recursive: true });
  const words = [];
  const t0 = Date.now();
  for (const p of pieces) {
    const a = Math.max(0, Math.floor((p.s - PAD) * rate)), b = Math.min(samples.length, Math.ceil((p.e + PAD) * rate));
    const clip = path.join(dir, `${f2(p.s)}.wav`);
    wav.write(clip, samples.subarray(a, b), rate);
    const t = JSON.parse(execFileSync(process.env.SUPERCUT_BIN, ['--transcribe', clip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    for (const w of t.words) words.push({ w: w.w, s: +(w.s + a / rate).toFixed(3), e: +(w.e + a / rate).toFixed(3) });
  }
  const out = audio.replace(/\.wav$/, `.seg${MAX}.words.json`);
  fs.writeFileSync(out, JSON.stringify({ text: words.map((w) => w.w).join(' '), words, seconds: samples.length / rate }));
  console.log(`${pieces.length} pieces (≤ ${MAX} s) from ${runs.length} speech runs, ${words.length} words, ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
