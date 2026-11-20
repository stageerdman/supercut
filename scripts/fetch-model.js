// Downloads the Parakeet TDT 0.6B v3 (int8, ONNX) model for sherpa-onnx into models/.
// Plain files from Hugging Face: no archive to unpack.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const REPO = 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/';
const FILES = ['tokens.txt', 'decoder.int8.onnx', 'joiner.int8.onnx', 'encoder.int8.onnx', 'test_wavs/en.wav'];
const DIR = path.join(__dirname, '..', 'models', 'parakeet-tdt-0.6b-v3-int8');

async function main() {
  for (const name of FILES) {
    const dest = path.join(DIR, name);
    if (fs.existsSync(dest)) { console.log('have', name); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const res = await fetch(REPO + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
    fs.renameSync(dest + '.part', dest);
    console.log('got', name, fs.statSync(dest).size, 'bytes');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
