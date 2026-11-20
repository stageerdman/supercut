// ffmpeg: the one tool for audio extraction, cutting and export.
const { execFile } = require('node:child_process');

// Inside a packaged app the binary lives in app.asar.unpacked.
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], (err, _out, stderr) =>
      err ? reject(new Error(`ffmpeg failed: ${stderr || err.message}`)) : resolve());
  });
}

// Any audio/video file -> 16 kHz mono 16-bit WAV (what Parakeet wants).
const extractAudio = (input, outWav) => run(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outWav]);

module.exports = { ffmpegPath, run, extractAudio };
