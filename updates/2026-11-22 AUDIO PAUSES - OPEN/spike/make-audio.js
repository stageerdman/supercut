// Builds test recordings with words a recognizer tends to miss: fillers (um, uh, hmm), a mumbled aside
// and a quiet "yeah". Each line is spoken by macOS `say`, scaled by its gain and joined with known silences.
// Ground truth comes from the clean signal (TTS silence is digital zero), so we know where the person talks.
// Writes to <out>/: clean.wav, room.wav (quiet room noise + hum), noisy.wav (louder fan noise), truth.json.
// Usage: node make-audio.js <out dir>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const wav = require('./wav');

const RATE = 16000;
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: true });

// [text, gain, silence after (s), say rate wpm]
const LINES = [
  ['Hi everyone, welcome back to the channel.', 1, 0.8],
  ['Today, um, I want to show you how to cut a video.', 1, 0.6],
  ['you know, kind of quickly', 0.04, 0.7], // mumbled aside, -28 dB
  ['So first, uh, open the app and drop your recording in.', 1, 1.2],
  ['Hmm.', 0.3, 0.5],
  ['Then press the magic button, and, uh, wait a moment.', 1, 0.9],
  ['yeah', 0.08, 0.4], // quiet
  ['It keeps the best take for you.', 1, 0.15], // a short breath-length gap: not a pause
  ['mm-hm, right', 0.12, 0.7],
  ["That's it. Thanks for watching.", 1, 0.6],
];

function speak(text, i) {
  const f = path.join(out, `line${i}.wav`);
  execFileSync('say', ['-o', f, `--data-format=LEI16@${RATE}`, text]);
  return wav.read(f).samples;
}

// Trim say's own lead/tail silence so our gaps are exact.
function trim(x) {
  let a = 0, b = x.length;
  while (a < b && Math.abs(x[a]) < 1e-4) a++;
  while (b > a && Math.abs(x[b - 1]) < 1e-4) b--;
  return x.subarray(a, b);
}

const parts = [new Float32Array(RATE * 0.7)];
for (const [i, [text, gain, after]] of LINES.entries()) {
  const x = trim(speak(text, i)).map((s) => s * gain);
  parts.push(x, new Float32Array(Math.round(after * RATE)));
}
const n = parts.reduce((a, p) => a + p.length, 0);
const clean = new Float32Array(n);
let at = 0;
for (const p of parts) { clean.set(p, at); at += p.length; }

// Truth: 10 ms frames with any signal; holes under 150 ms (stop consonants) are still speech.
const F = RATE / 100;
const voiced = [];
for (let f = 0; f * F < n; f++) {
  let m = 0;
  for (let i = f * F; i < Math.min(n, (f + 1) * F); i++) m = Math.max(m, Math.abs(clean[i]));
  voiced.push(m > 2e-4);
}
const speech = [];
for (let f = 0; f < voiced.length; f++) {
  if (!voiced[f]) continue;
  const s = f / 100;
  while (f < voiced.length && voiced[f]) f++;
  const e = f / 100;
  const last = speech.at(-1);
  if (last && s - last.e < 0.15) last.e = e; else speech.push({ s, e });
}

// Seeded noise so runs are repeatable.
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
function withNoise(level, humLevel) {
  let b = 0; // brown-ish noise: low rumble like a room or fan
  return clean.map((s, i) => {
    b = 0.98 * b + 0.2 * rnd();
    return s + level * b + humLevel * Math.sin((2 * Math.PI * 50 * i) / RATE);
  });
}

wav.write(path.join(out, 'clean.wav'), clean, RATE);
wav.write(path.join(out, 'room.wav'), withNoise(0.004, 0.002), RATE); // about -50 dBFS
wav.write(path.join(out, 'noisy.wav'), withNoise(0.02, 0.006), RATE); // about -35 dBFS
fs.writeFileSync(path.join(out, 'truth.json'), JSON.stringify({ seconds: n / RATE, lines: LINES.map((l) => l[0]), speech }, null, 1));
for (let i = 0; i < LINES.length; i++) fs.rmSync(path.join(out, `line${i}.wav`));
console.log(`wrote ${out}: ${(n / RATE).toFixed(1)} s, ${speech.length} speech runs`);
