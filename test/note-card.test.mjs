// The note card (note-card.js) and the note gestures (note-control.js) against the fake DOM: design/notes.md,
// "The card", "Making a note", "The way back".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { createHistory } from '../src/ui/history.js';
import { emptyEdit, notesOf } from '../src/ui/edit.js';

const note = (id, s, e = s, more = {}) => ({ id, part: 'a', s, e, text: '', color: 'yellow', by: 'you', done: false, ...more });
const key = (node, k, more = {}) => node.fire('keydown', { key: k, ...more });

async function cardRig(more = {}) {
  globalThis.document = makeDocument();
  const { createNoteCard, cardLeft, CARD_W } = await import('../src/ui/note-card.js');
  const host = document.createElement('div');
  document.body.append(host);
  const calls = [];
  const rec = (k) => (...a) => calls.push([k, ...a]);
  const card = createNoteCard(host, {
    onSave: rec('save'), onColor: rec('color'), onDone: rec('done'), onReopen: rec('reopen'), onDelete: rec('delete'),
    onPlay: rec('play'), onClosed: rec('closed'), ...more,
  });
  const btn = (label) => card.el.all().find((n) => n.attrs['aria-label'] === label);
  return { card, host, calls, btn, cardLeft, CARD_W, doneBtn: () => card.el.all().filter((n) => n.tag === 'button').at(-1) };
}

test('card: opens over the note, focused when asked, with its time and colour', async () => {
  const { card, calls } = await cardRig();
  const before = document.createElement('button');
  document.body.append(before);
  before.focus();
  card.open(note('n1', 72, 72, { text: 'fix' }), { x: 400, focus: true });
  assert.ok(card.isOpen);
  assert.equal(card.id, 'n1');
  assert.ok(!card.el.classes.has('hidden'));
  assert.equal(card.el.attrs.role, 'dialog');
  assert.equal(card.el.attrs['aria-label'], 'Note at 01:12');
  assert.equal(card.text.value, 'fix');
  assert.equal(document.activeElement, card.text);
  assert.equal(card.el.querySelector('[data-color="yellow"]').attrs['aria-checked'], 'true');
  key(card.text, 'Escape');
  assert.ok(!card.isOpen);
  assert.equal(document.activeElement, before, 'focus goes back where it was');
  assert.deepEqual(calls, [['closed', 'n1']], 'no change, no save');
  delete globalThis.document;
});

test('card: placement is centred on the note and kept 8 pt inside the player', async () => {
  const { cardLeft, CARD_W } = await cardRig();
  assert.equal(CARD_W, 280);
  assert.equal(cardLeft(400, 800), 260);
  assert.equal(cardLeft(10, 800), 8);
  assert.equal(cardLeft(790, 800), 800 - 280 - 8);
  delete globalThis.document;
});

test('card: Return saves and closes, ⇧Return is a new line, the text is saved trimmed and only if it changed', async () => {
  const { card, calls } = await cardRig();
  card.open(note('n1', 5), { focus: true });
  card.text.value = 'a';
  const shift = key(card.text, 'Enter', { shiftKey: true });
  assert.ok(card.isOpen, '⇧Return keeps it open');
  assert.ok(!shift.defaultPrevented, 'the field adds the line itself');
  card.text.value = '  check this  ';
  key(card.text, 'Enter');
  assert.ok(!card.isOpen);
  assert.deepEqual(calls[0], ['save', 'n1', 'check this']);
  calls.length = 0;
  card.open(note('n1', 5, 5, { text: 'check this' }), { focus: true });
  key(card.text, 'Enter');
  assert.ok(!calls.some((c) => c[0] === 'save'), 'unchanged: no undo step');
  delete globalThis.document;
});

