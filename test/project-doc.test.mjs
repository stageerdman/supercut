// The saved project's ui blob (src/ui/project-doc.js): design/project-store.md, updates/2026-11-24 HOME SCREEN phase 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toDoc, fromDoc, lengthOfEdit, coverOf } from '../src/ui/project-doc.js';

const words = [{ w: 'hello', s: 0.2, e: 0.6 }, { w: 'there', s: 0.7, e: 1.1, fixed: true }];
const swap = { recording: '/r/mic.wav', offset: -1.2, synced: true, media: '/p/audio/swap-1.mov' };
const rustParts = [
  { id: 1, path: '/v/a.mov', name: 'a.mov', swap },
  { id: 3, path: '/v/b.mov', name: 'b.mov', swap: null },
];
const state = () => ({
  parts: [
    { ...rustParts[0], swap: { ...swap, matched: -1.0 }, duration: 60, heard: '/v/a.mov', error: null, wanted: false,
      transcript: { words: [{ w: 'helo', s: 0.2, e: 0.6 }], speech: [[0, 59]], seconds: 60 } },
    { ...rustParts[1], duration: 30, transcript: null, error: 'boom', wanted: true },
  ],
  edit: { cuts: [{ part: 1, s: 0, e: 4, by: 'you' }], words: { 1: words }, notes: [{ id: 'n1', part: 1, s: 5, e: 6, text: 'look', color: 'yellow', by: 'you', done: false }], dismissed: [] },
  trace: { runs: [{ id: 'run-1', verdicts: { 0: 'yes' } }] },
});

test('doc → state → doc is the same, and it is plain JSON', () => {
  const doc = toDoc(state());
  const back = fromDoc(JSON.parse(JSON.stringify(doc)), rustParts);
  assert.deepEqual(toDoc(back), doc);
  assert.deepEqual(back.edit, state().edit);
  assert.deepEqual(back.trace, state().trace, 'Magic’s verdicts come back');
});

test('words live once, in the edit: the transcript comes back with the edited words', () => {
  const doc = toDoc(state());
  assert.equal(doc.parts[1].transcript.words, undefined);
  const { parts } = fromDoc(doc, rustParts);
  assert.deepEqual(parts[0].transcript, { speech: [[0, 59]], seconds: 60, words });
  assert.equal(parts[0].heard, '/v/a.mov', 'staleness survives');
  assert.equal(parts[0].swap.matched, -1.0, 'the nudge still shows only your change');
  assert.equal(parts[0].swap.media, swap.media, 'the swap is Rust’s');
});

test('a part still transcribing (or failed) opens with Generate again', () => {
  const { parts } = fromDoc(toDoc(state()), rustParts);
  assert.deepEqual([parts[1].transcript, parts[1].error, parts[1].wanted], [null, null, undefined]);
  assert.equal(parts[1].duration, 30);
});

test('a new project (no doc) and an old doc without notes still open', () => {
  const fresh = fromDoc(null, rustParts);
  assert.deepEqual(fresh.edit, { cuts: [], words: {}, notes: [], dismissed: [] });
  assert.deepEqual(fresh.trace, { runs: [] });
  assert.deepEqual(fresh.parts.map((p) => [p.id, p.transcript, p.duration]), [[1, null, 0], [3, null, 0]]);
  const old = fromDoc({ v: 1, edit: { cuts: [], words: { 1: words } } }, rustParts);
  assert.deepEqual([old.edit.notes, old.edit.dismissed], [[], []]);
  assert.deepEqual(old.parts[0].transcript, null, 'no transcript record: no words shown');
});

test('length: the edited length, from the player’s or the transcript’s seconds', () => {
  const s = state();
  assert.equal(lengthOfEdit(s.parts, s.edit.cuts), 56 + 30);
  assert.equal(lengthOfEdit([{ id: 1, duration: 0, transcript: { seconds: 10 } }], []), 10);
});

test('cover: the first kept moment; a cut-away start moves it after the cut', () => {
  const s = state();
  assert.deepEqual(coverOf(s.parts, []), { part: 1, t: 0.5 });
  assert.deepEqual(coverOf(s.parts, s.edit.cuts), { part: 1, t: 4.5 });
  const allOfOne = [{ part: 1, s: 0, e: 60, by: 'you' }];
  assert.deepEqual(coverOf(s.parts, allOfOne), { part: 3, t: 0.5 }, 'part 1 all cut: part 2’s first frame');
  assert.deepEqual(coverOf([{ id: 1, duration: 0 }], []), { part: 1, t: 0 }, 'length unknown yet');
  assert.equal(coverOf([], []), null);
});
