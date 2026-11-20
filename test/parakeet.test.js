// Live test: real Parakeet TDT v3 in the sidecar on real speech.
// Skips if the model isn't downloaded (run `npm run fetch-model`).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { transcribe } = require('../src/engine/transcribe');

const modelDir = path.join(__dirname, '..', 'models', 'parakeet-tdt-0.6b-v3-int8');
const wav = path.join(modelDir, 'test_wavs', 'en.wav');

test('Parakeet sidecar transcribes speech with word times', { skip: !fs.existsSync(path.join(modelDir, 'encoder.int8.onnx')) && 'model not downloaded', timeout: 120000 }, async () => {
  const t0 = Date.now();
  const { text, words } = await transcribe(wav, { modelDir });
  console.log(`# ${((Date.now() - t0) / 1000).toFixed(1)} s: ${text}`);
  console.log(`# first words: ${JSON.stringify(words.slice(0, 4))}`);
  assert.ok(words.length > 5, 'got words');
  for (let i = 1; i < words.length; i++) {
    assert.ok(words[i].start >= words[i - 1].start, 'times go forward');
    assert.ok(words[i].end >= words[i].start, 'end after start');
  }
});
