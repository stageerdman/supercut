// Downloads Parakeet TDT 0.6B v3 (int8 ONNX, ~670 MB) to the same folder the app uses,
// so dev, tests and the packaged app share one copy. The app will do this itself on first run.
// Plain files from Hugging Face: no archive to unpack. Resumable: finished files are skipped.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const REPO = 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/';
const FILES = ['vocab.txt', 'decoder_joint-model.int8.onnx', 'encoder-model.int8.onnx'];
const DIR = process.env.SUPERCUT_MODEL_DIR ||
  path.join(os.homedir(), 'Library/Application Support/xyz.supercut.editor/models/parakeet-tdt-0.6b-v3-int8');
// A short real speech clip for the live tests (16 kHz mono WAV).
const SAMPLE = ['https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/test_wavs/en.wav', path.join(__dirname, '..', 'models', 'en.wav')];

async function get(url, dest) {
  if (fs.existsSync(dest)) return console.log('have', dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
  fs.renameSync(dest + '.part', dest);
  console.log('got', dest, fs.statSync(dest).size, 'bytes');
}

async function main() {
  for (const name of FILES) await get(REPO + name, path.join(DIR, name));
  await get(...SAMPLE);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
