// Cut review session: Y, ⌫, ←/→, ⌘Z, the filter, Esc and the end line over a real history and trace: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic, normalize } from '../src/ui/cuts.js';
import { emptyTrace, newRun, withRun, outcomes } from '../src/ui/trace.js';
import { createHistory } from '../src/ui/history.js';
import { emptyEdit } from '../src/ui/edit.js';
import { createWindowPlay } from '../src/ui/review-play.js';
import { createReviewSession } from '../src/ui/review-session.js';

const PARTS = [{ id: 1, duration: 60 }];
const L = { 1: 60 };
const prop = (s, e) => ({ line: 1, part: 1, from: 0, to: 0, s, e, reason: 'Filler', source: 'rule' });
const PROPOSALS = [prop(10, 11), prop(20, 21), prop(30, 31)];

function setup({ magic = true, cuts } = {}) {
  const history = createHistory({ ...emptyEdit(), cuts: cuts ?? (magic ? withMagic([], PROPOSALS, L) : []) });
  let trace = magic
    ? withRun(emptyTrace(), newRun({ cuts: PROPOSALS, notes: [], run: { lines: [], groups: [], answer: {} } }, { id: 'run-1', at: 1, before: [] }), [], [1])
    : emptyTrace();
  const said = [];
  const shown = [];
  const player = { playing: false, show(i, t) { shown.push(t); this.playing = true; }, pause() { this.playing = false; }, play() { this.playing = true; } };
  const play = createWindowPlay(player, { parts: () => PARTS, cuts: () => history.edit.cuts });
  let n = 0;
  const session = createReviewSession({
    edit: () => history.edit,
    commit: (edit, label) => history.push(edit, label),
    undo: () => history.undo(),
    trace: () => trace,
    setTrace: (t) => { trace = t; },
    parts: () => PARTS,
    play,
    say: (text) => said.push(text),
    now: () => 'T',
    id: () => `n${++n}`,
  });
  return { session, history, said, shown, play, trace: () => trace };
}
const verdictsOf = (s) => s.trace().runs[0].verdicts ?? {};

test('start opens at the first stop and plays its window', () => {
  const s = setup();
  assert.equal(s.session.start(), true);
  assert.deepEqual(s.shown, [7]);
  assert.equal(s.session.view().count, 'Cut 1 of 3');
  assert.equal(s.session.view().removed, '1.0 s cut');
});

test('Y records yes with how far in and what was heard, and plays the next stop', () => {
  const s = setup();
  s.session.start();
  s.play.at(0, 8.8);
  s.session.yes();
  const v = verdictsOf(s)[0];
  assert.deepEqual([v.says, v.after, v.heard.length], ['yes', 1.8, 2]);
  assert.equal(s.session.at, 1);
  assert.equal(s.shown.at(-1), 17, 'edited 16 s, past the first cut');
  assert.equal(s.history.edit.cuts.length, 3, 'a Yes changes nothing in the edit');
});

test('⌫ puts the cut back, counts as checked, and moves on', () => {
  const s = setup();
  s.session.start();
  s.session.putBack();
  assert.equal(s.history.edit.cuts.length, 2);
  const { says, how, note } = verdictsOf(s)[0];
  assert.deepEqual([says, how, note], ['no', 'restored', undefined]);
  assert.deepEqual(s.history.edit.notes, [], 'no note: it is fixed already');
  assert.equal(s.session.view().checked, 1);
  assert.equal(s.session.view().count, 'Cut 2 of 3');
});

test('⌘Z after another edit is the usual undo', () => {
  const s = setup();
  s.session.start();
  s.session.yes();
  s.history.push({ ...s.history.edit, cuts: [] }, 'something else');
  assert.equal(s.session.undoLast(), false);
});

test('⌘Z right after Y removes the verdict and goes back; only once', () => {
  const s = setup();
  s.session.start();
  s.session.yes();
  assert.equal(s.session.undoLast(), true);
  assert.deepEqual(verdictsOf(s), {});
  assert.equal(s.session.at, 0);
  assert.equal(s.session.undoLast(), false, 'only once');
});

test('← shows the verdict given; there is no "fix later" any more', () => {
  const s = setup();
  s.session.start();
  s.session.yes();
  s.session.move(-1);
  assert.equal(s.session.view().chosen, 'yes');
  assert.equal(s.session.no, undefined);
  assert.equal(s.history.edit.notes.length, 0);
});

test('→ on the last stop opens the end line, quietly; ← there is the last stop again', () => {
  const s = setup();
  s.session.start();
  s.session.move(1); s.session.move(1);
  assert.equal(s.session.view().hasNext, true, 'the last stop can still go on: to the end');
  s.session.move(1);
  assert.deepEqual([s.session.at, s.session.view().end, s.said], [-1, true, []]);
  s.session.move(-1);
  assert.equal(s.session.at, 2);
});

