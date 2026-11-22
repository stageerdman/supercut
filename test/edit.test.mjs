// The edit model (design/edit-model.md), run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isCut, cutsOf, wordRange, toggleWords, toggleRange, moveEdge, withMagic } from '../src/ui/cuts.js';
import { fixWords } from '../src/ui/fix.js';
import { emptyEdit, withWords, withoutPart, renamePart } from '../src/ui/edit.js';
import { createHistory, changed } from '../src/ui/history.js';
import { FRAME } from '../src/ui/bit.js';

const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });
const magic = (s, e, reason = 'earlier take', part = 1) => ({ part, s, e, by: 'magic', reason });
// Four words of part 1 with pauses between; the part is 3 s long.
const W = [{ w: 'so', s: 0.2, e: 0.4 }, { w: 'um', s: 0.6, e: 0.9 }, { w: 'well', s: 1.1, e: 1.4 }, { w: 'yes', s: 1.6, e: 2 }];
const L = { 1: 3 };
const cutFlags = (cuts) => W.map((w) => isCut(w, cutsOf(cuts, 1)));

// ---------- normalize ----------

test('normalize sorts per part, clamps to the part and drops cuts under a frame', () => {
  assert.deepEqual(normalize([you(2, 4), you(-1, 0.5), you(1, 1 + FRAME / 2), you(0, 1, 2)], L), [you(0, 0.5), you(2, 3), you(0, 1, 2)]);
  assert.deepEqual(normalize([you(0, FRAME)]), [you(0, FRAME)], 'exactly a frame stays');
});

test('normalize merges overlaps and gaps under a frame; a merge with yours is yours', () => {
  assert.deepEqual(normalize([you(0, 1), you(0.5, 2)]), [you(0, 2)]);
  assert.deepEqual(normalize([you(0, 1), you(1 + FRAME / 2, 2)]), [you(0, 2)], 'sliver gap closed');
  assert.deepEqual(normalize([you(0, 1), you(1 + FRAME, 2)]), [you(0, 1), you(1 + FRAME, 2)], 'a frame apart: two cuts');
  assert.deepEqual(normalize([magic(0, 1), you(0.5, 2)]), [{ ...you(0, 2), reason: 'earlier take' }], 'reason kept');
  assert.deepEqual(normalize([magic(0, 1), magic(0.5, 2, 'fumble')]), [magic(0, 2)]);
  assert.deepEqual(normalize([{ part: 1, s: 0, e: 1 }]), [you(0, 1)], 'no owner → yours');
});

test('normalize keeps touching cuts of different owners apart, closing the gap', () => {
  assert.deepEqual(normalize([magic(0, 1), you(1, 2)]), [magic(0, 1), you(1, 2)]);
  assert.deepEqual(normalize([magic(0, 1), you(1.01, 2)]), [magic(0, 1), you(1, 2)]);
});

// ---------- words ↔ time ----------

test('wordRange runs from pause middle to pause middle; first word from 0, last to the end', () => {
  assert.deepEqual(wordRange(W.slice(1, 3), W, 3), { s: 0.5, e: 1.5 });
  assert.deepEqual(wordRange([W[0]], W, 3), { s: 0, e: 0.5 });
  assert.deepEqual(wordRange([W[3]], W, 3), { s: 1.5, e: 3 });
  assert.deepEqual(wordRange([W[3]], W), { s: 1.5, e: 2 }, 'length unknown → the last word ends it');
  assert.deepEqual(wordRange([{ s: 1.1, e: 1.4 }], W, 3), { s: 1, e: 1.5 }, 'found by time (copies from the DOM)');
  assert.throws(() => wordRange([{ s: 9, e: 9.5 }], W), RangeError);
});

