// The notes lane's layout (src/ui/note-layout.js): design/notes.md, "The lane".
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutNotes, clusterPps, firstLine, PILL_W, BADGE_W, CLUSTER_W, MERGE, HIT_MIN } from '../src/ui/note-layout.js';

const measure = (t) => t.length * 5;
const note = (id, s, e = s, more = {}) => ({ id, part: 1, s, e, text: '', color: 'yellow', by: 'you', done: false, ...more });
const lay = (notes, pps = 100, o = {}) => layoutNotes({ notes, len: 60, pps, measure, ...o });

test('note layout: a moment is a 6 pt pill centred on its time; Magic and done are 14 pt badges', () => {
  const [m] = lay([note('a', 2)]);
  assert.equal(m.kind, 'moment');
  assert.equal(m.w, PILL_W);
  assert.equal(m.x + m.w / 2, 200);
  assert.equal(lay([note('a', 2, 2, { by: 'magic' })])[0].w, BADGE_W);
  assert.equal(lay([note('a', 2, 2, { done: true })], 100, { showDone: true })[0].w, BADGE_W);
});

test('note layout: a section is a bar from s to e, at least 6 pt; done notes are hidden unless shown', () => {
  const [s] = lay([note('a', 2, 5)]);
  assert.deepEqual([s.kind, s.x, s.w], ['section', 200, 300]);
  assert.equal(lay([note('a', 2, 2.01)])[0].w, PILL_W);
  assert.equal(lay([note('a', 2, 2, { done: true })]).length, 0);
  assert.equal(lay([note('a', 2, 2, { done: true })], 100, { showDone: true })[0].done, true);
});

test('note layout: items come in time order; the hit area is at least 12 pt and centred', () => {
  const items = lay([note('b', 9), note('a', 2, 5), note('c', 1)]);
  assert.deepEqual(items.map((m) => m.ids[0]), ['c', 'a', 'b']);
  const pill = items[0];
  assert.equal(pill.hit.w, HIT_MIN);
  assert.equal(pill.hit.x + pill.hit.w / 2, pill.cx);
  assert.equal(items[1].hit.w, 300, 'a wide bar is its own target');
});

test('note layout: labels are whole words or nothing and stop 6 pt before the next note', () => {
  // pill at 100 (x 97, w 6): label at 107; the next note at 200 (x 197) → room 197 − 6 − 107 = 84 pt = 16 chars
  const [a] = lay([note('a', 1, 1, { text: 'too tight here\nsecond line' }), note('b', 2)]);
  assert.equal(a.labelX, 107);
  assert.equal(a.label, 'too tight here', 'first line only');
  const [b] = lay([note('a', 1, 1, { text: 'this is much too long for the room' }), note('b', 2)]);
  assert.equal(b.label, 'this is much…');
  const [c] = lay([note('a', 1, 1, { text: 'unbelievablylongword' }), note('b', 2)]);
  assert.equal(c.label, '', 'not even the first word fits: no label');
  assert.equal(lay([note('a', 1)])[0].label, '', 'an empty note has no label');
});

test('note layout: a section label sits inside the bar, after the stripe (and the ✦ for Magic)', () => {
  const [s] = lay([note('a', 1, 3, { text: 'listen to both takes' })]);
  assert.equal(s.labelX, 106);
  assert.equal(s.label, 'listen to both takes');
  const [m] = lay([note('a', 1, 3, { text: 'x', by: 'magic' })]);
  assert.equal(m.labelX, 120);
  const [short] = lay([note('a', 1, 1.5, { text: 'listen to both takes' })]);
  assert.equal(short.label, 'listen…', 'bar 100…150: room 146 − 106 = 40 pt (stops 4 pt before the bar ends)');
});

test('note layout: the part end stops a label too', () => {
  const [a] = layoutNotes({ notes: [note('a', 59.5, 59.5, { text: 'end words' })], len: 60, pps: 100, measure });
  assert.equal(a.label, 'end…', 'room to the part end: 6000 − 6 − 5957 = 37 pt; "end words" is 45');
});

test('note layout: markers closer than 12 pt merge into a cluster with the count; colour shared or none', () => {
  const items = lay([note('a', 1), note('b', 1.05), note('c', 1.1, 1.1, { color: 'blue' }), note('d', 5)], 100);
  assert.equal(items.length, 2);
  const [cl, d] = items;
  assert.equal(cl.kind, 'cluster');
  assert.deepEqual(cl.ids, ['a', 'b', 'c']);
  assert.equal(cl.w, CLUSTER_W);
  assert.equal(cl.color, null, 'mixed colours');
  assert.equal(lay([note('a', 1), note('b', 1.05)])[0].color, 'yellow');
  assert.equal(d.kind, 'moment');
  assert.equal(lay([note('a', 1), note('b', 1.05)], 1000).length, 2, 'zoomed in, they separate');
  assert.equal(lay([note('a', 1, 4), note('b', 1.05)]).length, 2, 'a wide section never merges');
});

test('note layout: longer sections sit lower; moments on top', () => {
  const items = lay([note('long', 1, 10), note('short', 2, 3), note('m', 2.5)]);
  const z = Object.fromEntries(items.map((m) => [m.ids[0], m.z]));
  assert.ok(z.long < z.short && z.short < z.m);
});

test('clusterPps: the zoom where the closest two are 12 pt · 1.15 apart', () => {
  const pps = clusterPps([note('a', 1), note('b', 1.1), note('c', 1.5)]);
  assert.ok(Math.abs(pps - (MERGE * 1.15) / 0.1) < 1e-6);
  assert.equal(lay([note('a', 1), note('b', 1.1), note('c', 1.5)], pps).length, 3);
  assert.equal(clusterPps([note('a', 1), note('b', 1)]), Infinity, 'at the same moment they never separate');
});

test('firstLine: trimmed first line', () => {
  assert.equal(firstLine('  hi there \nmore'), 'hi there');
  assert.equal(firstLine(''), '');
});
