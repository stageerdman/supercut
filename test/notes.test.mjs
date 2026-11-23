// The note model (design/notes.md, Phase 1 of updates/2026-11-22 NOTES - OPEN), run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addNote, noteAt, editNote, setDone, deleteNote, openNotes, nextOpen, preRoll, withMagicNotes,
} from '../src/ui/notes.js';
import { emptyEdit, withoutPart, renamePart, notesOf } from '../src/ui/edit.js';
import { createHistory, changed } from '../src/ui/history.js';
import { toggleRange, moveEdge, withMagic } from '../src/ui/cuts.js';
import { wordSelection } from '../src/ui/selection.js';

const counter = () => { let n = 0; return () => `n${++n}`; };
const note = (id, s, e = s, more = {}) => ({ id, part: 1, s, e, text: '', color: 'yellow', by: 'you', done: false, ...more });
const withNotes = (notes, more = {}) => ({ ...emptyEdit(), notes, ...more });
const W = [{ w: 'so', s: 0.2, e: 0.4 }, { w: 'um', s: 0.6, e: 0.9 }, { w: 'well', s: 1.1, e: 1.4 }, { w: 'yes', s: 1.6, e: 2 }];

// ---------- making ----------

test('addNote with no selection: a moment note at the playhead, yours, yellow, empty, a fresh id', () => {
  const { edit, note: n, label } = addNote(emptyEdit(), null, { part: 1, t: 12 }, { id: counter() });
  assert.deepEqual(n, note('n1', 12));
  assert.deepEqual(edit.notes, [n]);
  assert.equal(label, 'Added note');
  const a = addNote(emptyEdit(), null, { part: 1, t: 1 }).note, b = addNote(emptyEdit(), null, { part: 1, t: 9 }).note;
  assert.ok(typeof a.id === 'string' && a.id !== b.id, 'default ids are unique');
});

test('addNote over words spans their own starts and ends (not the pause midpoints a cut uses)', () => {
  const { note: n, label } = addNote(emptyEdit(), wordSelection(1, W, 1, 2), { part: 1, t: 0 }, { id: counter() });
  assert.deepEqual([n.s, n.e], [0.6, 1.4]);
  const long = addNote(emptyEdit(), { part: 1, s: 72.3, e: 100.4, words: true }, { part: 1, t: 0 });
  assert.equal(long.label, 'Noted 01:12–01:40');
  assert.match(label, /^Noted /);
});

test('addNote over a selected cut: the cut\'s range, with about = the cut', () => {
  const e = { ...emptyEdit(), cuts: [{ part: 1, s: 2, e: 3, by: 'magic', reason: 'fumble' }] };
  const { note: n } = addNote(e, { part: 1, s: 2, e: 3, cut: true }, { part: 1, t: 0 }, { id: counter() });
  assert.deepEqual(n, note('n1', 2, 3, { about: { s: 2, e: 3, by: 'magic' } }));
});

test('noteAt finds an open moment note within 0.5 s; addNote there makes no twin', () => {
  const m = note('m', 5), done = note('d', 20, 20, { done: true, doneAt: 1 }), sec = note('s', 30, 40);
  const notes = [m, done, sec];
  assert.equal(noteAt(notes, 1, 5.4), m);
  assert.equal(noteAt(notes, 1, 4.5), m);
  assert.equal(noteAt(notes, 1, 5.6), null);
  assert.equal(noteAt(notes, 2, 5), null, 'other part');
  assert.equal(noteAt(notes, 1, 20), null, 'done notes don\'t count');
  assert.equal(noteAt(notes, 1, 30), null, 'section notes aren\'t moments');
  const e = withNotes(notes);
  const again = addNote(e, null, { part: 1, t: 5.3 });
  assert.equal(again.edit, e);
  assert.equal(again.note, m);
  assert.equal(again.label, '');
});

// ---------- changing ----------

test('editNote: text or colour, labelled; a Magic note becomes yours; no change is no step', () => {
  const e = withNotes([note('a', 5, 5, { by: 'magic', text: 'Listen?' })]);
  const t = editNote(e, 'a', { text: 'Too fast' });
  assert.deepEqual(t.edit.notes, [note('a', 5, 5, { text: 'Too fast' })]);
  assert.equal(t.label, 'Edited note');
  const c = editNote(e, 'a', { color: 'teal' });
  assert.equal(c.edit.notes[0].color, 'teal');
  assert.equal(c.edit.notes[0].by, 'you');
  assert.equal(c.label, 'Changed note colour');
  assert.equal(editNote(e, 'a', { text: 'Listen?' }).edit, e);
  assert.throws(() => editNote(e, 'a', { color: 'red' }), RangeError);
  assert.throws(() => editNote(e, 'nope', { text: 'x' }), RangeError);
});

