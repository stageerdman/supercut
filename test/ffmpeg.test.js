const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, extractAudio } = require('../src/engine/ffmpeg');

test('ffmpeg makes a video, then extracts 16 kHz mono WAV from it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supercut-test-'));
  const video = path.join(dir, 'clip.mp4');
  const wav = path.join(dir, 'clip.wav');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
  await extractAudio(video, wav);
  const buf = fs.readFileSync(wav);
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(buf.readUInt16LE(22), 1, 'mono');
  assert.strictEqual(buf.readUInt32LE(24), 16000, '16 kHz');
  fs.rmSync(dir, { recursive: true, force: true });
});
