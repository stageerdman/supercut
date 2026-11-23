// Cut review verdicts (design/magic-trace.md, "Verdicts") and the "fix later" note: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic, cutRange } from '../src/ui/cuts.js';
import { emptyTrace, newRun, withRun, withVerdict, withoutVerdict, renameTracePart } from '../src/ui/trace.js';
import { reviewCuts, stops, progress } from '../src/ui/review.js';
import { addFixLater, dropFixLater, editNote, setDone } from '../src/ui/notes.js';
import { emptyEdit } from '../src/ui/edit.js';

const PARTS = [{ id: 1, duration: 60 }, { id: 2, duration: 60 }];
const L = { 1: 60, 2: 60 };
const prop = (s, e, part = 1) => ({ line: 1, part, from: 0, to: 0, s, e, reason: 'Filler', source: 'rule' });
const PROPOSALS = [prop(20, 20.5), prop(21.5, 22), prop(40, 41)];
const run = (id) => newRun({ cuts: PROPOSALS, notes: [], run: { lines: [], groups: [], answer: {} } }, { id, at: 1, before: [] });
const trace1 = () => withRun(emptyTrace(), run('run-1'), [], [1, 2]);
const NO = { says: 'no', at: 't', after: 1.8, heard: [{ part: 1, s: 17, e: 20 }], note: 'n1' };
const YES = { says: 'yes', at: 't', after: 0.9, heard: [] };
const ids = (...list) => () => list.shift();

test('a stop of two cuts writes the same verdict for each proposal in it', () => {
  const t = withVerdict(trace1(), 'run-1', [0, 1], NO);
  assert.deepEqual(t.runs[0].verdicts, { 0: NO, 1: NO });
});

test('a verdict changed overwrites it; withoutVerdict takes it back', () => {
  let t = withVerdict(trace1(), 'run-1', [0], NO);
  t = withVerdict(t, 'run-1', [0], YES);
  assert.deepEqual(t.runs[0].verdicts, { 0: YES });
  assert.deepEqual(withoutVerdict(t, 'run-1', [0]).runs[0].verdicts, {});
});

test('an unknown run id fails fast', () => {
  assert.throws(() => withVerdict(trace1(), 'nope', [0], YES), /no run "nope"/);
});

test('verdicts live outside undo: an unrelated edit undone keeps them counted', () => {
  const cuts = withMagic([], PROPOSALS, L);
  const t = withVerdict(trace1(), 'run-1', [2], YES);
  const edited = cutRange(cuts, { part: 2, s: 5, e: 6 }, L);
  for (const now of [edited, cuts]) { // the edit, then its undo
    const items = reviewCuts(t, now, PARTS);
    assert.equal(progress(items, t.runs.at(-1).verdicts).checked, 1);
  }
});

test('a Magic re-run freezes the old run with its verdicts; the new one starts unreviewed', () => {
  const cuts = withMagic([], PROPOSALS, L);
  const t = withRun(withVerdict(trace1(), 'run-1', [0], YES), run('run-2'), cuts, [1, 2]);
  assert.deepEqual(t.runs[0].verdicts, { 0: YES });
  assert.ok(t.runs[0].frozen);
  assert.equal(t.runs[1].verdicts, undefined);
});

test('undo of the whole Magic step keeps the verdicts but the stops vanish', () => {
  const t = withVerdict(trace1(), 'run-1', [0], YES);
  assert.deepEqual(reviewCuts(t, [], PARTS), []);
  assert.deepEqual(t.runs[0].verdicts, { 0: YES });
});

test('a renamed part renames the spans a verdict heard', () => {
  const t = renameTracePart(withVerdict(trace1(), 'run-1', [0], NO), 1, 7);
  assert.deepEqual(t.runs[0].verdicts[0].heard, [{ part: 7, s: 17, e: 20 }]);
});

test('"fix later" is an empty red note over the stop\'s cuts, about them', () => {
  const cuts = withMagic([], PROPOSALS, L);
  const [stop] = stops(reviewCuts(trace1(), cuts, PARTS), PARTS, cuts);
  const { edit, notes, label } = addFixLater(emptyEdit(), stop.items, { id: ids('n1') });
  assert.equal(label, 'Review: fix later');
  assert.deepEqual(notes, [{ id: 'n1', part: 1, s: 20, e: 22, text: '', color: 'red', by: 'you', done: false, about: { s: 20, e: 22, by: 'magic' } }]);
  assert.deepEqual(edit.notes, notes);
});

test('a stop across two parts gets one note per part', () => {
  const items = [{ part: 1, s: 58, e: 59, by: 'magic' }, { part: 2, s: 1, e: 2, by: 'magic' }];
  const { notes } = addFixLater(emptyEdit(), items, { id: ids('a', 'b') });
  assert.deepEqual(notes.map((n) => [n.id, n.part, n.s, n.e]), [['a', 1, 58, 59], ['b', 2, 1, 2]]);
});

test('No → Yes drops an untouched note, keeps one written in or done', () => {
  const items = [{ part: 1, s: 20, e: 22, by: 'magic' }];
  const { edit } = addFixLater(emptyEdit(), items, { id: ids('n1') });
  assert.deepEqual(dropFixLater(edit, ['n1']).edit.notes, []);
  const written = editNote(edit, 'n1', { text: 'too early' }).edit;
  assert.deepEqual(dropFixLater(written, ['n1']), { edit: written, label: '' });
  const done = setDone(edit, 'n1', true, 5).edit;
  assert.equal(dropFixLater(done, ['n1']).edit.notes.length, 1);
});
