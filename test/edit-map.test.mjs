import test from 'node:test';
import assert from 'node:assert/strict';
import { laidOut, lengthOf, toEdit, fromEdit } from '../src/ui/edit-map.js';

const map = laidOut([{ part: 1, s: 0, e: 2 }, { part: 1, s: 3, e: 3.5 }, { part: 2, s: 1, e: 4 }]);

test('edit map: spans laid end to end', () => {
  assert.deepEqual(map.map((k) => k.at), [0, 2, 2.5]);
  assert.equal(lengthOf(map), 5.5);
  assert.equal(lengthOf([]), 0);
});

test('edit map: a part time to edit time; a cut is not in the edit', () => {
  assert.equal(toEdit(map, 1, 1), 1);
  assert.equal(toEdit(map, 1, 3.25), 2.25);
  assert.equal(toEdit(map, 2, 1), 2.5);
  assert.equal(toEdit(map, 1, 2.5), null, 'inside the cut');
  assert.equal(toEdit(map, 2, 0.5), null, 'before part 2 is kept');
  assert.equal(toEdit(map, 1, 2.01, 1 / 60), 2, 'a hair past a whole-frame span still counts, at its end');
});

test('edit map: edit time back to a part and its time, both ways agree', () => {
  assert.deepEqual(fromEdit(map, 2.25), { part: 1, t: 3.25 });
  assert.deepEqual(fromEdit(map, 2.5), { part: 2, t: 1 }, 'a boundary belongs to the span that starts there');
  assert.deepEqual(fromEdit(map, 99), { part: 2, t: 4 }, 'clamped to the end');
  assert.deepEqual(fromEdit(map, -1), { part: 1, t: 0 });
  assert.equal(fromEdit([], 1), null);
  for (const T of [0, 0.7, 1.99, 2.4, 3, 5.4]) {
    const { part, t } = fromEdit(map, T);
    assert.ok(Math.abs(toEdit(map, part, t) - T) < 1e-9, `round trip at ${T}`);
  }
});