test('card: Esc, ✕ and a click outside keep the text; a click in the timeline (keepOpen) leaves it open', async () => {
  const timelineBox = { contains: () => false };
  const { card, calls, btn } = await cardRig({ keepOpen: (t) => t === timelineBox.node });
  const out = document.createElement('div');
  const tl = document.createElement('div');
  timelineBox.node = tl;
  document.body.append(out, tl);
  card.open(note('n1', 5), { focus: true });
  card.text.value = 'one';
  key(card.text, 'Escape');
  card.open(note('n2', 6), { focus: true });
  card.text.value = 'two';
  btn('Close note').click();
  card.open(note('n3', 7), { focus: true });
  card.text.value = 'three';
  tl.fire('pointerdown');
  assert.ok(card.isOpen, 'the timeline keeps it open');
  out.fire('pointerdown');
  assert.ok(!card.isOpen);
  assert.deepEqual(calls.filter((c) => c[0] === 'save'), [['save', 'n1', 'one'], ['save', 'n2', 'two'], ['save', 'n3', 'three']]);
  delete globalThis.document;
});

test('card: Space in an empty field closes and plays; with text it is a space', async () => {
  const { card, calls } = await cardRig();
  card.open(note('n1', 5), { focus: true });
  key(card.text, ' ');
  assert.ok(!card.isOpen);
  assert.deepEqual(calls.map((c) => c[0]), ['closed', 'play']);
  calls.length = 0;
  card.open(note('n1', 5), { focus: true });
  card.text.value = 'a';
  const e = key(card.text, ' ');
  assert.ok(card.isOpen);
  assert.ok(!e.defaultPrevented, 'the field types the space');
  assert.ok(!calls.some((c) => c[0] === 'play'));
  delete globalThis.document;
});

test('card: ⌘Return is Done, ⌘⌫ is Delete, keys typed in the field reach no app shortcut', async () => {
  const { card, calls } = await cardRig();
  let app = 0;
  document.addEventListener('keydown', () => app++);
  card.open(note('n1', 5), { focus: true });
  card.text.value = 'x';
  key(card.text, 'Enter', { metaKey: true });
  assert.ok(!card.isOpen);
  assert.deepEqual(calls.filter((c) => c[0] !== 'closed'), [['save', 'n1', 'x'], ['done', 'n1']]);
  calls.length = 0;
  card.open(note('n2', 6), { focus: true });
  card.text.value = 'gone anyway';
  key(card.text, 'Backspace', { metaKey: true });
  assert.deepEqual(calls.filter((c) => c[0] !== 'closed'), [['delete', 'n2']], 'deleting saves nothing');
  card.open(note('n3', 7), { focus: true });
  key(card.text, 'm');
  key(card.text, 'z', { metaKey: true });
  assert.equal(app, 0, 'M, ⌘Z and ⌘Return don\'t leave the field');
  delete globalThis.document;
});