test('⌫ on words cuts their pause-to-pause range, yours, labelled', () => {
  const { cuts, label } = toggleWords([], 1, W.slice(1, 3), W, L);
  assert.deepEqual(cuts, [you(0.5, 1.5)]);
  assert.equal(label, 'Cut 2 words');
  assert.deepEqual(cutFlags(cuts), [false, true, true, false]);
  assert.equal(toggleWords([], 1, [W[0]], W, L).label, 'Cut 1 word');
});

test('cut words, ⌫ again leaves no cuts', () => {
  const once = toggleWords([], 1, W.slice(1, 3), W, L).cuts;
  const twice = toggleWords(once, 1, W.slice(1, 3), W, L);
  assert.deepEqual(twice, { cuts: [], label: 'Restored 2 words' });
  const ends = toggleWords([], 1, [W[0], W[1]], W, L).cuts;
  assert.deepEqual(toggleWords(ends, 1, [W[0], W[1]], W, L).cuts, [], 'a trim too');
});

test('⌫ on partly cut words cuts them all; other parts are separate', () => {
  const once = toggleWords([], 1, [W[1]], W, L).cuts;
  const more = toggleWords(once, 1, W.slice(1, 3), W, L).cuts;
  assert.deepEqual(more, [you(0.5, 1.5)]);
  assert.deepEqual(toggleWords([you(0, 3, 2)], 1, [W[1]], W, L).cuts, [you(0.5, 1), you(0, 3, 2)]);
});

test('restoring one word splits a long cut; the pieces keep owner and reason', () => {
  const back = toggleWords([magic(0, 3)], 1, [W[1]], W, L).cuts;
  assert.deepEqual(back, [magic(0, 0.5), magic(1, 3)]);
  assert.deepEqual(cutFlags(back), [true, false, true, true]);
});

test('⌫ on a time range: cut it, ⌫ again restores exactly it', () => {
  const { cuts, label } = toggleRange([], { part: 1, s: 1, e: 2.4 }, L);
  assert.deepEqual([cuts, label], [[you(1, 2.4)], 'Cut 1.4 s']);
  assert.deepEqual(toggleRange(cuts, { part: 1, s: 1, e: 2.4 }, L), { cuts: [], label: 'Restored 1.4 s' });
  const two = [magic(0, 1), you(1, 2)];
  assert.deepEqual(toggleRange(two, { part: 1, s: 0.5, e: 1.5 }, L).cuts, [magic(0, 0.5), you(1.5, 2)], 'covered by two touching cuts');
  assert.equal(toggleRange([you(0, 1)], { part: 1, s: 0.5, e: 1.5 }, L).label, 'Cut 1.0 s', 'partly cut → cut');
});

// ---------- edges ----------

test('moveEdge resizes, clamps to the part, and makes a Magic cut yours', () => {
  const m = magic(1, 2);
  assert.deepEqual(moveEdge([m], m, 'e', 2.5, L), [{ ...you(1, 2.5), reason: 'earlier take' }]);
  assert.deepEqual(moveEdge([m], m, 's', -4, L), [{ ...you(0, 2), reason: 'earlier take' }]);
  assert.deepEqual(moveEdge([m], m, 'e', 9, L)[0].e, 3);
});

test('moveEdge into a neighbour merges; closed or crossed, the cut is gone', () => {
  const a = you(0, 1), b = you(2, 2.5);
  assert.deepEqual(moveEdge([a, b], a, 'e', 2.2, L), [you(0, 2.5)]);
  assert.deepEqual(moveEdge([a, b], b, 's', 2.5, L), [a]);
  assert.deepEqual(moveEdge([a, b], b, 's', 2.9, L), [a], 'crossed its other edge');
  assert.throws(() => moveEdge([a], you(0, 1), 'e', 2), RangeError, 'found by identity');
});

// ---------- Magic ----------

