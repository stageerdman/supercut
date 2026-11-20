// A real spoken recording with re-takes for Magic's live tests: macOS `say` reads a short
// tutorial with one false start, one re-recorded line and one fumble, each followed by the good take.
// Writes models/retakes.wav (16 kHz mono). The live tests in src-tauri/src/autocut skip without it.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'models', 'retakes.wav');
const pause = (ms) => ` [[slnc ${ms}]] `;

// Lines 2, 5 and 8 are the bad takes; 3, 6 and 9 their last takes (asserted in the live test).
const SCRIPT = [
  'Hi everyone, welcome back to the channel.',
  'Today I want to show you how to, um,',
  'Today I want to show you how to edit a video in five minutes.',
  'First, open the app and drop your recording into the window.',
  'The transcript shows up on the right after a minute or so.',
  'The transcript shows up on the right, usually after about a minute.',
  'Then you press the magic button.',
  'And it keeps the, uh, the',
  'And it keeps the last take, because that is usually the best one.',
  "That's it. Thanks for watching.",
].join(pause(1500));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync('say', ['-o', OUT, '--data-format=LEI16@16000', SCRIPT]);
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
