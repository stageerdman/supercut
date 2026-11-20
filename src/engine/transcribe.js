// transcribe(file) -> { text, words: [{text, start, end}] }
// ffmpeg extracts 16 kHz audio, the Parakeet sidecar decodes it, words are merged here.
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractAudio } = require('./ffmpeg');
const { mergeTokens } = require('../core/words');

const SIDECAR = path.join(__dirname, 'parakeet-sidecar.js').replace('app.asar', 'app.asar.unpacked');

function runSidecar(modelDir, wav) {
  return new Promise((resolve, reject) => {
    const child = fork(SIDECAR, [modelDir, wav], { silent: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`Parakeet sidecar exited ${code}: ${err.trim()}`));
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch (e) { reject(e); }
    });
  });
}

async function transcribe(file, { modelDir }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supercut-'));
  const wav = path.join(tmp, 'audio.wav');
  try {
    await extractAudio(file, wav);
    const r = await runSidecar(modelDir, wav);
    return { text: r.text.trim(), words: mergeTokens(r) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { transcribe };