test('approved() lists the Looks good cuts, for the timeline, on or off', () => {
  const s = setup();
  assert.deepEqual(s.session.approved(), []);
  s.session.start();
  s.session.yes(); s.session.putBack();
  assert.deepEqual(s.session.approved(), [{ part: 1, s: 10, e: 11 }]);
  assert.equal(s.session.view().approved, 1);
  s.session.leave(true);
  assert.deepEqual(s.session.approved(), [{ part: 1, s: 10, e: 11 }]);
});

test('Esc keeps progress; starting again opens the first unchecked', () => {
  const s = setup();
  s.session.start();
  s.session.yes();
  s.session.leave();
  assert.deepEqual(s.said, ['1 of 3 checked · R to go on']);
  assert.equal(s.session.on, false);
  s.session.start();
  assert.equal(s.session.at, 1);
});

const endOf = (v) => ({ end: v.end, empty: v.empty, checked: v.checked, total: v.total, toFix: v.toFix });

test('the last verdict keeps review on, on the end line', () => {
  const s = setup();
  s.session.start();
  s.session.yes(); s.session.putBack(); s.session.yes();
  assert.deepEqual(endOf(s.session.view()), { end: true, empty: false, checked: 3, total: 3, toFix: 0 });
  const t = setup();
  t.session.start();
  t.session.yes(); t.session.yes(); t.session.yes();
  assert.equal(t.session.on, true);
  assert.deepEqual(endOf(t.session.view()), { end: true, empty: false, checked: 3, total: 3, toFix: 0 });
});

test('↑ on the end line goes to the last stop; ↓ there does nothing', () => {
  const s = setup();
  s.session.start();
  s.session.yes(); s.session.yes(); s.session.yes();
  s.session.move(1);
  assert.equal(s.session.at, -1);
  s.session.move(-1);
  assert.equal(s.session.at, 2);
  assert.equal(s.session.view().chosen, 'yes');
});

test('a stop skipped with ↓ is counted at the end and opened first next time', () => {
  const s = setup();
  s.session.start();
  s.session.move(1);
  s.session.yes(); s.session.yes();
  assert.equal(s.session.view().checked, 2);
  s.session.leave();
  assert.equal(s.said.at(-1), '2 of 3 checked · R to go on');
  s.session.start();
  assert.equal(s.session.at, 0);
});

test('▶ Play replays the clip from its start, as often as wanted, as the edit is now; never a verdict', () => {
  const s = setup();
  s.session.start();
  s.play.at(0, 9);
  s.session.replay(); s.session.replay();
  assert.deepEqual(s.shown, [7, 7, 7]);
  s.history.push({ ...s.history.edit, cuts: s.history.edit.cuts.map((c, i) => (i ? c : { ...c, s: 9 })) }, 'edge');
  s.session.replay();
  assert.equal(s.shown.at(-1), 6, 'the join moved to 9 s: the clip starts 3 s before it');
  assert.deepEqual([s.session.at, verdictsOf(s)], [0, {}]);
});

test('Space after the clip ended plays it again; before, it pauses', () => {
  const s = setup();
  s.session.start();
  s.session.toggle();
  assert.equal(s.shown.length, 1);
  s.session.toggle();
  s.play.at(0, 7.5); s.play.at(0, 14.5);
  assert.equal(s.play.ended, true);
  s.session.toggle();
  assert.deepEqual(s.shown, [7, 7]);
});

test('every start opens on All cuts, Magic\'s and yours together', () => {
  const cuts = [...withMagic([], PROPOSALS, L), ...normalize([{ part: 1, s: 45, e: 46, by: 'you' }], L)];
  const s = setup({ cuts: normalize(cuts, L) });
  s.session.start();
  assert.deepEqual([s.session.only, s.session.view().count], ['all', 'Cut 1 of 4']);
  s.session.choose('magic');
  s.session.leave();
  s.session.start();
  assert.equal(s.session.only, 'all');
});

test("choosing Magic's cuts numbers within the set and starts at its first cut", () => {
  const cuts = normalize([{ part: 1, s: 5, e: 6, by: 'you' }, ...withMagic([], PROPOSALS, L)], L);
  const s = setup({ cuts });
  s.session.start();
  s.session.yes(); // your cut at 5
  s.session.move(1); // on Magic's 20
  assert.equal(s.session.choose('magic'), true);
  assert.deepEqual([s.session.at, s.session.view().count], [0, 'Cut 1 of 3']);
  assert.deepEqual(s.session.view().counts, { all: 4, magic: 3, unapproved: 3 });
});

test('a new choice always resets to the first cut of its list; the choice already on does nothing', () => {
  const s = setup();
  s.session.start();
  s.session.yes(); s.session.yes(); // on 30
  s.session.choose('all');
  assert.equal(s.session.at, 2, 'same choice: stays');
  s.session.choose('magic');
  assert.equal(s.session.at, 0, 'first cut, checked or not');
  s.session.move(1);
  s.session.choose('all');
  assert.equal(s.session.at, 0, 'and back: first again');
});

