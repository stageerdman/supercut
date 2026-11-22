// Compares pause detection methods on one recording against ground truth.
// Usage: node compare.js <audio.wav> <transcript.json> <truth.json> <silero_vad.onnx>
// Methods:
//   words     today: gaps between transcript words (src/ui/pauses.js)
//   rms       audio only: 10 ms RMS against an adaptive noise floor
//   peaks     audio only: the same, but on the 100/s max-abs peaks the timeline waveform already has
//   silero    audio only: Silero VAD v5 speech probability
//   words+X   a pause needs both: no word AND no voice in the audio (words and voice runs merged, then gaps)
const fs = require('node:fs');
const path = require('node:path');
const ort = require('onnxruntime-node');
const wav = require('./wav');

const BREATH = 0.1, MIN_PAUSE = 0.2;

// Exactly the app's rule (src/ui/pauses.js), on any list of sound runs.
function pauses(runs, length) {
  const list = [];
  const add = (s, e) => e - s >= MIN_PAUSE - 1e-9 && list.push({ s, e });
  if (runs.length) {
    add(0, runs[0].s - BREATH);
    for (let i = 1; i < runs.length; i++) add(runs[i - 1].e + BREATH, runs[i].s - BREATH);
    add(runs.at(-1).e + BREATH, length);
  }
  return list;
}

// Frames (true = voice, `hop` s each) → runs; holes shorter than `bridge` s stay voice.
function runsOf(frames, hop, bridge = 0.15) {
  const runs = [];
  for (let f = 0; f < frames.length; f++) {
    if (!frames[f]) continue;
    const s = f * hop;
    while (f < frames.length && frames[f]) f++;
    const e = f * hop, last = runs.at(-1);
    if (last && s - last.e < bridge) last.e = e; else runs.push({ s, e });
  }
  return runs;
}

function merge(a, b) {
  const all = [...a, ...b].map((r) => ({ s: r.s, e: r.e })).sort((x, y) => x.s - y.s);
  const out = [];
  for (const r of all) { const l = out.at(-1); if (l && r.s <= l.e) l.e = Math.max(l.e, r.e); else out.push(r); }
  return out;
}

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];

// Adaptive threshold: speech is 12 dB over the quiet-ish floor (10th percentile), never below -60 dBFS.
function energyFrames(levelsDb) {
  const floor = pct(levelsDb, 0.1);
  const thr = Math.max(floor + 12, -60);
  return { frames: levelsDb.map((l) => l > thr), floor, thr };
}

// Hysteresis on a 30 ms smoothed level: voice starts `on` dB over the floor (5th percentile) and lasts
// until the level drops under `off` dB over it. Quiet speech that has started keeps counting.
function hysteresisFrames(levelsDb, on = 9, off = 4) {
  const sm = levelsDb.map((_, i) => { const w = levelsDb.slice(Math.max(0, i - 1), i + 2); return db(Math.sqrt(w.reduce((t, l) => t + 10 ** (l / 10), 0) / w.length)); });
  const floor = Math.max(pct(sm, 0.05), -75);
  let v = false;
  return { frames: sm.map((l) => (v = v ? l > floor + off : l > floor + on)), floor, thr: floor + on };
}

function rms(x, rate) {
  const F = rate / 100, out = [];
  for (let i = 0; i + F <= x.length; i += F) { let s = 0; for (let j = i; j < i + F; j++) s += x[j] * x[j]; out.push(db(Math.sqrt(s / F))); }
  return out;
}

function peaks(x, rate) { // what src-tauri/src/waveform.rs sends the UI (0..255), turned back into dB
  const F = rate / 100, out = [];
  for (let i = 0; i + F <= x.length; i += F) { let m = 0; for (let j = i; j < i + F; j++) m = Math.max(m, Math.abs(x[j])); out.push(db(Math.max(Math.round(Math.min(m, 1) * 255), 0.5) / 255)); }
  return out;
}