test('withMagic replaces the last run, keeps yours and the ones you changed', () => {
  const mine = you(2.5, 3), changedByYou = { ...you(0, 0.5), reason: 'fumble' };
  const first = withMagic([mine, changedByYou], [{ part: 1, from: 1, to: 2, s: 0.5, e: 1.5, reason: 'earlier take' }], L);
  assert.deepEqual(first, [changedByYou, magic(0.5, 1.5), mine]);
  assert.deepEqual(withMagic(first, [{ part: 1, s: 1.6, e: 2, reason: 'fumble' }], L), [changedByYou, magic(1.6, 2, 'fumble'), mine]);
  assert.deepEqual(withMagic(first, [], L), [changedByYou, mine], 'nothing found: only yours stay');
  assert.deepEqual(withMagic([], [{ part: 1, s: 0, e: 1 }]), [magic(0, 1, 'Magic Cut')], 'a reason by default');
});

test("withMagic subtracts what you've cut from Magic's cuts", () => {
  assert.deepEqual(withMagic([you(1, 2)], [{ part: 1, s: 0, e: 3, reason: 'retake' }], L), [magic(0, 1, 'retake'), you(1, 2), magic(2, 3, 'retake')]);
  const again = withMagic(withMagic([you(1, 2)], [{ part: 1, s: 0, e: 3, reason: 'retake' }], L), [], L);
  assert.deepEqual(again, [you(1, 2)], 'the next run still takes its own pieces back');
});

// ---------- fixing words ----------

test('fixWords: one → one keeps the time and marks it fixed', () => {
  const out = fixWords(W, 1, 1, 'uh');
  assert.deepEqual(out[1], { w: 'uh', s: 0.6, e: 0.9, fixed: true });
  assert.equal(out.length, 4);
  assert.equal(out[0], W[0], 'the others are untouched');
});

test('fixWords: one → three shares the span by letter count', () => {
  const out = fixWords([{ w: 'gonna', s: 1, e: 2 }], 0, 0, 'go  to be');
  assert.deepEqual(out.map((w) => w.w), ['go', 'to', 'be']);
  assert.deepEqual(out.map((w) => [+w.s.toFixed(3), +w.e.toFixed(3)]), [[1, 1.333], [1.333, 1.667], [1.667, 2]]);
  const uneven = fixWords([{ w: 'x', s: 0, e: 1 }], 0, 0, 'a bcd');
  assert.deepEqual(uneven.map((w) => [w.s, w.e]), [[0, 0.25], [0.25, 1]]);
});

test('fixWords: many → one, and empty text changes nothing', () => {
  assert.deepEqual(fixWords(W, 1, 3, 'well'), [W[0], { w: 'well', s: 0.6, e: 2, fixed: true }]);
  assert.equal(fixWords(W, 1, 2, '  '), W);
  assert.throws(() => fixWords(W, 2, 9, 'x'), RangeError);
});

test('a fixed word inside a cut is still cut (cuts never move)', () => {
  const cuts = toggleWords([], 1, [W[1]], W, L).cuts;
  const fixed = fixWords(W, 1, 1, 'uh huh');
  assert.deepEqual(fixed.slice(1, 3).map((w) => isCut(w, cuts)), [true, true]);
});

// ---------- the edit state ----------

test('edit: words arrive per part, a part leaves with its cuts and words, a rename swaps its id', () => {
  const e = { ...withWords(withWords(emptyEdit(), 1, W), 2, []), cuts: [you(0, 1), you(0, 1, 2)] };
  assert.deepEqual(withoutPart(e, 1), { cuts: [you(0, 1, 2)], words: { 2: [] } });
  const r = renamePart(e, 1, 3);
  assert.deepEqual(r.cuts.map((c) => c.part), [3, 2]);
  assert.deepEqual(Object.keys(r.words).sort(), ['2', '3']);
  assert.equal(r.words[3], W);
  assert.equal(renamePart(e, 7, 8), e, 'unknown id → same edit');
  assert.deepEqual(JSON.parse(JSON.stringify(e)), e, 'plain data: saves as JSON');
});

// ---------- history ----------

