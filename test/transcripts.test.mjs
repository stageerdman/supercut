// Transcription on demand: src/ui/transcripts.js, and Magic asking for it (src/ui/magic.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranscripts, transcribing, owes, stale, wordsState, regenerated } from '../src/ui/transcripts.js';
import { createMagic } from '../src/ui/magic.js';
import { mediaOf } from '../src/ui/media.js';

const part = (id, more = {}) => ({ id, name: `${id}.mov`, path: `/v/${id}.mov`, transcript: null, error: null, ...more });
const words = (w) => ({ seconds: 2, words: [{ w, s: 0, e: 0.4 }] });

/** A queue whose runs settle the part like main.js's transcribe(): next word from `say`, or an error. */
function rig(parts, say = () => 'hi') {
  const ran = [];
  const t = createTranscripts({
    parts: () => parts,
    run: async (id) => {
      ran.push(id);
      const p = parts.find((x) => x.id === id);
      const w = say(id);
      if (w instanceof Error) p.error = String(w);
      else { p.transcript = words(w); p.heard = mediaOf(p); }
    },
  });
  return { t, ran };
}

test('nothing is transcribing until someone asks', () => {
  const parts = [part(1), part(2)];
  rig(parts);
  assert.equal(transcribing(parts), false, 'a loaded part owes nothing');
});

test('a request starts each part once, one at a time, in order', async () => {
  const parts = [part(1), part(2)];
  const { t, ran } = rig(parts);
  const done = t.request();
  t.request([1]); // asked again while queued
  assert.equal(transcribing(parts), true, 'Magic waits while asked words are on the way');
  await done;
  assert.deepEqual(ran, [1, 2]);
  assert.equal(transcribing(parts), false);
  await t.request();
  assert.deepEqual(ran, [1, 2], 'parts with words are not run again');
});

test('a request for some ids leaves the others alone', async () => {
  const parts = [part(1), part(2)];
  const { t, ran } = rig(parts);
  await t.request([2]);
  assert.deepEqual(ran, [2]);
  assert.equal(parts[0].wanted, undefined);
});

test('a part removed while queued is skipped', async () => {
  const parts = [part(1), part(2)];
  const { t, ran } = rig(parts);
  const done = t.request();
  parts.splice(1, 1);
  await done;
  assert.deepEqual(ran, [1]);
});

test('a failed part stops owing (no endless wait), and can be asked again', async () => {
  const parts = [part(1)];
  let fail = true;
  const { t, ran } = rig(parts, () => (fail ? new Error('no model') : 'hi'));
  await t.request();
  assert.equal(transcribing(parts), false);
  fail = false;
  parts[0].error = null; // Try again
  await t.request([1]);
  assert.deepEqual(ran, [1, 1]);
  assert.equal(parts[0].transcript.words[0].w, 'hi');
});

const swapped = { recording: '/m/mic.wav', offset: 1, media: '/cache/swap/1.mov' };

test('a swap makes the old words stale but starts nothing; they stay on screen', async () => {
  const parts = [part(1)];
  const { t } = rig(parts, () => 'old');
  await t.request();
  parts[0].heard = mediaOf(parts[0]);
  parts[0].swap = swapped;
  assert.equal(stale(parts[0]), true);
  assert.equal(wordsState(parts[0]), 'stale');
  assert.equal(parts[0].transcript.words[0].w, 'old', 'still on screen');
  assert.equal(owes(parts[0]), false);
  assert.equal(transcribing(parts), false, 'nothing starts by itself');
  await t.request([1]);
  assert.equal(parts[0].transcript.words[0].w, 'old', 'Generate does not redo words that exist');
});

test('the audio going back (undo, camera audio) makes the words fresh again', () => {
  const p = part(1, { transcript: words('hi'), heard: '/v/1.mov', swap: swapped });
  assert.equal(stale(p), true);
  p.swap = null;
  assert.equal(stale(p), false);
  assert.equal(wordsState(p), 'ready');
});

test('a swap before any words were asked for starts nothing and is not stale', () => {
  const p = part(1, { swap: swapped });
  assert.equal(stale(p), false);
  assert.equal(wordsState(p), 'generate');
  assert.equal(transcribing([p]), false);
});

test('Regenerate runs only parts whose words are from other audio, and shows regenerating', async () => {
  const parts = [part(1, { transcript: words('a'), heard: '/v/1.mov', swap: swapped }), part(2, { transcript: words('b'), heard: '/v/2.mov' })];
  const { t, ran } = rig(parts, () => 'new');
  const done = t.regenerate();
  assert.equal(wordsState(parts[0]), 'regenerating');
  assert.equal(wordsState(parts[1]), 'ready');
  await done;
  assert.deepEqual(ran, [1]);
});

test('regenerated words keep the ones you fixed and drop new words over them', () => {
  const old = [{ w: 'Shure', s: 1, e: 1.5, fixed: true }, { w: 'uh', s: 2, e: 2.2 }];
  const fresh = [{ w: 'Hi', s: 0, e: 0.5 }, { w: 'sure', s: 1.1, e: 1.4 }, { w: 'there', s: 2, e: 2.3 }];
  assert.deepEqual(regenerated(old, fresh).map((w) => w.w), ['Hi', 'Shure', 'there']);
});

test('the panel state: generate, working, failed', () => {
  assert.equal(wordsState(part(1)), 'generate');
  assert.equal(wordsState(part(1, { wanted: true })), 'working');
  assert.equal(wordsState(part(1, { error: 'x' })), 'failed');
});

test('Magic pressed with no words asks for them, queues, and runs once they arrive', async () => {
  const parts = [part(1)];
  const { t } = rig(parts);
  let sent = null;
  let asked;
  const m = createMagic({
    runner: { run: async ({ parts: p }) => { sent = p; return { summary: 'done', cuts: [] }; }, cancel() {} },
    claude: async () => ({ state: 'ready' }),
    project: () => ({ parts, transcribing: transcribing(parts) }),
    paint: () => {},
    flash: () => {},
    banner: (b) => assert.fail(b),
    onResult: () => 0,
    transcribe: () => { asked = t.request(); },
    store: { getItem: () => '1', setItem: () => {} },
  });
  m.update();
  await m.press();
  assert.equal(m.state.kind, 'queued');
  await asked;
  m.update(); // main.js renders after every transcript
  await new Promise((ok) => setTimeout(ok));
  assert.deepEqual(sent.map((p) => p.words[0].w), ['hi']);
});

test('a part plays its swapped media, else its own file', () => {
  assert.equal(mediaOf(part(1)), '/v/1.mov');
  assert.equal(mediaOf(part(1, { swap: { media: '/cache/swap/1.mov' } })), '/cache/swap/1.mov');
});
