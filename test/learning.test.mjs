// Magic Trace learning logs (design/magic-trace.md), run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic, moveEdge, restoreRange, cutRange } from '../src/ui/cuts.js';
import { newRun, withRun, emptyTrace } from '../src/ui/trace.js';
import { learningLog } from '../src/ui/learning.js';

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
