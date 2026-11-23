// Cut review on the screen (review-control.js): keys, entering and leaving, following and framing the stop, the end
// line and edits mid-review, over the real session, history and trace with fake views. design/cut-review.md, "Keys".
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic } from '../src/ui/cuts.js';
import { emptyTrace, newRun, withRun } from '../src/ui/trace.js';
import { createHistory } from '../src/ui/history.js';
import { emptyEdit, notesOf } from '../src/ui/edit.js';
import { createWindowPlay } from '../src/ui/review-play.js';
import { createReviewSession } from '../src/ui/review-session.js';
import { createReviewControl, reviewKey, reviewButton } from '../src/ui/review-control.js';

const PARTS = [{ id: 1, duration: 60 }];
const prop = (s, e) => ({ line: 1, part: 1, from: 0, to: 0, s, e, reason: 'Filler', source: 'rule' });
const PROPOSALS = [prop(10, 11), prop(20, 21), prop(30, 31)];
const runOf = (id, cuts) => newRun({ cuts, notes: [], run: { lines: [], groups: [], answer: {} } }, { id, at: 1, before: [] });

function rig() {
  const history = createHistory({ ...emptyEdit(), cuts: withMagic([], PROPOSALS, { 1: 60 }) });
  let trace = withRun(emptyTrace(), runOf('run-1', PROPOSALS), [], [1]);
  const player = { playing: false, show() { this.playing = true; }, pause() { this.playing = false; }, play() { this.playing = true; } };
  const play = createWindowPlay(player, { parts: () => PARTS, cuts: () => history.edit.cuts });
  let n = 0;
  const said = [];
  const session = createReviewSession({
    edit: () => history.edit, commit: (e, l) => history.push(e, l), undo: () => history.undo(),
    trace: () => trace, setTrace: (t) => { trace = t; }, parts: () => PARTS, play, say: (t) => said.push(t), id: () => `n${++n}`,
  });
  const log = { bar: [], selected: [], revealed: [], framed: [], flashed: [], undos: 0, cardClosed: 0, toolbar: 0 };
  let control;
  const timeline = {
    selection: null,
    visible: true, // what inView answers
    select(s) { this.selection = s; log.selected.push(s); control?.selected(s); }, // the real timeline reports back
    reveal: (i, t) => log.revealed.push(t),
    frame: (r) => log.framed.push(r),
    inView() { return this.visible; },
  };
  control = createReviewControl({
    session,
    bar: { paint: (v) => log.bar.push(v) },
    timeline,
    transcript: { reveal: () => {} },
    cuts: () => history.edit.cuts,
    parts: () => PARTS,
    closeCard: () => log.cardClosed++,
    undo: () => log.undos++,
    flash: (t) => log.flashed.push(t),
    paint: () => log.toolbar++,
  });
  const key = (k, more = {}) => control.key({ key: k, target: { closest: () => null }, ...more });
  return { control, session, history, log, said, timeline, key, rerun: () => { trace = withRun(trace, runOf('run-2', PROPOSALS), history.edit.cuts, [1]); } };
}

test('keys: Y / Return, N / M, ⌫, R, Space, ↑ ↓, ⌘Z; no key leaves (Esc, ⌥→ keep their app meaning)', () => {
  const k = (key, more = {}) => reviewKey({ key, target: { closest: () => null }, ...more });
  assert.deepEqual(['y', 'Y', 'Enter', 'n', 'm', 'Backspace', 'r', ' ', 'ArrowDown', 'ArrowUp'].map((x) => k(x)),
    ['yes', 'yes', 'yes', 'no', 'no', 'putBack', 'replay', 'toggle', 'down', 'up']);
  assert.equal(k('Escape'), null, 'Esc never ends review');
  assert.equal(k('z', { metaKey: true }), 'undo');
  assert.equal(k('z', { metaKey: true, shiftKey: true }), null, '⇧⌘Z stays redo');
  assert.equal(k('ArrowRight', { altKey: true }), null);
  assert.equal(k('ArrowLeft'), null, '← → keep their meaning');
  assert.equal(reviewKey({ key: 'Enter', target: { closest: () => ({}) } }), null);
  assert.equal(reviewKey({ key: ' ', target: { closest: () => ({}) } }), 'toggle', 'Space never presses a bar button');
});

test('start drops the selection and the card, plays the first stop, rings its cut and frames it', () => {
  const r = rig();
  r.timeline.selection = { part: 1, s: 40, e: 42, words: true };
  assert.equal(r.control.start(), true);
  assert.equal(r.log.cardClosed, 1);
  assert.deepEqual(r.log.selected[0], null);
  assert.deepEqual(r.timeline.selection, { part: 1, s: 10, e: 11, cut: true });
  assert.equal(r.log.bar.at(-1).count, 'Cut 1 of 3');
  assert.equal(r.log.framed.length, 1);
  assert.deepEqual(r.log.framed[0], r.log.bar.at(-1).stretch);
  assert.equal(r.log.revealed.length, 0, 'framing, not paging');
});

