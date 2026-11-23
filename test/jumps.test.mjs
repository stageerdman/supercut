import test from 'node:test';
import assert from 'node:assert/strict';
import { createJumps } from '../src/ui/jumps.js';

const parts = [{ id: 1, duration: 10 }, { id: 2, duration: 5 }];
const cut = (part, s, e) => ({ part, s, e, by: 'you' });
const rig = (cuts, more = {}) => createJumps({ parts, cuts, lenOf: (i) => parts[i].duration, ...more });

test('jumps: landing goes over touching cuts in one jump', () => {
  const j = rig([cut(1, 2, 3), cut(1, 3, 4)]);
  assert.deepEqual(j.landing(0, 2), { i: 0, t: 4 });
});

test('jumps: a cut to the end of a part lands on the next part’s first kept moment', () => {
  const j = rig([cut(1, 8, 10), cut(2, 0, 1)]);
  assert.deepEqual(j.landing(0, 8), { i: 1, t: 1 });
});

test('jumps: next is the first cut after t, landing past any cut touching it', () => {
  const j = rig([cut(1, 2, 3), cut(1, 3, 4), cut(1, 6, 7)]);
  assert.deepEqual(j.next(0, 1), { at: 2, dest: { i: 0, t: 4 } });
  assert.deepEqual(j.next(0, 4), { at: 6, dest: { i: 0, t: 7 } });
});

test('jumps: next from a part’s end (or a cut to it) goes into the next part', () => {
  assert.deepEqual(rig([]).next(0, 8), { at: 10, dest: { i: 1, t: 0 } });
  assert.deepEqual(rig([cut(1, 9, 10), cut(2, 0, 1)]).next(0, 8), { at: 9, dest: { i: 1, t: 1 } });
});

test('jumps: next stops where playing stops (nothing kept after)', () => {
  assert.deepEqual(rig([cut(2, 0, 5)]).next(0, 9), { at: 10, dest: null });
});

test('jumps: the cut you play from inside plays, only in its own part', () => {
  const through = cut(1, 2, 3);
  assert.deepEqual(rig([through], { through, throughIn: 0 }).landing(0, 2), { i: 0, t: 2 }, 'it plays: no jump');
  assert.deepEqual(rig([through], { through, throughIn: 1 }).landing(0, 2), { i: 0, t: 3 }, 'not its part: it skips');
});
