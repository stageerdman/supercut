// Notes: to-dos pinned to time, for the editor only (never in the video). They live in `edit.notes`, next to the cuts,
// so undo, redo and saving come with the edit. Notes belong to time: cutting, restoring and dragging never move them.
//   note = { id, part, s, e, text, color, by: 'you' | 'magic', done, doneAt?, about?: { s, e, by } }
//   s === e is a moment note, s < e a section note. `edit.dismissed` = [{ part, s, e }]: Magic notes you deleted.
// Pure, no DOM. Every change returns { edit, label } for the history; no change → the same edit and label ''.
// Rules: design/notes.md. Tested in test/notes.test.mjs.
import { clock } from './dom.js';
import { cutsOf } from './cuts.js';
import { cutHere, firstKept } from './playback.js';
import { notesOf, dismissedOf } from './edit.js';

export const NOTE_COLORS = ['yellow', 'blue', 'violet', 'teal'];
export const TWIN_SLACK = 0.5; // s: a press this close to an open moment note means that note (no twin)
export const PRE_ROLL = 1; // s of kept time played before a note you go to (people press M about half a second late)
export const MAGIC_MAX = 5; // notes per Magic run, at most
export const MAGIC_EVERY = 180; // s of speech per Magic note, at most

const EPS = 1e-6;
const near = (a, b) => Math.abs(a - b) < EPS;
const freshId = () => globalThis.crypto.randomUUID();
const isMoment = (n) => n.s === n.e;

function makeNote({ part, s, e, about }, { id, by = 'you', text = '' }) {
  const note = { id, part, s, e, text, color: 'yellow', by, done: false };
  return about ? { ...note, about } : note;
}

export const openNotes = (notes) => notes.filter((n) => !n.done);

/** The open moment note of that part nearest to t, within `slack` seconds, or null. */
export function noteAt(notes, part, t, slack = TWIN_SLACK) {
  let best = null;
  for (const n of openNotes(notes)) {
    const d = Math.abs(n.s - t);
    if (n.part === part && isMoment(n) && d <= slack + EPS && (!best || d < Math.abs(best.s - t))) best = n;
  }
  return best;
}

/**
 * Where a new note goes. A selection (words: their own starts and ends; a range as it is; a cut: its range, with
 * `about` = the cut) makes a section note, no selection a moment note at the playhead `at = { part, t }`.
 */
export function noteSpot(cuts, sel, at) {
  if (!sel) return { part: at.part, s: at.t, e: at.t };
  const { part, s, e } = sel;
  const cut = sel.cut && cutsOf(cuts, part).find((c) => near(c.s, s) && near(c.e, e));
  return cut ? { part, s, e, about: { s: cut.s, e: cut.e, by: cut.by } } : { part, s, e };
}

/**
 * M (or ⚑, or "Add note here"): a note over the selection, else at the playhead. Next to an open moment note there
 * is no twin: that note comes back with no change.
 * @returns {{edit: object, note: object, label: string}}  label: "Added note" / "Noted 01:12–01:40"
 */
export function addNote(edit, sel, at, { id = freshId() } = {}) {
  const spot = noteSpot(edit.cuts, sel, at);
  const twin = !sel && noteAt(notesOf(edit), spot.part, spot.s);
  if (twin) return { edit, note: twin, label: '' };
  const note = makeNote(spot, { id: id() });
  const label = isMoment(note) ? 'Added note' : `Noted ${clock(note.s)}–${clock(note.e)}`;
  return { edit: { ...edit, notes: [...notesOf(edit), note] }, note, label };
}

function noteById(edit, id) {
  const note = notesOf(edit).find((n) => n.id === id);
  if (!note) throw new RangeError(`notes: there is no note "${id}" in this edit`);
  return note;
}

/** Swap one note for its changed copy. Any touch makes a Magic note yours (as with cuts). */
const replaced = (edit, note, change) => ({
  ...edit,
  notes: notesOf(edit).map((n) => (n === note ? { ...n, ...change, by: 'you' } : n)),
});

/** The card changed the text or the colour. Label "Edited note" / "Changed note colour". */
export function editNote(edit, id, { text, color }) {
  const note = noteById(edit, id);
  if (color !== undefined && !NOTE_COLORS.includes(color)) throw new RangeError(`editNote: "${color}" is not a note colour`);
  if (text !== undefined && text !== note.text) return { edit: replaced(edit, note, { text }), label: 'Edited note' };
  if (color !== undefined && color !== note.color) return { edit: replaced(edit, note, { color }), label: 'Changed note colour' };
  return { edit, label: '' };
}