test('Y with words selected never writes a word: it is a verdict, and the next cut is ringed and framed', () => {
  const r = rig();
  r.control.start();
  r.timeline.selection = { part: 1, s: 40, e: 42, words: true };
  const words = r.history.edit.words;
  assert.equal(r.key('y'), true);
  assert.equal(r.history.edit.words, words);
  assert.equal(r.session.at, 1);
  assert.deepEqual(r.timeline.selection, { part: 1, s: 20, e: 21, cut: true });
  assert.equal(r.log.framed.length, 2);
  r.key('ArrowDown');
  assert.equal(r.log.framed.length, 3, '↓ frames the next stop too');
});

test('Play replays and frames only when the stop was scrolled out of view; never a verdict', () => {
  const r = rig();
  r.control.start();
  r.control.play();
  assert.equal(r.log.framed.length, 1, 'in view: the zoom is left alone');
  assert.equal(r.session.at, 0);
  r.timeline.visible = false;
  r.key('r');
  assert.equal(r.log.framed.length, 2, 'scrolled away: brought back');
  assert.equal(r.session.at, 0);
});

test('an edit mid-review repaints the count but never frames or leaves', () => {
  const r = rig();
  r.control.start();
  const framed = r.log.framed.length;
  r.rerun();
  r.control.changed();
  assert.equal(r.control.on, true);
  assert.equal(r.log.framed.length, framed);
});

test('N makes one red note and moves on; ⌘Z takes it back to that stop; ⌘Z again is the usual undo', () => {
  const r = rig();
  r.control.start();
  r.key('n');
  assert.equal(notesOf(r.history.edit).length, 1);
  assert.equal(r.session.at, 1);
  r.key('z', { metaKey: true });
  assert.equal(notesOf(r.history.edit).length, 0);
  assert.equal(r.session.at, 0);
  r.key('z', { metaKey: true });
  assert.equal(r.log.undos, 1);
});

test('clicking another stop\'s cut makes it the current stop and frames it; our own ring does not', () => {
  const r = rig();
  r.control.start();
  const framed = r.log.framed.length;
  r.timeline.select({ part: 1, s: 30, e: 31, cut: true });
  assert.equal(r.session.at, 2);
  assert.equal(r.log.framed.length, framed + 1);
  r.timeline.select({ part: 1, s: 45, e: 46 });
  assert.equal(r.session.at, 2, 'not a stop: nothing changes');
});

test('the last verdict shows the end line and review stays on; Esc does nothing', () => {
  const r = rig();
  r.control.start();
  r.key('y'); r.key('n'); r.key('y');
  assert.equal(r.log.bar.at(-1).end, true);
  assert.equal(r.log.bar.at(-1).toFix, 1);
  assert.equal(r.control.on, true);
  assert.equal(r.key('Escape'), false);
  assert.equal(r.control.on, true);
});

test('Stop review leaves with progress said; starting again opens the first unchecked', () => {
  const r = rig();
  r.control.start();
  r.key('y');
  r.control.leave();
  assert.equal(r.control.on, false);
  assert.equal(r.log.bar.at(-1), null, 'the bar goes');
  assert.equal(r.said.at(-1), '1 of 3 checked · R to go on');
  r.control.start();
  assert.equal(r.session.at, 1, 'resume at the first unchecked');
});

test('which cuts: choosing a set frames its next stop', () => {
  const r = rig();
  r.control.start();
  const framed = r.log.framed.length;
  r.control.choose('magic');
  assert.equal(r.log.bar.at(-1).only, 'magic');
  assert.equal(r.log.framed.length, framed + 1);
});

test('the toolbar: Review cuts is the primary after a Magic run until all is checked; Stop review while on', () => {
  assert.deepEqual(reviewButton({ stops: 3, checked: 1, total: 3, magic: true }), { visible: true, label: 'Review cuts', primary: true });
  assert.deepEqual(reviewButton({ stops: 3, checked: 3, total: 3, magic: true }), { visible: true, label: 'Review cuts', primary: false });
  assert.deepEqual(reviewButton({ stops: 2, checked: 0, total: 2, magic: false }), { visible: true, label: 'Review cuts', primary: false });
  assert.equal(reviewButton({ stops: 0, checked: 0, total: 0, magic: false }).visible, false);
  assert.equal(reviewButton({ stops: 3, checked: 0, total: 3, magic: true }, { busy: true }).visible, false);
  assert.deepEqual(reviewButton({ stops: 3, checked: 0, total: 3, magic: true }, { on: true }), { visible: true, label: 'Stop review', primary: false });
  assert.deepEqual(reviewButton({ stops: 3, checked: 3, total: 3, magic: true }, { on: true, end: true }), { visible: true, label: 'Stop review', primary: true });
});
