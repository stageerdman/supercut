// Magic Trace (design/magic-trace.md): outcomes worked out from the cuts, run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic, moveEdge, restoreRange, cutRange } from '../src/ui/cuts.js';
import { emptyTrace, newRun, outcome, outcomes, missed, withRun, judged, renameTracePart } from '../src/ui/trace.js';

const L = { 1: 20, 2: 20 };
const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });
// Line 3 (2–4 s) is an earlier take of line 5 (6–8 s); our rule dropped it.
const P = { line: 3, part: 1, from: 4, to: 9, s: 2, e: 4, reason: 'Earlier take', source: 'rule', instead: 5 };
const LINES = [{ id: 3, part: 1, from: 4, to: 9, text: 'so today we', s: 2, e: 4 }, { id: 5, part: 1, from: 14, to: 19, text: 'so today we will', s: 6, e: 8 }];
const RESULT = { cuts: [P], notes: [], run: { app: '0.1.0 t', model: 'claude-x', rules: 'abc', custom: [], lines: LINES, groups: [[3, 5]], answer: {} } };
const run = (before = []) => newRun(RESULT, { id: 'run-1', at: 1, before });
const magicCut = (before = []) => withMagic(before, [P], L);
const kindOf = (cuts, before = [], present = [1]) => outcome(P, cuts, before, present);
const magicPiece = (cuts) => cuts.find((c) => c.by === 'magic');

test('newRun keeps the record, the proposals, the checks and your cuts at run time', () => {
  const r = run([you(10, 11)]);
  assert.equal(r.model, 'claude-x');
  assert.deepEqual(r.proposals, [P]);
  assert.deepEqual(r.before, [you(10, 11)]);
  assert.deepEqual(r.checks, []);
});

test('a proposal left alone is kept; one dragged away and back is touched', () => {
  const cuts = magicCut();
  assert.deepEqual(kindOf(cuts), { kind: 'kept' });
  const out = moveEdge(cuts, cuts[0], 'e', 5, L);
  assert.deepEqual(kindOf(moveEdge(out, out[0], 'e', 4, L)), { kind: 'touched' });
});

test('an edge moved gives adjusted with how far each edge went', () => {
  const cuts = magicCut();
  assert.deepEqual(kindOf(moveEdge(cuts, cuts[0], 'e', 4.5, L)), { kind: 'adjusted', ds: 0, de: 0.5 });
  assert.deepEqual(kindOf(moveEdge(cuts, cuts[0], 's', 2.25, L)), { kind: 'adjusted', ds: 0.25, de: 0 });
});

test('a proposal brought back (⌫ or undo of the whole step) is restored', () => {
  assert.deepEqual(kindOf(restoreRange(magicCut(), P, L)), { kind: 'restored' });
  assert.deepEqual(kindOf([]), { kind: 'restored' }, 'undo of the Magic Cut step');
});

test('a proposal you had cut already is agreed; a removed part is gone', () => {
  const before = [you(1.5, 4.5)];
  assert.deepEqual(kindOf(magicCut(before), before), { kind: 'agreed' });
  assert.deepEqual(kindOf(magicCut(), [], [2]), { kind: 'gone' });
});

test('a hole restored inside a proposal counts as adjusted', () => {
  const holed = restoreRange(magicCut(), { part: 1, s: 2.8, e: 3.2 }, L);
  assert.deepEqual(kindOf(holed), { kind: 'adjusted', ds: 0, de: 0, hole: true });
});

test('a proposal split around your own cut, or joined to one, is still kept', () => {
  const inside = [you(2.9, 3.1)];
  assert.equal(magicCut(inside).length, 3, 'two Magic pieces around yours');
  assert.deepEqual(kindOf(magicCut(inside), inside), { kind: 'kept' });
  const after = [you(4, 5)];
  assert.deepEqual(kindOf(magicCut(after), after), { kind: 'kept' });
});

test('missed: your new cuts in the run\'s parts, not your old ones, not edge moves, not other parts', () => {
  const before = [you(12, 13)];
  let cuts = magicCut(before);
  cuts = moveEdge(cuts, magicPiece(cuts), 'e', 4.5, L);
  cuts = cutRange(cuts, { part: 1, s: 10, e: 11 }, L);
  cuts = cutRange(cuts, { part: 2, s: 1, e: 2 }, L);
  assert.deepEqual(missed(run(before), cuts), [{ part: 1, s: 10, e: 11 }]);
});

test('a re-run freezes the old run against the cuts it was judged by', () => {
  const restored = restoreRange(magicCut(), P, L);
  let trace = withRun(emptyTrace(), run(), [], [1]);
  assert.equal(trace.runs[0].frozen, undefined, 'the newest run stays live');
  trace = withRun(trace, { ...run(), id: 'run-2' }, restored, [1]);
  assert.deepEqual(trace.runs[0].frozen.outcomes, [{ kind: 'restored' }]);
  assert.deepEqual(judged(trace.runs[0], magicCut(), [1]).outcomes, [{ kind: 'restored' }], 'later cuts change nothing');
  assert.deepEqual(outcomes(trace.runs[1], magicCut(), [1]), [{ kind: 'kept' }]);
  const again = withRun(trace, { ...run(), id: 'run-3' }, magicCut(), [1]);
  assert.equal(again.runs[0], trace.runs[0], 'frozen once');
});

test('renameTracePart moves a put-back part\'s trace to its new id', () => {
  const r = { ...run([you(10, 11)]), checks: [{ part: 1, s: 6, e: 8, text: 'check' }], frozen: { outcomes: [], missed: [{ part: 1, s: 1, e: 2 }] } };
  const [renamed] = renameTracePart({ runs: [r] }, 1, 7).runs;
  for (const list of [renamed.lines, renamed.proposals, renamed.checks, renamed.before, renamed.frozen.missed]) {
    assert.ok(list.every((x) => x.part === 7));
  }
});
