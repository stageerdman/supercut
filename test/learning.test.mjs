// Magic Trace learning logs (design/magic-trace.md), run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic, moveEdge, restoreRange, cutRange } from '../src/ui/cuts.js';
import { newRun, withRun, emptyTrace } from '../src/ui/trace.js';
import { learningLog, learningClips } from '../src/ui/learning.js';

const L = { 1: 60 };
const line = (id, s, text = `line ${id}`) => ({ id, part: 1, from: id * 10, to: id * 10 + 5, text, s, e: s + 2 });
const LINES = [line(1, 0), line(2, 3), line(3, 6), line(4, 9), line(5, 12), line(6, 30)];
const A = { line: 2, part: 1, from: 20, to: 25, s: 3, e: 5, reason: 'Earlier take', source: 'rule', instead: 6 };
const B = { line: 4, part: 1, from: 40, to: 45, s: 9, e: 11, reason: 'Fumble', source: 'claude' };
const run = newRun({ cuts: [A, B], notes: [], run: { model: 'claude-x', lines: LINES, groups: [[2, 6]], answer: {} } }, { id: 'run-1', at: 1, before: [] });
const magicCuts = withMagic([], [A, B], L);

test('full agreement writes no log', () => {
  assert.equal(learningLog(run, magicCuts, [1]), null);
});

test('a restored and an adjusted proposal become cases with their lines and the final cuts nearby', () => {
  let cuts = restoreRange(magicCuts, A, L);
  cuts = moveEdge(cuts, cuts.find((c) => c.s === 9), 'e', 11.5, L);
  const log = learningLog(run, cuts, [1]);
  assert.deepEqual(log.outcomes.map((o) => o.kind), ['restored', 'adjusted']);
  const [a, b] = log.cases;
  assert.deepEqual([a.kind, a.outcome.kind, a.proposal.line], ['proposal', 'restored', 2]);
  assert.deepEqual(a.lines.map((l) => l.id), [1, 2, 3, 6], 'one either side, plus the take kept instead');
  assert.deepEqual(a.cuts, [{ part: 1, s: 9, e: 11.5, by: 'you' }], 'B is within 5 s of A');
  assert.deepEqual(b.outcome, { kind: 'adjusted', ds: 0, de: 0.5 });
  assert.deepEqual(b.lines.map((l) => l.id), [3, 4, 5]);
  assert.equal(log.run.id, 'run-1');
});

test('a missed cut is a case; agreed, kept and touched are not', () => {
  const cuts = cutRange(magicCuts, { part: 1, s: 12, e: 14 }, L);
  const log = learningLog(run, cuts, [1]);
  assert.deepEqual(log.cases.map((c) => [c.kind, c.span]), [['missed', { part: 1, s: 12, e: 14 }]]);
  assert.deepEqual(log.cases[0].lines.map((l) => l.id), [4, 5, 6]);
});

test('a frozen run logs its frozen outcomes, without the frozen copy in the record', () => {
  const trace = withRun(withRun(emptyTrace(), run, [], [1]), { ...run, id: 'run-2' }, [], [1]);
  const log = learningLog(trace.runs[0], magicCuts, [1]);
  assert.deepEqual(log.outcomes.map((o) => o.kind), ['restored', 'restored']);
  assert.equal(log.run.frozen, undefined);
});

// Cut review verdicts: each row of "No, then fixed" in design/magic-trace.md.
const HEARD = [{ part: 1, s: 0, e: 3 }, { part: 1, s: 5, e: 8 }];
const said = (says, more = {}) => ({ says, at: 'T', after: 1.2, heard: HEARD, ...more });
const reviewedRun = (verdicts) => ({ ...run, verdicts });
const note = (done) => ({ id: 'n1', part: 1, s: 3, e: 5, text: '', color: 'red', by: 'you', done, ...(done && { doneAt: 9 }) });
const caseA = (verdicts, cuts, notes) => learningLog(reviewedRun(verdicts), cuts, [1], notes)?.cases.find((c) => c.index === 0);

test('no, then an edge moved: the case says by how much, and it is fixed', () => {
  const cuts = moveEdge(magicCuts, magicCuts[0], 'e', 5.5, L);
  const c = caseA({ 0: said('no', { note: 'n1' }) }, cuts, [note(false)]);
  assert.deepEqual([c.outcome, c.verdict, c.fixed, c.doneAt], [{ kind: 'adjusted', ds: 0, de: 0.5 }, { says: 'no', after: 1.2 }, true, null]);
  assert.deepEqual(c.heard, HEARD);
});

test('no by ⌫: restored, fixed, how kept', () => {
  const c = caseA({ 0: said('no', { how: 'restored' }) }, restoreRange(magicCuts, A, L), []);
  assert.deepEqual([c.outcome.kind, c.verdict.how, c.fixed], ['restored', 'restored', true]);
});

test('no, left as it was: fixed once the note is done (a weak no), else open', () => {
  assert.deepEqual([caseA({ 0: said('no', { note: 'n1' }) }, magicCuts, [note(true)])].map((c) => [c.fixed, c.doneAt]), [[true, 9]]);
  assert.equal(caseA({ 0: said('no', { note: 'n1' }) }, magicCuts, [note(false)]).fixed, false);
});

test('yes on a kept cut is a label, not a case: a yes-only run writes no log', () => {
  assert.equal(learningLog(reviewedRun({ 0: said('yes'), 1: said('yes') }), magicCuts, [1]), null);
});

test('yes, then changed anyway, is a case that carries the yes', () => {
  const c = caseA({ 0: said('yes') }, restoreRange(magicCuts, A, L), []);
  assert.deepEqual([c.outcome.kind, c.verdict.says, c.fixed], ['restored', 'yes', false]);
});

test('the log keeps verdicts beside outcomes, not inside the run record', () => {
  const log = learningLog(reviewedRun({ 0: said('no') }), magicCuts, [1]);
  assert.deepEqual(Object.keys(log.verdicts), ['0']);
  assert.equal(log.run.verdicts, undefined);
});

test('a clip for each "no" that heard something, named run-index', () => {
  const log = learningLog(reviewedRun({ 0: said('no'), 1: said('yes') }), restoreRange(magicCuts, B, L), [1]);
  assert.deepEqual(learningClips('run-1', log), [{ id: 'run-1-0', heard: HEARD }]);
  assert.deepEqual(learningClips('run-1', null), []);
});
