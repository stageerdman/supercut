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

test('jumps: ahead lists the jumps within lead, in playing time', () => {
  const j = rig([cut(1, 2, 3), cut(1, 3.5, 4), cut(1, 6, 7)]);
  assert.deepEqual(j.ahead(0, 1, 3, 2), [
    { ahead: 1, at: 2, dest: { i: 0, t: 3 } },
    { ahead: 1.5, at: 3.5, dest: { i: 0, t: 4 } },
  ]);
  assert.equal(j.ahead(0, 1, 1.2, 2).length, 1, 'the second is past the lead');
});

test('jumps: ahead crosses from a part’s end into the next part', () => {
  const j = rig([cut(1, 9, 10), cut(2, 0.5, 1)]);
  assert.deepEqual(j.ahead(0, 8.5, 3, 2), [
    { ahead: 0.5, at: 9, dest: { i: 1, t: 0 } },
    { ahead: 1, at: 0.5, dest: { i: 1, t: 1 } },
  ]);
});

test('jumps: ahead stops where playing stops (nothing kept after)', () => {
  const j = rig([cut(2, 0, 5)]);
  assert.deepEqual(j.ahead(0, 9, 3, 2), []);
});

test('jumps: the cut you play from inside plays, only in its own part', () => {
  const through = cut(1, 2, 3);
  assert.deepEqual(rig([through], { through, throughIn: 0 }).landing(0, 2), { i: 0, t: 2 }, 'it plays: no jump');
  assert.deepEqual(rig([through], { through, throughIn: 1 }).landing(0, 2), { i: 0, t: 3 }, 'not its part: it skips');
});