test('card: a swatch changes the colour at once; arrows move between swatches; a done note offers Reopen', async () => {
  const { card, calls, doneBtn } = await cardRig();
  card.open(note('n1', 5), {});
  const done = doneBtn();
  assert.equal(done.attrs['aria-label'], 'Mark note done');
  assert.equal(done.title, 'Done (⌘Return)');
  assert.ok(done.classes.has('rounded-full'), 'a round button');
  assert.match(done.style.cssText, /#34C759/, 'green');
  const blue = card.el.querySelector('[data-color="blue"]');
  blue.click();
  assert.deepEqual(calls.at(-1), ['color', 'n1', 'blue']);
  assert.equal(blue.attrs['aria-checked'], 'true');
  assert.equal(blue.tabIndex, 0);
  key(blue, 'ArrowRight');
  assert.deepEqual(calls.at(-1), ['color', 'n1', 'violet']);
  assert.equal(document.activeElement, card.el.querySelector('[data-color="violet"]'));
  assert.equal(card.el.querySelector('[role=radiogroup]').attrs['aria-label'], 'Colour');
  assert.equal(card.el.querySelectorAll('[data-color]').length, 5);
  card.el.querySelector('[data-color="red"]').click();
  assert.deepEqual(calls.at(-1), ['color', 'n1', 'red']);
  assert.equal(card.el.querySelector('[data-color="red"]').attrs['aria-label'], 'Red');
  card.close();
  card.open(note('n2', 5, 9, { done: true }), {});
  assert.equal(doneBtn().attrs['aria-label'], 'Reopen note');
  assert.equal(doneBtn().textContent, '', 'only the check, no words');
  assert.equal(card.el.attrs['aria-label'], 'Note from 00:05 to 00:09');
  doneBtn().click();
  assert.deepEqual(calls.at(-1), ['reopen', 'n2']);
  delete globalThis.document;
});

test('card: sync shows the note as it is now and keeps what you typed', async () => {
  const { card } = await cardRig();
  card.open(note('n1', 5, 5, { text: 'old' }), {});
  card.sync(note('n1', 5, 5, { text: 'new', color: 'teal' }));
  assert.equal(card.text.value, 'new');
  assert.equal(card.el.querySelector('[data-color="teal"]').attrs['aria-checked'], 'true');
  card.text.value = 'typing';
  card.sync(note('n1', 5, 5, { text: 'other' }));
  assert.equal(card.text.value, 'typing');
  delete globalThis.document;
});

test('menus: Add Note on a selection, Add Note Here on nothing, Show / Hide Done Notes in the lane, a note\'s own', async () => {
  const { menuFor, noteMenu } = await import('../src/ui/context-menu.js');
  const ids = (items) => items.map((i) => i.id ?? '—');
  assert.deepEqual(ids(menuFor(null, { notes: true })), ['addNote']);
  assert.equal(menuFor(null, { notes: true })[0].text, 'Add Note Here');
  assert.deepEqual(ids(menuFor({ part: 1, s: 1, e: 2 }, { words: true, notes: true })), ['write', 'toggle', '—', 'removeText', '—', 'addNote']);
  assert.equal(menuFor({ part: 1, s: 1, e: 2 }, { notes: true }).at(-1).text, 'Add Note');
  assert.deepEqual(menuFor(null, { notes: true, lane: true }).map((i) => i.text), ['Add Note Here', 'Show Done Notes']);
  assert.equal(menuFor(null, { notes: true, lane: true, showDone: true })[1].text, 'Hide Done Notes');
  assert.deepEqual(menuFor(null), [], 'without notes: as before');
  assert.deepEqual(noteMenu(note('n', 1)).map((i) => i.text), ['Done', 'Delete Note']);
  assert.deepEqual(noteMenu(note('n', 1, 1, { done: true })).map((i) => i.text), ['Reopen', 'Delete Note']);
});

// ---------- the gestures (note-control.js) ----------

async function rig({ playing = false, time = 10, current = 0, notes = [], cuts = [], storage = {} } = {}) {
  const c = await cardRig();
  const { createNoteControl, chipText } = await import('../src/ui/note-control.js');
  const history = createHistory({ ...emptyEdit(), notes, cuts });
  const log = { flash: [], seek: [], pop: [], ring: [] };
  const player = { playing, time, current };
  const timeline = {
    selection: null, currentNote: null,
    clearSelection() { this.selection = null; },
    paintNotes() {}, render() {}, reveal() {}, setNote(id) { this.currentNote = id; log.ring.push(id); },
    noteX: () => 300, pop: (id) => log.pop.push(id),
  };
  const chip = document.createElement('button');
  const store = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; } };
  const control = createNoteControl({
    history, commit: (edit, label) => history.push(edit, label), timeline, card: c.card, player,
    status: { flash: (t, ms) => log.flash.push([t, ms]) },
    parts: () => [{ id: 'a' }, { id: 'b' }], cuts: () => history.edit.cuts, lengths: () => ({ a: 100, b: 100 }),
    seek: (i, t) => { log.seek.push([i, t]); player.current = i; player.time = t; }, chip, storage: store,
  });
  return { ...c, control, history, log, player, timeline, chip, storage, chipText, list: () => notesOf(history.edit) };
}