test('setDone sets done and doneAt; undo restores both; reopening drops doneAt', () => {
  const h = createHistory(withNotes([note('a', 5)]));
  const { edit, label } = setDone(h.edit, 'a', true, 1000);
  assert.equal(label, 'Done: note');
  assert.deepEqual(edit.notes, [note('a', 5, 5, { done: true, doneAt: 1000 })]);
  assert.deepEqual(openNotes(edit.notes), []);
  h.push(edit, label);
  assert.equal(h.undo().label, 'Done: note');
  assert.deepEqual(h.edit.notes, [note('a', 5)]);
  h.redo();
  const re = setDone(h.edit, 'a', false);
  assert.equal(re.label, 'Reopened note');
  assert.deepEqual(re.edit.notes, [note('a', 5)]);
  assert.equal(setDone(re.edit, 'a', false).edit, re.edit, 'already open: no step');
});

test('deleteNote: a Magic note\'s spot goes to dismissed, your own leaves nothing behind', () => {
  const e = withNotes([note('m', 5, 8, { by: 'magic' }), note('y', 9)]);
  const m = deleteNote(e, 'm');
  assert.equal(m.label, 'Deleted note');
  assert.deepEqual(m.edit.notes.map((n) => n.id), ['y']);
  assert.deepEqual(m.edit.dismissed, [{ part: 1, s: 5, e: 8 }]);
  assert.deepEqual(deleteNote(e, 'y').edit.dismissed, []);
});

// ---------- the way back ----------

test('nextOpen walks open notes in play order across parts, wraps, skips done ones', () => {
  const order = [2, 1]; // part 2 plays first
  const a = { ...note('a', 10), part: 2 }, b = note('b', 1), c = note('c', 5, 5, { done: true }), d = note('d', 8);
  const notes = [d, c, b, a];
  const ids = (n) => n?.id;
  assert.equal(ids(nextOpen(notes, order, { part: 2, t: 0 })), 'a');
  assert.equal(ids(nextOpen(notes, order, { id: 'a' })), 'b');
  assert.equal(ids(nextOpen(notes, order, { id: 'b' })), 'd');
  assert.equal(ids(nextOpen(notes, order, { id: 'd' })), 'a', 'wraps at the end');
  assert.equal(ids(nextOpen(notes, order, { id: 'a' }, -1)), 'd', 'wraps at the start');
  assert.equal(ids(nextOpen(notes, order, { part: 1, t: 6 })), 'd');
  assert.equal(ids(nextOpen(notes, order, { part: 1, t: 6 }, -1)), 'b');
  assert.equal(ids(nextOpen(notes, order, { id: 'c', part: 1, t: 4 })), 'd', 'from a done note: by the playhead');
  assert.equal(ids(nextOpen(notes, order, { part: 1, t: 9 })), 'a');
  assert.equal(ids(nextOpen(notes, order, { part: 2, t: 0 }, -1)), 'd');
  assert.equal(nextOpen([c], order, { part: 1, t: 0 }), null, 'none open');
});

test('preRoll: 1 s of kept time before the note, skipping cuts, clamped to the first kept moment', () => {
  const cuts = [{ part: 1, s: 3, e: 4, by: 'you' }, { part: 2, s: 8, e: 9.5, by: 'you' }];
  assert.equal(preRoll(note('a', 10), cuts), 9);
  assert.equal(preRoll(note('a', 4.5), cuts), 2.5, 'the cut in between is skipped, not counted');
  assert.equal(preRoll(note('a', 3.5), cuts), 2, 'inside a cut: before the join');
  assert.equal(preRoll(note('a', 0.4), cuts), 0);
  assert.equal(preRoll(note('a', 2.5), [{ part: 1, s: 0, e: 2, by: 'you' }]), 2, 'the part\'s first kept moment');
});

// ---------- Magic ----------

