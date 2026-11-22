// Sweeps the energy detector's on/off thresholds over the test files (words must be transcribed already).
// Usage: node sweep.js <data dir> <silero_vad.onnx>
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const [data, vad] = process.argv.slice(2).map((a) => path.resolve(a));
for (const [on, off] of [[6, 3], [9, 3], [9, 4], [12, 6]]) {
  for (const n of ['clean', 'room', 'noisy']) {
    const f = path.join(data, `${n}.wav`);
    const out = execFileSync('node', [path.join(__dirname, 'compare.js'), f, f.replace('.wav', '.words.json'), path.join(data, 'truth.json'), vad], { encoding: 'utf8', env: { ...process.env, ON: on, OFF: off } });
    const row = out.split('\n').find((l) => l.includes("'rms-hyst'"));
    console.log(`on ${on} off ${off} ${n.padEnd(5)} ${row.replace(/│/g, ' ').replace(/\s+/g, ' ')}`);
  }
}