test('Unapproved is taken once: a Y keeps "Cut 1 of 2"; taking it again drops that cut', () => {
  const s = setup();
  s.session.start();
  s.session.yes(); // 10 approved
  s.session.choose('unapproved');
  assert.deepEqual([s.session.at, s.session.view().count], [0, 'Cut 1 of 2']);
  s.session.yes();
  s.session.move(-1);
  assert.deepEqual([s.session.view().count, s.session.view().chosen], ['Cut 1 of 2', 'yes']);
  s.session.choose('all');
  s.session.choose('unapproved');
  assert.deepEqual([s.session.view().count, s.session.view().total], ['Cut 1 of 1', 1]);
});

test('every cut approved: Unapproved is empty and dimmed; the end line counts them all', () => {
  const s = setup();
  s.session.start();
  s.session.yes(); s.session.yes(); s.session.yes();
  assert.equal(s.session.view().counts.unapproved, 0);
  assert.equal(s.session.choose('unapproved'), false);
  assert.deepEqual([s.session.view().end, s.session.view().approved, s.session.view().total], [true, 3, 3]);
});

test("an empty choice can't be picked: Magic's cuts before any Magic run", () => {
  const s = setup({ magic: false, cuts: normalize([{ part: 1, s: 20, e: 21, by: 'you' }], L) });
  s.session.start();
  assert.equal(s.session.view().counts.magic, 0);
  assert.equal(s.session.choose('magic'), false);
  assert.equal(s.session.only, 'all');
});

test('the view gives the stretch the timeline frames', () => {
  const s = setup();
  s.session.start();
  assert.deepEqual(s.session.view().stretch, { i0: 0, t0: 7, i1: 0, t1: 14, seconds: 7, gaps: 0 });
});

test('undoing the Magic step mid-review keeps review on; the count updates to what is left', () => {
  const cuts = normalize([...withMagic([], PROPOSALS, L), { part: 1, s: 45, e: 46, by: 'you' }], L);
  const s = setup({ cuts });
  s.session.start();
  s.history.push({ ...s.history.edit, cuts: s.history.edit.cuts.filter((c) => c.by === 'you') }, 'undo Magic');
  assert.equal(s.session.on, true);
  s.session.choose('magic');
  s.session.choose('all');
  assert.equal(s.session.view().count, 'Cut 1 of 1');
});

test('a set emptied under you reads empty on the end line', () => {
  const s = setup({ magic: false, cuts: normalize([{ part: 1, s: 20, e: 21, by: 'you' }], L) });
  s.session.start();
  s.history.push({ ...s.history.edit, cuts: [] }, 'restore');
  assert.deepEqual(endOf(s.session.view()), { end: true, empty: true, checked: 0, total: 0, toFix: 0 });
});

test('a Magic re-run makes the session stale', () => {
  const s = setup();
  s.session.start();
  assert.equal(s.session.stale(), false);
  s.trace().runs.push({ ...s.trace().runs[0], id: 'run-2' });
  assert.equal(s.session.stale(), true);
});

test('your own cuts are reviewed without touching the trace', () => {
  const s = setup({ magic: false, cuts: normalize([{ part: 1, s: 20, e: 21, by: 'you' }], L) });
  assert.equal(s.session.start(), true);
  s.session.yes();
  assert.equal(s.trace().runs.length, 0);
  assert.deepEqual(s.session.approved(), [{ part: 1, s: 20, e: 21 }]);
  assert.deepEqual(endOf(s.session.view()), { end: true, empty: false, checked: 1, total: 1, toFix: 0 });
});

test('⌫ on your own cut keeps it in the count, checked, until review stops; ⌘Z takes it back', () => {
  const s = setup({ magic: false, cuts: normalize([{ part: 1, s: 20, e: 21, by: 'you' }, { part: 1, s: 40, e: 41, by: 'you' }], L) });
  s.session.start();
  s.session.putBack();
  assert.deepEqual([s.session.view().count, s.session.view().checked], ['Cut 2 of 2', 1]);
  assert.equal(s.shown.at(-1), 37, 'the first cut is back, so nothing is skipped before it');
  s.session.undoLast();
  assert.deepEqual([s.session.at, s.session.view().checked, s.history.edit.cuts.length], [0, 0, 2]);
  s.session.putBack();
  s.session.leave();
  s.session.start();
  assert.equal(s.session.view().count, 'Cut 1 of 1', 'gone from the count once review stopped');
});

test('nothing to review: start says so by returning false', () => {
  assert.equal(setup({ magic: false }).session.start(), false);
});

test('outcomes after ⌫ read restored, so the trace learns it too', () => {
  const s = setup();
  s.session.start();
  s.session.putBack();
  assert.equal(outcomes(s.trace().runs[0], s.history.edit.cuts, [1])[0].kind, 'restored');
});