test('withMagicNotes: old untouched Magic notes go, yours stay, dismissed and your open spots stay free', () => {
  const old = note('m1', 10, 10, { by: 'magic' }), open = note('y1', 20, 25), done = note('y2', 40, 40, { done: true });
  const e = withNotes([old, open, done], { dismissed: [{ part: 1, s: 60, e: 60 }] });
  const fresh = [100, 22, 60, 40, 5].map((s) => ({ part: 1, s, e: s, text: `at ${s}` }));
  const out = withMagicNotes(e, fresh, { order: [1], speech: 600, id: counter() });
  assert.deepEqual(out.notes, [open, done, ...[5, 40, 100].map((s, i) => note(`n${i + 1}`, s, s, { by: 'magic', text: `at ${s}` }))]);
  assert.equal(out.dismissed, e.dismissed);
});

test('withMagicNotes caps at 5 in time order and one per started 3 min of speech', () => {
  const fresh = [9, 3, 7, 1, 5, 8, 2, 6, 4].map((s) => ({ part: 1, s: s * 10, e: s * 10, text: '' }));
  const at = (speech) => withMagicNotes(emptyEdit(), fresh, { order: [1], speech }).notes.map((n) => n.s);
  assert.deepEqual(at(3600), [10, 20, 30, 40, 50]);
  assert.deepEqual(at(200), [10, 20]);
  assert.deepEqual(at(0), []);
});

// ---------- living in the edit ----------

test('cutting, restoring, moving an edge and Magic cuts leave the notes exactly as they were', () => {
  const e = withNotes([note('a', 1, 2)]);
  const cut = { ...e, cuts: toggleRange(e.cuts, { part: 1, s: 0, e: 3 }).cuts };
  const moved = { ...cut, cuts: moveEdge(cut.cuts, cut.cuts[0], 'e', 1.5) };
  const magic = { ...moved, cuts: withMagic(moved.cuts, [{ part: 1, s: 4, e: 5 }]) };
  const restored = { ...magic, cuts: toggleRange(magic.cuts, { part: 1, s: 0, e: 1.5 }).cuts };
  for (const x of [cut, moved, magic, restored]) assert.equal(x.notes, e.notes);
});

test('withoutPart / renamePart carry notes and dismissed; history brings them back', () => {
  const e = withNotes([note('a', 1), { ...note('b', 2), part: 2 }], { dismissed: [{ part: 1, s: 3, e: 3 }] });
  const gone = withoutPart(e, 1);
  assert.deepEqual(gone.notes.map((n) => n.id), ['b']);
  assert.deepEqual(gone.dismissed, []);
  const r = renamePart(e, 1, 5);
  assert.deepEqual(r.notes.map((n) => n.part), [5, 2]);
  assert.deepEqual(r.dismissed, [{ part: 5, s: 3, e: 3 }]);
  const h = createHistory(e);
  h.push(gone, 'Removed part 1');
  h.undo();
  h.rename(1, 7);
  assert.deepEqual(h.edit.notes.map((n) => n.part), [7, 2]);
});

test('changed() reports a changed note\'s range, for undo to bring into view', () => {
  const e = withNotes([note('a', 5)]);
  const added = addNote(e, { part: 1, s: 12, e: 14 }, { part: 1, t: 0 }).edit;
  assert.deepEqual(changed(e, added), { part: 1, s: 12, e: 14 });
  assert.deepEqual(changed(e, editNote(e, 'a', { text: 'x' }).edit), { part: 1, s: 5, e: 5 });
  assert.deepEqual(changed(e, setDone(e, 'a').edit), { part: 1, s: 5, e: 5 });
  assert.equal(changed(e, { ...e }), null);
});

test('notes save with the edit as plain JSON; an edit from before notes reads as none', () => {
  let e = addNote(emptyEdit(), null, { part: 1, t: 3 }).edit;
  e = deleteNote(withNotes([...e.notes, note('m', 9, 9, { by: 'magic', about: { s: 8, e: 10, by: 'you' } })]), 'm').edit;
  e = setDone(e, e.notes[0].id, true, 42).edit;
  assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
  const old = { cuts: [], words: {} };
  assert.deepEqual(notesOf(old), []);
  assert.equal(addNote(old, null, { part: 1, t: 1 }).edit.notes.length, 1);
  assert.deepEqual(withMagicNotes(old, [], { order: [1], speech: 60 }).notes, []);
});
