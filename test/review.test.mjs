// Cut review (design/cut-review.md): stops, windows and progress, run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic, normalize, restoreRange, moveEdge, cutRange } from '../src/ui/cuts.js';
import { emptyTrace, newRun, withRun } from '../src/ui/trace.js';
import { reviewCuts, stops, stopCount, removed, reviewWindow, checked, openingStop, nextUnchecked, step, progress } from '../src/ui/review.js';

const PARTS = [{ id: 1, duration: 60 }];
const L = { 1: 60, 2: 30 };
const prop = (s, e, part = 1, more = {}) => ({ line: 1, part, from: 0, to: 0, s, e, reason: 'Filler', source: 'rule', ...more });
const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });
const run = (proposals, { before = [], checks = [], lines = [] } = {}) =>
  newRun({ cuts: proposals, notes: checks, run: { lines, groups: [], answer: {} } }, { id: 'run-1', at: 1, before });
const traced = (proposals, opts) => withRun(emptyTrace(), run(proposals, opts), [], [1, 2]);
const magicCut = (proposals, before = []) => withMagic(before, proposals, L);

/** The stops of a run of proposals, as Magic left them. */
function setup(proposals, parts = PARTS, before = []) {
  const trace = traced(proposals, { before });
  const cuts = magicCut(proposals, before);
  const items = reviewCuts(trace, cuts, parts);
  return { trace, cuts, items, list: stops(items, parts, cuts) };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('a cut in the middle plays 3 s either side of its join, skipping the cut', () => {
  const { cuts, list } = setup([prop(20, 22)]);
  const w = reviewWindow(list[0], PARTS, cuts);
  close(w.from, 17); close(w.to, 23);
  assert.equal(w.edge, null);
  assert.deepEqual(w.spans, [{ part: 1, s: 17, e: 20 }, { part: 1, s: 22, e: 25 }]);
});

test('at the start the window starts at 0:00 and still plays 6 s', () => {
  const { cuts, list } = setup([prop(1, 2)]);
  const w = reviewWindow(list[0], PARTS, cuts);
  assert.deepEqual([w.from, w.to, w.edge], [0, 6, 'start']);
  assert.deepEqual(w.spans, [{ part: 1, s: 0, e: 1 }, { part: 1, s: 2, e: 7 }]);
});

test('at the end the window ends at the end and starts 6 s before it', () => {
  const { cuts, list } = setup([prop(57, 58)]);
  const w = reviewWindow(list[0], PARTS, cuts);
  close(w.from, 53); close(w.to, 59);
  assert.equal(w.edge, 'end');
  assert.deepEqual(w.spans.at(-1), { part: 1, s: 58, e: 60 });
});

test('a window across two parts plays them in play order', () => {
  const parts = [{ id: 2, duration: 30 }, { id: 1, duration: 60 }]; // part 2 plays first
  const { cuts, list } = setup([prop(1, 2, 1)], parts);
  const w = reviewWindow(list[0], parts, cuts);
  close(w.from, 28); close(w.to, 34);
  assert.deepEqual(w.spans, [{ part: 2, s: 28, e: 30 }, { part: 1, s: 0, e: 1 }, { part: 1, s: 2, e: 5 }]);
});

test('a 40 s cut and a 0.3 s cut each get the same 6 s window around the join', () => {
  for (const [s, e] of [[10, 50], [20, 20.3]]) {
    const { cuts, list } = setup([prop(s, e)]);
    const w = reviewWindow(list[0], PARTS, cuts);
    close(w.to - w.from, 6);
    assert.deepEqual(w.spans.map((x) => [x.s, x.e].map((t) => +t.toFixed(3))), [[s - 3, s], [e, e + 3]]);
    close(removed(list[0]), e - s);
  }
});

test('three fillers in 4 s are one stop; five are two, capped at 3', () => {
  const three = setup([prop(20, 20.5), prop(21.5, 22), prop(23.5, 24)]);
  assert.equal(three.list.length, 1);
  assert.equal(stopCount(three.list[0], 3), 'Cuts 1–3 of 3');
  const w = reviewWindow(three.list[0], PARTS, three.cuts);
  assert.equal(w.spans.length, 4, 'every cut in it skipped');
  const five = setup([20, 21, 22, 23, 24].map((s) => prop(s, s + 0.4)));
  assert.deepEqual(five.list.map((s) => [s.first, s.last]), [[1, 3], [4, 5]]);
  assert.equal(stopCount(five.list[1], 5), 'Cuts 4–5 of 5');
  assert.equal(stopCount(setup([prop(20, 21)]).list[0], 1), 'Cut 1 of 1');
});

test('cuts further apart than 3 s of edited time are separate stops', () => {
  const { list } = setup([prop(10, 11), prop(15, 16)]);
  assert.equal(list.length, 2);
});

test('with no Magic run your own cuts are reviewed, head and tail trims left out', () => {
  const cuts = normalize([you(0, 2), you(20, 21), you(58, 60)], L);
  const items = reviewCuts(emptyTrace(), cuts, PARTS);
  assert.deepEqual(items.map((i) => [i.s, i.e, i.by, i.reason]), [[20, 21, 'you', 'Your cut']]);
});

test("Magic's run comes first; agreed proposals are not stops", () => {
  const before = [you(30, 32)];
  const { items } = setup([prop(10, 11), prop(30, 32)], PARTS, before);
  assert.deepEqual(items.map((i) => [i.index, i.by]), [[0, 'magic']]);
});

test('a Magic step undone as a whole falls back to your cuts', () => {
  const trace = traced([prop(10, 11)]);
  const cuts = normalize([you(20, 21)], L);
  assert.deepEqual(reviewCuts(trace, cuts, PARTS).map((i) => i.by), ['you']);
});

test('a proposal put back counts as checked and is skipped by the next-unchecked step', () => {
  const proposals = [prop(10, 11), prop(20, 21), prop(30, 31)];
  const trace = traced(proposals);
  const cuts = restoreRange(magicCut(proposals), { part: 1, s: 20, e: 21 }, L);
  const items = reviewCuts(trace, cuts, PARTS);
  const list = stops(items, PARTS, cuts);
  assert.equal(list.length, 3, 'still counted');
  assert.ok(checked(list[1], {}));
  assert.equal(nextUnchecked(list, {}, 0), 2);
  assert.deepEqual(progress(items, {}), { checked: 1, total: 3, toFix: 0 });
});

test('progress after a merge or a split of the cuts still matches the proposals', () => {
  const proposals = [prop(10, 11), prop(11.5, 12), prop(30, 31)];
  const { trace, cuts } = setup(proposals);
  const verdicts = { 0: { says: 'yes' }, 1: { says: 'no' } };
  const merged = cutRange(cuts, { part: 1, s: 10.5, e: 11.8 }, L); // joins the first two, now yours
  const split = restoreRange(cuts, { part: 1, s: 30.4, e: 30.6 }, L); // a hole in the third
  for (const now of [merged, split]) {
    assert.deepEqual(progress(reviewCuts(trace, now, PARTS), verdicts), { checked: 2, total: 3, toFix: 1 });
  }
});

test('an edge moved during review moves the join the window plays around', () => {
  const { trace, cuts } = setup([prop(20, 22)]);
  const moved = moveEdge(cuts, cuts[0], 'e', 23, L);
  const list = stops(reviewCuts(trace, moved, PARTS), PARTS, moved);
  assert.deepEqual(reviewWindow(list[0], PARTS, moved).spans, [{ part: 1, s: 17, e: 20 }, { part: 1, s: 23, e: 26 }]);
});

test('the reason names the kept take and adds the check note on that stretch', () => {
  const lines = [{ id: 1, part: 1, s: 10, e: 11, text: 'so today' }, { id: 2, part: 1, s: 12, e: 13, text: 'so today we' }];
  const p = prop(10, 11, 1, { reason: 'Earlier take', instead: 2 });
  const trace = withRun(emptyTrace(), run([p], { lines, checks: [{ part: 1, s: 9, e: 12, text: 'Two good takes' }] }), [], [1]);
  const [item] = reviewCuts(trace, magicCut([p]), PARTS);
  assert.equal(item.reason, 'Earlier take · kept “so today we” · Two good takes');
});

test('opening: first unchecked, else the first for a second pass; -1 with nothing', () => {
  const { list } = setup([prop(10, 11), prop(20, 21), prop(30, 31)]);
  assert.equal(openingStop(list, { 0: { says: 'yes' } }), 1);
  assert.equal(openingStop(list, { 0: { says: 'yes' }, 1: { says: 'no' }, 2: { says: 'yes' } }), 0);
  assert.equal(openingStop([], {}), -1);
});

test('after a verdict on the last stop review ends, even with earlier stops skipped', () => {
  const { list } = setup([prop(10, 11), prop(20, 21), prop(30, 31)]);
  assert.equal(nextUnchecked(list, { 2: { says: 'yes' } }, 2), -1);
  assert.equal(nextUnchecked(list, {}, 0), 1);
});

test('↑/↓ never wrap', () => {
  const list = [{}, {}, {}];
  assert.deepEqual(step(list, 2, 1), { i: 2, edge: 'last' });
  assert.deepEqual(step(list, 0, -1), { i: 0, edge: 'first' });
  assert.deepEqual(step(list, 1, 1), { i: 2, edge: null });
});

test('to fix counts "fix later" Nos, not put-back ones', () => {
  const { items } = setup([prop(10, 11), prop(20, 21), prop(30, 31)]);
  const verdicts = { 0: { says: 'no' }, 1: { says: 'no', how: 'restored' }, 2: { says: 'yes' } };
  assert.deepEqual(progress(items, verdicts), { checked: 3, total: 3, toFix: 1 });
});
