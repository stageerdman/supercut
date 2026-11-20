// Puts the ffmpeg binary where Tauri's `bundle.externalBin` expects it
// (src-tauri/binaries/ffmpeg-<target triple>). Tauri ships it inside the .app next to SuperCut.
const fs = require('node:fs');
const path = require('node:path');

const triple = { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' }[process.arch];
const dest = path.join(__dirname, '..', 'src-tauri', 'binaries', `ffmpeg-${triple}`);
const src = require('ffmpeg-static');

if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log('ffmpeg ->', dest);
}