async function silero(x, rate, model) {
  const s = await ort.InferenceSession.create(model);
  const W = 512, C = 64; // v5 at 16 kHz: 32 ms windows, each with the previous 64 samples as context
  let state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
  const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(rate)]), []);
  const probs = [];
  const t0 = Date.now();
  for (let i = 0; i + W <= x.length; i += W) {
    const buf = new Float32Array(C + W);
    buf.set(x.subarray(Math.max(0, i - C), i), C - Math.min(C, i));
    buf.set(x.subarray(i, i + W), C);
    const r = await s.run({ input: new ort.Tensor('float32', buf, [1, C + W]), state, sr });
    state = r.stateN;
    probs.push(r.output.data[0]);
  }
  // Hysteresis as in Silero's own get_speech_timestamps: on at 0.5, off below 0.35.
  let on = false;
  const frames = probs.map((p) => (on = on ? p >= 0.35 : p >= 0.5));
  return { frames, hop: W / rate, ms: Date.now() - t0, probs };
}

const overlap = (a, b) => Math.max(0, Math.min(a.e, b.e) - Math.max(a.s, b.s));
const total = (xs) => xs.reduce((t, r) => t + (r.e - r.s), 0);
const f2 = (t) => t.toFixed(2);

function score(name, detected, truth) {
  const truthPauses = pauses(truth.speech, truth.seconds);
  const overSpeech = detected.map((p) => ({ p, t: truth.speech.reduce((t, sp) => t + overlap(p, sp), 0) })).filter((x) => x.t > 0.05);
  const found = truthPauses.reduce((t, tp) => t + detected.reduce((u, p) => u + overlap(p, tp), 0), 0);
  return {
    method: name,
    pauses: detected.length,
    'false pauses (over speech)': overSpeech.length,
    'speech under pauses s': f2(overSpeech.reduce((t, x) => t + x.t, 0)),
    'true pause time found': `${Math.round((100 * found) / total(truthPauses))}%`,
    _false: overSpeech.map((x) => `${f2(x.p.s)}–${f2(x.p.e)}`).join(' '),
  };
}

async function main() {
  const [audio, transcript, truthFile, model] = process.argv.slice(2);
  const { rate, samples } = wav.read(audio);
  const words = JSON.parse(fs.readFileSync(transcript, 'utf8')).words;
  const truth = JSON.parse(fs.readFileSync(truthFile, 'utf8'));
  const len = truth.seconds;

  const levels = rms(samples, rate);
  const r = energyFrames(levels);
  const p = energyFrames(peaks(samples, rate));
  const h = hysteresisFrames(levels, Number(process.env.ON || 9), Number(process.env.OFF || 4));
  const v = await silero(samples, rate, model);
  let on = false;
  const lowSilero = v.probs.map((q) => (on = on ? q >= 0.15 : q >= 0.3));
  const voice = {
    rms: runsOf(r.frames, 0.01), peaks: runsOf(p.frames, 0.01), 'rms-hyst': runsOf(h.frames, 0.01, 0.2),
    silero: runsOf(v.frames, v.hop), 'silero-low': runsOf(lowSilero, v.hop),
  };
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(voice['rms-hyst']));

  console.log(`\n=== ${path.basename(audio)}: ${f2(len)} s, ${words.length} words; rms floor ${r.floor.toFixed(0)} dB thr ${r.thr.toFixed(0)}; peaks floor ${p.floor.toFixed(0)} thr ${p.thr.toFixed(0)}; silero ${v.ms} ms`);
  console.log('heard:', words.map((w) => w.w).join(' '));
  const rows = [score('words (today)', pauses(words, len), truth)];
  for (const [k, runs] of Object.entries(voice)) rows.push(score(k, pauses(runs, len), truth));
  for (const [k, runs] of Object.entries(voice)) rows.push(score(`words+${k}`, pauses(merge(words, runs), len), truth));
  rows.push(score('truth', pauses(truth.speech, len), truth));
  console.table(rows.map(({ _false, ...x }) => x));
  for (const x of rows) if (x._false) console.log(`  ${x.method} false pauses at: ${x._false}`);

  // Sounds with no word: what the "fix missed words" step would point the user at.
  for (const k of ['silero', 'rms']) {
    const unheard = voice[k].filter((run) => run.e - run.s >= 0.15 && !words.some((w) => overlap(w, run) > 0));
    console.log(`  voice with no word (${k}): ${unheard.map((u) => `${f2(u.s)}–${f2(u.e)}`).join(' ') || 'none'}`);
  }
  const missed = truth.speech.filter((sp) => !words.some((w) => overlap(w, sp) > 0));
  console.log(`  truth speech with no word:   ${missed.map((u) => `${f2(u.s)}–${f2(u.e)}`).join(' ') || 'none'}`);
}

module.exports = { pauses, runsOf, merge, rms, hysteresisFrames, silero, overlap, total, f2, db, pct };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
