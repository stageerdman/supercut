// Smoke test of the BUILT app: runs the packaged Electron binary (as Node) on the
// packaged ffmpeg + Parakeet sidecar, so we know the bundle itself works.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const app = path.join(__dirname, '..', 'dist', 'mac-arm64', 'SuperCut.app');
const bin = path.join(app, 'Contents', 'MacOS', 'SuperCut');
const unpacked = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked');
const modelDir = path.join(__dirname, '..', 'models', 'parakeet-tdt-0.6b-v3-int8');
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };

const ffmpeg = path.join(unpacked, 'node_modules', 'ffmpeg-static', 'ffmpeg');
console.log(execFileSync(ffmpeg, ['-version']).toString().split('\n')[0]);

const out = execFileSync(bin, [path.join(unpacked, 'src', 'engine', 'parakeet-sidecar.js'), modelDir, path.join(modelDir, 'test_wavs', 'en.wav')], { env });
const r = JSON.parse(out.toString());
console.log('packaged Parakeet:', r.text.trim(), `(${r.tokens.length} tokens)`);
if (!r.text.includes('country')) process.exit(1);
console.log('SMOKE OK');
