// A real take has no ground truth, so look at where the methods disagree:
//  - each pause the app shows today (word gaps): how much voice the audio has inside it
//  - voice in the audio with no word on it (what the transcript missed), with its loudness and neighbours,
//    then each such stretch is cut out (with 0.3 s either side) and recognized again on its own
// Usage: node inspect.js <audio.wav> <words.json> - <silero_vad.onnx>   (SUPERCUT_BIN = binary for re-recognition)
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const wav = require('./wav');
const { pauses, runsOf, rms, hysteresisFrames, silero, overlap, total, f2, pct } = require('./compare');

async function main() {
  const [audio, wordsFile, , model] = process.argv.slice(2);
  const { rate, samples } = wav.read(audio);
  const words = JSON.parse(fs.readFileSync(wordsFile, 'utf8')).words;
  const len = samples.length / rate;
  const levels = rms(samples, rate);
  const h = hysteresisFrames(levels, 9, 3);
  const v = await silero(samples, rate, model);
  const voice = { energy: runsOf(h.frames, 0.01, 0.2), silero: runsOf(v.frames, v.hop) };
  const levelIn = (r) => Math.max(...levels.slice(Math.floor(r.s * 100), Math.ceil(r.e * 100)));
  const voiceIn = (p, runs) => runs.reduce((t, r) => t + overlap(p, r), 0);
  const bin0 = () => process.env.SUPERCUT_BIN;
  const clipDir = path.join(path.dirname(audio), path.basename(audio, '.wav') + '-clips');
  fs.mkdirSync(clipDir, { recursive: true });
  const hear = (r) => { // recognize this stretch on its own, 0.3 s either side
    const a = Math.max(0, Math.floor((r.s - 0.3) * rate)), b = Math.min(samples.length, Math.ceil((r.e + 0.3) * rate));
    const clip = path.join(clipDir, `${f2(r.s)}.wav`);
    wav.write(clip, samples.subarray(a, b), rate);
    return JSON.parse(execFileSync(bin0(), ['--transcribe', clip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).text;
  };

  console.log(`\n=== ${path.basename(audio)}: ${f2(len)} s, ${words.length} words`);
  console.log(`level: floor ${h.floor.toFixed(0)} dBFS (5th pct), speech ${pct(levels, 0.95).toFixed(0)} dBFS (95th), voice starts at ${h.thr.toFixed(0)}; silero ${v.ms} ms`);

  const today = pauses(words, len);
  const audioP = { energy: pauses(voice.energy, len), silero: pauses(voice.silero, len) };
  console.log(`pauses shown: today ${today.length} (${f2(total(today))} s) | energy ${audioP.energy.length} (${f2(total(audioP.energy))} s) | silero ${audioP.silero.length} (${f2(total(audioP.silero))} s)`);

  console.log('\ntoday\'s pauses with voice inside (> 0.1 s):');
  let bad = 0;
  for (const p of today) {
    const e = voiceIn(p, voice.energy), s = voiceIn(p, voice.silero);
    if (e < 0.1 && s < 0.1) continue;
    bad++;
    const before = words.filter((w) => w.e <= p.s + 0.2).slice(-3).map((w) => w.w).join(' ');
    const after = words.filter((w) => w.s >= p.e - 0.2).slice(0, 3).map((w) => w.w).join(' ');
    if (!process.env.QUIET) console.log(`  ${f2(p.s)}–${f2(p.e)} (${f2(p.e - p.s)} s): voice energy ${f2(e)} s, silero ${f2(s)} s, loudest ${levelIn(p).toFixed(0)} dBFS   "…${before}" ▮ "${after}…"`);
  }
  console.log(`  → ${bad} of ${today.length} pauses shown today have voice in them`);
  const talk = today.filter((p) => voiceIn(p, voice.silero) >= 0.1);
  console.log(`  → ${talk.length} of ${today.length} have speech in them by Silero (${f2(talk.reduce((t, p) => t + voiceIn(p, voice.silero), 0))} s of speech under "pauses")`);
  const short = talk.filter((p) => p.e - p.s <= 0.6 && voiceIn(p, voice.silero) >= 0.8 * (p.e - p.s));
  console.log(`     of these, ${short.length} are short (≤ 0.6 s) and all speech: word-time errors inside running speech`);
  const big = talk.filter((p) => voiceIn(p, voice.silero) >= 1);
  console.log(`     and ${big.length} hide ≥ 1 s of speech: words the transcript missed (${f2(big.reduce((t, p) => t + voiceIn(p, voice.silero), 0))} s)`);
  const sp = audioP.silero;
  const over = sp.filter((p) => voiceIn(p, voice.silero) > 0.05);
  const loudInside = sp.filter((p) => levelIn(p) > h.floor + 20);
  console.log(`silero pauses: ${sp.length}; ${over.length} touch its own speech (none expected); ${loudInside.length} have loud non-speech sound in them (> floor + 20 dB)`);
  const wordsIn = sp.map((p) => ({ p, w: words.filter((w) => overlap(w, p) > 0.1 * (w.e - w.s) + 0.05) })).filter((x) => x.w.length);
  console.log(`silero pauses that a transcript word sits in: ${wordsIn.length}`);
  for (const { p, w } of wordsIn.slice(0, 15)) console.log(`  ${f2(p.s)}–${f2(p.e)}: ${w.map((x) => `${x.w}@${f2(x.s)}–${f2(x.e)}`).join(' ')}`);

  if (process.env.SILERO_UNHEARD && bin0()) {
    const un = voice.silero.filter((r) => r.e - r.s >= 0.3 && !words.some((w) => overlap(w, r) > 0.02));
    console.log(`\nspeech (silero) with no word on it, ≥ 0.3 s: ${un.length}, ${f2(total(un))} s`);
    for (const r of un) console.log(`  ${f2(r.s)}–${f2(r.e)} (${f2(r.e - r.s)} s) → alone it hears: "${hear(r)}"`);
  }
  if (process.env.SKIP_ENERGY) return;

  const unheard = voice.energy.filter((r) => r.e - r.s >= 0.15 && !words.some((w) => overlap(w, r) > 0.02));
  console.log(`\nvoice with no word on it (energy, ≥ 0.15 s): ${unheard.length}`);
  const bin = process.env.SUPERCUT_BIN;
  const dir = path.join(path.dirname(audio), path.basename(audio, '.wav') + '-unheard');
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, r] of unheard.entries()) {
    const sil = voiceIn(r, voice.silero);
    let again = '';
    if (bin) {
      const a = Math.max(0, Math.floor((r.s - 0.3) * rate)), b = Math.min(samples.length, Math.ceil((r.e + 0.3) * rate));
      const clip = path.join(dir, `${i}-${f2(r.s)}.wav`);
      wav.write(clip, samples.subarray(a, b), rate);
      const t = JSON.parse(execFileSync(bin, ['--transcribe', clip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      again = ` → alone it hears: "${t.text}"`;
    }
    console.log(`  ${f2(r.s)}–${f2(r.e)} (${f2(r.e - r.s)} s), loudest ${levelIn(r).toFixed(0)} dBFS, silero says speech ${f2(sil)} s${again}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