test('M while playing: one note at the playhead, still playing, no card, a short line', async () => {
  const r = await rig({ playing: true, storage: { 'magiccut.notes.seen': '1' } });
  const n = r.control.add();
  assert.equal(r.list().length, 1);
  assert.deepEqual([n.part, n.s, n.e], ['a', 10, 10]);
  assert.ok(!r.card.isOpen);
  assert.deepEqual(r.log.flash, [['Note added · ⌘Z undoes', 2000]]);
  assert.deepEqual(r.log.pop, [n.id]);
  assert.equal(r.history.undo() && notesOf(r.history.edit).length, 0, 'one undo step');
  delete globalThis.document;
});

test('M while paused: the card opens with the cursor in it; no seek', async () => {
  const r = await rig({ storage: { 'magiccut.notes.seen': '1' } });
  const n = r.control.add();
  assert.ok(r.card.isOpen);
  assert.equal(r.card.id, n.id);
  assert.equal(document.activeElement, r.card.text);
  assert.deepEqual(r.log.seek, []);
  assert.deepEqual(r.log.flash, [], 'the open card says it');
  delete globalThis.document;
});

test('M twice within 0.5 s: still one note; paused, the second M opens it', async () => {
  const r = await rig({ playing: true, storage: { 'magiccut.notes.seen': '1' } });
  const n = r.control.add();
  r.player.time = 10.4;
  r.control.add();
  assert.equal(r.list().length, 1);
  assert.deepEqual(r.log.pop, [n.id, n.id]);
  r.player.playing = false;
  r.control.add();
  assert.equal(r.list().length, 1);
  assert.equal(r.card.id, n.id);
  delete globalThis.document;
});

test('M with words selected: a section note over them; the selection clears', async () => {
  const r = await rig({ storage: { 'magiccut.notes.seen': '1' } });
  r.timeline.selection = { part: 'b', s: 3, e: 7.5, words: true };
  const n = r.control.add();
  assert.deepEqual([n.part, n.s, n.e], ['b', 3, 7.5]);
  assert.equal(r.timeline.selection, null);
  assert.equal(r.history.undo().label, 'Noted 00:03–00:07');
  delete globalThis.document;
});

test('the first note ever gets the "only for you" line once, then the short one', async () => {
  const r = await rig({ playing: true });
  r.control.add();
  r.player.time = 30;
  r.control.add();
  assert.deepEqual(r.log.flash, [
    ['Note added. Notes are only for you, never in your video.', 6000],
    ['Note added · ⌘Z undoes', 2000],
  ]);
  assert.equal(r.storage['magiccut.notes.seen'], '1');
  delete globalThis.document;
});

test('Done: hidden, the count goes down, the line says what is left, ⌘Z brings it back and the card follows', async () => {
  const r = await rig({ notes: [note('n1', 5), note('n2', 20), note('n3', 40)] });
  r.control.paint();
  assert.equal(r.chip.textContent, '3 notes');
  r.control.open('n1', { focus: true });
  r.control.done('n1');
  assert.ok(!r.card.isOpen);
  assert.equal(r.list().find((n) => n.id === 'n1').done, true);
  assert.equal(r.chip.textContent, '2 notes');
  assert.deepEqual(r.log.flash.at(-1), ['Done · 2 notes left · ⌘Z undoes', 3000]);
  r.history.undo();
  r.control.afterUndo();
  assert.equal(r.chip.textContent, '3 notes');
  r.control.done('n2');
  r.control.done('n3');
  r.control.done('n1');
  assert.deepEqual(r.log.flash.at(-1), ['All notes done', 3000]);
  assert.ok(r.chip.classes.has('hidden'), 'no open notes: no chip');
  assert.equal(r.chipText(1), '1 note');
  delete globalThis.document;
});

test('Delete, from the card or a menu: one step, the line, and an open card for it closes', async () => {
  const r = await rig({ notes: [note('n1', 5)] });
  r.control.open('n1', {});
  r.control.remove('n1');
  assert.ok(!r.card.isOpen);
  assert.equal(r.list().length, 0);
  assert.deepEqual(r.log.flash.at(-1), ['Note deleted · ⌘Z undoes', 3000]);
  r.history.undo();
  assert.equal(notesOf(r.history.edit).length, 1);
  delete globalThis.document;
});