/** Done (hidden, kept, with `doneAt` for cut review) or reopened. Label "Done: note" / "Reopened note". */
export function setDone(edit, id, done = true, now = Date.now()) {
  const note = noteById(edit, id);
  if (note.done === done) return { edit, label: '' };
  if (done) return { edit: replaced(edit, note, { done, doneAt: now }), label: 'Done: note' };
  const { doneAt: _was, ...open } = note;
  return { edit: { ...replaced(edit, note, {}), notes: notesOf(edit).map((n) => (n === note ? { ...open, done, by: 'you' } : n)) }, label: 'Reopened note' };
}

/** Gone. A Magic note's spot is remembered, so the next Magic run doesn't put it back. Label "Deleted note". */
export function deleteNote(edit, id) {
  const note = noteById(edit, id);
  const notes = notesOf(edit).filter((n) => n !== note);
  const dismissed = note.by === 'magic' ? [...dismissedOf(edit), { part: note.part, s: note.s, e: note.e }] : dismissedOf(edit);
  return { edit: { ...edit, notes, dismissed }, label: 'Deleted note' };
}

/** Play order: by the part's place in `order` (part ids as they play), then by time. */
const byPlay = (order) => (a, b) => order.indexOf(a.part) - order.indexOf(b.part) || a.s - b.s || a.e - b.e;

/**
 * ⌥→ (dir 1) / ⌥← (dir -1): the next open note in play order, wrapping at both ends, or null when none is open.
 * `from` is the current note `{ id }` when there is one, else the playhead `{ part, t }` (a note right there is next).
 */
export function nextOpen(notes, order, from, dir = 1) {
  const list = openNotes(notes).filter((n) => order.includes(n.part)).sort(byPlay(order));
  if (!list.length) return null;
  const i = from.id === undefined ? -1 : list.findIndex((n) => n.id === from.id);
  if (i >= 0) return list[(i + dir + list.length) % list.length];
  const cmp = byPlay(order);
  const here = { part: from.part, s: from.t, e: from.t };
  if (dir > 0) return list.find((n) => cmp(n, here) >= -EPS) ?? list[0];
  return list.findLast((n) => cmp(n, here) < -EPS) ?? list.at(-1);
}

/**
 * Where going to a note puts the playhead: `lead` seconds of kept time before its start (a cut in between is skipped,
 * not counted; a note inside a cut counts from that cut's join), clamped to the part's first kept moment.
 */
export function preRoll(note, cuts, len = Infinity, lead = PRE_ROLL) {
  let t = cutHere(cuts, note.part, note.s)?.s ?? note.s;
  let left = lead;
  for (const c of cutsOf(cuts, note.part).reverse()) {
    if (c.e > t + EPS) continue;
    if (t - c.e >= left) break;
    left -= t - c.e;
    t = c.s;
  }
  return Math.max(t - left, firstKept(cuts, note.part, len) ?? 0);
}

const overlaps = (a, b) => a.part === b.part && a.s <= b.e + EPS && b.s <= a.e + EPS;

/**
 * A Magic run's notes `fresh = [{ part, s, e, text }]`: Magic's old untouched notes go, yours all stay (done ones too).
 * A new note over a spot you deleted or over one of your open notes is dropped. Then at most MAGIC_MAX in play order,
 * and one per started MAGIC_EVERY seconds of `speech`. Goes into the same "Magic Cut" step as the cuts.
 */
export function withMagicNotes(edit, fresh, { order, speech, id = freshId }) {
  const yours = notesOf(edit).filter((n) => n.by !== 'magic');
  const blocked = [...dismissedOf(edit), ...openNotes(yours)];
  const cap = Math.min(MAGIC_MAX, Math.ceil(speech / MAGIC_EVERY));
  const added = fresh
    .filter((f) => order.includes(f.part) && !blocked.some((b) => overlaps(b, f)))
    .sort(byPlay(order))
    .slice(0, cap)
    .map((f) => makeNote(f, { id: id(), by: 'magic', text: f.text }));
  return { ...edit, notes: [...yours, ...added] };
}
