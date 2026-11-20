// Proves the built .app works on its own: its bundled ffmpeg + ONNX Runtime + Parakeet
// transcribe real speech. Run after `npm run build` and `npm run fetch-model`.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Cargo's shared target dir (~/.cargo/config.toml); CARGO_TARGET_DIR if set.
const target = process.env.CARGO_TARGET_DIR || path.join(os.homedir(), '.cargo-shared-target');
const app = path.join(target, 'release/bundle/macos/SuperCut.app');
const bin = path.join(app, 'Contents/MacOS/supercut');
const wav = path.join(__dirname, '..', 'models', 'en.wav');

console.log('app:', app);
console.log('contents:', fs.readdirSync(path.join(app, 'Contents/MacOS')).join(', '));
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log('codesign --verify: ok');

const t0 = Date.now();
const t = JSON.parse(execFileSync(bin, ['--transcribe', wav], { encoding: 'utf8' }));
console.log(`transcribed ${t.seconds.toFixed(1)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${t.text}`);
console.log('first words:', JSON.stringify(t.words.slice(0, 3)));
if (t.words.length < 5) throw new Error('too few words');
console.log('smoke: ok');