test('the card\'s text and colour become one undo step each', async () => {
  const r = await rig({ notes: [note('n1', 5)] });
  r.control.save('n1', 'retake');
  r.control.color('n1', 'blue');
  assert.deepEqual([r.list()[0].text, r.list()[0].color], ['retake', 'blue']);
  r.history.undo();
  assert.equal(r.list()[0].color, 'yellow');
  r.history.undo();
  assert.equal(r.list()[0].text, '');
  delete globalThis.document;
});

test('⌥→ visits open notes in play order across parts and wraps; ⌥← goes back; done notes are skipped', async () => {
  const r = await rig({ time: 0, notes: [note('n1', 5), note('x', 8, 8, { done: true }), note('n2', 50), { ...note('n3', 3), part: 'b' }] });
  const seen = [];
  for (let k = 0; k < 4; k++) { r.control.go(1); seen.push(r.card.id); }
  assert.deepEqual(seen, ['n1', 'n2', 'n3', 'n1']);
  r.control.go(-1);
  assert.equal(r.card.id, 'n3');
  r.control.go(-1);
  assert.equal(r.card.id, 'n2');
  delete globalThis.document;
});

test('going to a note: playhead at the pre-roll, ring on, card open without focus, play state unchanged', async () => {
  const r = await rig({ time: 0, playing: true, notes: [note('n1', 30)] });
  const focused = document.createElement('div');
  document.body.append(focused);
  focused.focus();
  r.control.go(1);
  assert.deepEqual(r.log.seek, [[0, 29]]);
  assert.deepEqual(r.log.ring, ['n1']);
  assert.ok(r.card.isOpen);
  assert.equal(document.activeElement, focused, 'Space and the arrows still work');
  assert.equal(r.player.playing, true);
  delete globalThis.document;
});

test('⌥→ goes on from the playhead once it has passed the current note', async () => {
  const r = await rig({ time: 0, notes: [note('n1', 5), note('n2', 20), note('n3', 60)] });
  r.control.go(1);
  assert.equal(r.card.id, 'n1');
  r.player.time = 40; // played on past n1 and n2
  r.control.go(1);
  assert.equal(r.card.id, 'n3');
  delete globalThis.document;
});

test('no open notes: ⌥→ says so', async () => {
  const r = await rig({ notes: [note('x', 8, 8, { done: true })] });
  r.control.go(1);
  assert.ok(!r.card.isOpen);
  assert.deepEqual(r.log.flash, [['No open notes', 2000]]);
  delete globalThis.document;
});

test('Show done notes: remembered, not an undo step; Reopen is one step "Reopened note"', async () => {
  const storage = {};
  const r = await rig({ notes: [note('x', 8, 8, { done: true, doneAt: 1 })], storage });
  assert.equal(r.control.showDone, false);
  const before = r.history.edit;
  r.control.toggleShowDone();
  assert.equal(r.control.showDone, true);
  assert.equal(storage['magiccut.notes.showDone'], '1');
  assert.equal(r.history.edit, before);
  r.control.reopen('x');
  assert.equal(r.list()[0].done, false);
  assert.equal(r.history.undo().label, 'Reopened note');
  assert.equal(r.list()[0].done, true);
  const again = await rig({ storage });
  assert.equal(again.control.showDone, true, 'kept across launches');
  delete globalThis.document;
});

test('undo removes the note under an open card: the card closes without saving', async () => {
  const r = await rig({ storage: { 'magiccut.notes.seen': '1' } });
  r.control.add();
  r.card.text.value = 'half typed';
  r.history.undo();
  r.control.afterUndo();
  assert.ok(!r.card.isOpen);
  assert.equal(r.list().length, 0);
  delete globalThis.document;
});
