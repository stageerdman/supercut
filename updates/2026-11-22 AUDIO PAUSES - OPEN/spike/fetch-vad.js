// Downloads Silero VAD v5 (MIT, ~2 MB ONNX) into its own folder. Usage: node fetch-vad.js <dir>
const fs = require('node:fs');
const path = require('node:path');

const URL = 'https://github.com/snakers4/silero-vad/raw/v5.1.2/src/silero_vad/data/silero_vad.onnx';
const dir = path.resolve(process.argv[2]);
fs.mkdirSync(dir, { recursive: true });
fetch(URL).then(async (r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(path.join(dir, 'silero_vad.onnx'), b);
  console.log('got silero_vad.onnx', b.length, 'bytes');
});