test('history: push / undo / redo over the whole edit, with labels', () => {
  const h = createHistory();
  const a = { cuts: [you(0, 1)], words: {} }, b = { cuts: [you(0, 1)], words: { 1: W } };
  h.push(a, 'Cut 1.0 s');
  h.push(b, 'Fixed “so”');
  assert.equal(h.undo().label, 'Fixed “so”');
  assert.equal(h.edit, a);
  assert.equal(h.undo().label, 'Cut 1.0 s');
  assert.deepEqual(h.edit, emptyEdit());
  assert.equal(h.undo(), null, 'nothing left to undo');
  assert.equal(h.redo().label, 'Cut 1.0 s');
  assert.equal(h.edit, a);
  h.push(b, 'Fixed “so”');
  assert.equal(h.redo(), null, 'a new edit clears redo');
});

test('history: one step per call; the same edit is no step', () => {
  const h = createHistory();
  const e = h.edit;
  assert.equal(h.push(e, 'nothing'), null);
  h.push({ ...e, cuts: [you(0, 1), you(2, 3)] }, 'Cut 2 words');
  h.undo();
  assert.equal(h.edit, e);
});

test('history: everywhere() changes past and future without a step', () => {
  const h = createHistory();
  h.push({ cuts: [you(0, 1)], words: {} }, 'Cut 1.0 s');
  h.push({ cuts: [], words: {} }, 'Restored 1.0 s');
  h.undo();
  h.everywhere((e) => withWords(e, 1, W));
  assert.equal(h.edit.words[1], W);
  assert.equal(h.redo().label, 'Restored 1.0 s');
  assert.equal(h.edit.words[1], W);
  h.undo();
  h.undo();
  assert.equal(h.edit.words[1], W);
});

test('history: removing a part is one step; rename swaps its id through past and future', () => {
  const h = createHistory();
  const record = { id: 1, path: '/v/a.mov', name: 'a.mov' };
  const before = { cuts: [you(0, 1), you(0, 1, 2)], words: { 1: W, 2: [] } };
  h.push(before, 'Cut 1.0 s');
  h.push(withoutPart(before, 1), 'Removed part 1', { removed: { part: record, index: 0 } });
  const undone = h.undo();
  assert.deepEqual(undone.removed, { part: record, index: 0 });
  assert.deepEqual(h.edit, before, 'its cuts and words are back');
  h.rename(1, 5); // add_video gave the file a new id
  assert.deepEqual(h.edit.cuts.map((c) => c.part), [5, 2]);
  assert.equal(h.edit.words[5], W);
  const redone = h.redo();
  assert.equal(redone.removed.part.id, 5, 'redo removes the new id');
  assert.equal(redone.removed.part.path, '/v/a.mov');
  h.undo();
  h.undo();
  assert.deepEqual(h.edit, emptyEdit());
  h.redo();
  assert.deepEqual(h.edit.cuts, [you(0, 1, 5), you(0, 1, 2)], 'renamed in the past too');
});

test('changed() gives the range that differs, for undo to bring into view', () => {
  const a = { cuts: [you(0, 1), you(5, 6)], words: { 1: W } };
  assert.equal(changed(a, a), null);
  assert.deepEqual(changed(a, { ...a, cuts: [you(0, 1), you(5, 7)] }), { part: 1, s: 5, e: 7 });
  assert.deepEqual(changed(a, { ...a, cuts: [you(0, 1)] }), { part: 1, s: 5, e: 6 });
  assert.deepEqual(changed(a, { ...a, words: { 1: fixWords(W, 2, 2, 'good') } }), { part: 1, s: 1.1, e: 1.4 });
  assert.deepEqual(changed(a, { ...a, words: { 1: fixWords(W, 1, 2, 'a b c') } }), { part: 1, s: 0.6, e: 1.4 });
  assert.deepEqual(changed(a, { cuts: [...a.cuts, you(0, 2, 2)], words: { 1: W } }), { part: 2, s: 0, e: 2 });
});
