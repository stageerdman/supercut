// The notes lane in the timeline (timeline.js + note-view.js), against the fake DOM: design/notes.md, "The lane".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, px, z } from './fake-dom.mjs';
import { NOTES, TRACK } from '../src/ui/waveform-view.js';
import { MAX_PPS as P, PAD } from '../src/ui/timeline-geometry.js';
import { noteName, peekLines } from '../src/ui/note-view.js';

const note = (id, s, e = s, more = {}) => ({ id, part: 1, s, e, text: '', color: 'yellow', by: 'you', done: false, ...more });

async function rig(notes, { showDone = false } = {}) {
  globalThis.document = makeDocument();
  const { createTimeline, HEIGHT } = await import('../src/ui/timeline.js');
  const root = document.createElement('div');
  const calls = { seek: [], note: [], noteMenu: [], menu: [] };
  const state = { notes, showDone };
  const timeline = createTimeline(root, {
    parts: () => [{ id: 1, name: 'take.mov', duration: 20 }], cuts: () => [], words: () => [], waveform: () => undefined,
    lengths: () => ({ 1: 20 }), playhead: () => ({ i: 0, t: 0 }), current: () => 0, max: 1,
    onSeek: (i, t) => calls.seek.push([i, t]), onLive() {}, onCommit() {}, onToggle() {}, onRemove() {}, onDragStart() {},
    notes: () => state.notes, showDone: () => state.showDone,
    onNote: (id, o) => calls.note.push([id, o]), onNoteMenu: (id) => calls.noteMenu.push(id), onMenu: (at, where) => calls.menu.push(where),
  });
  timeline.zoomTo(1);
  const content = root.children[0];
  const lane = () => content.querySelector('[data-notes="0"]');
  return { timeline, content, calls, state, HEIGHT, lane, item: (id) => lane().querySelector(`[data-note="${id}"]`) };
}
const done = () => delete globalThis.document;

test('lane: a row of its own 4 pt under the track, 20 pt tall, there even with no notes; the timeline is 176 tall', async () => {
  const t = await rig([]);
  assert.equal(t.HEIGHT, 176);
  assert.equal(NOTES.top, TRACK.top + TRACK.h + 4);
  const l = t.lane();
  assert.equal(px(l, 'top'), NOTES.top);
  assert.equal(px(l, 'height'), 20);
  assert.equal(l.attrs.role, 'group');
  assert.equal(l.attrs['aria-label'], 'Notes, part 1, 0 open');
  assert.equal(l.children.length, 0, 'empty: just space');
  const kids = t.content.children;
  assert.ok(kids.indexOf(l) > kids.indexOf(t.content.querySelector('[data-lane="0"]')), 'after the pauses in Tab order');
  done();
});

test('lane: each open note is a named button at its time; done notes are hidden unless shown', async () => {
  const t = await rig([note('a', 2, 2, { text: 'too tight' }), note('b', 5, 8, { by: 'magic' }), note('c', 10, 10, { done: true })]);
  assert.equal(t.lane().attrs['aria-label'], 'Notes, part 1, 2 open');
  const a = t.item('a');
  assert.equal(a.attrs.role, 'button');
  assert.equal(a.tabIndex, 0);
  assert.equal(a.attrs['aria-label'], 'Note at 00:02: too tight. Return opens.');
  assert.equal(px(a, 'left') + px(a, 'width') / 2, 2 * P, 'centred on its time');
  assert.equal(t.item('b').attrs['aria-label'], 'Empty note from 00:05 to 00:08, by Magic. Return opens.');
  assert.equal(t.item('c'), null);
  t.state.showDone = true;
  t.timeline.paintNotes();
  assert.ok(t.item('c'), 'Show done notes');
  assert.match(t.item('c').attrs['aria-label'], /^Done note at 00:10/);
  done();
});

test('lane: click a note opens it (focused), with no seek and no selection; Return does the same', async () => {
  const t = await rig([note('a', 2)]);
  const a = t.item('a');
  t.content.fire('pointerdown', { target: a, clientX: PAD + 2 * P, clientY: NOTES.top + 8 });
  t.content.fire('pointerup', { target: a });
  assert.deepEqual(t.calls.note, [['a', { focus: true }]]);
  assert.equal(t.calls.seek.length, 0);
  assert.equal(t.timeline.selection, null);
  const ev = t.item('a').fire('keydown', { key: 'Enter' });
  assert.equal(t.calls.note.length, 2);
  assert.ok(ev.defaultPrevented);
  done();
});

test('lane: the current note has the ring; focus stays on a note through a repaint', async () => {
  const t = await rig([note('a', 2), note('b', 6)]);
  t.timeline.setNote('a');
  assert.ok(t.item('a').querySelector('[data-mark]').classes.has('ring-accent'));
  assert.ok(!t.item('b').querySelector('[data-mark]').classes.has('ring-accent'));
  t.item('b').focus();
  t.timeline.paintCuts();
  assert.equal(document.activeElement, t.item('b'));
  done();
});

test('lane: right-click a note → its menu; elsewhere → the menu with the time (lane or not), even with no selection', async () => {
  const t = await rig([note('a', 2)]);
  t.content.fire('contextmenu', { target: t.item('a'), clientX: PAD + 2 * P, clientY: NOTES.top + 8 });
  assert.deepEqual(t.calls.noteMenu, ['a']);
  t.content.fire('contextmenu', { target: t.lane(), clientX: PAD + 4 * P, clientY: NOTES.top + 8 });
  assert.equal(t.calls.menu.length, 1);
  assert.deepEqual(t.calls.menu[0], { part: 1, t: 4, lane: true });
  t.content.fire('contextmenu', { target: t.content, clientX: PAD + 4 * P, clientY: TRACK.top + 8 });
  assert.equal(t.calls.menu[1].lane, false);
  done();
});

test('lane: a click on a cluster zooms in until its notes separate', async () => {
  const t = await rig([note('a', 2), note('b', 2.3), note('c', 2.6)]);
  t.timeline.zoomTo(0);
  const cl = t.lane().querySelector('[data-cluster]');
  assert.ok(cl, 'fit to 800 pt: 20 s at ~38 pt/s → the three merge');
  assert.equal(cl.textContent, '3');
  t.content.fire('pointerdown', { target: cl, clientX: 0, clientY: NOTES.top + 8 });
  t.content.fire('pointerup', { target: cl });
  assert.ok(t.timeline.zoom > 0);
  assert.equal(t.lane().querySelector('[data-cluster]'), null, 'they separate');
  assert.equal(t.lane().querySelectorAll('[data-note]').length, 3);
  t.timeline.render(); // ends the zoom's settle timer before the fake document goes
  done();
});

test('lane: moments sit above sections', async () => {
  const t = await rig([note('long', 1, 10), note('m', 3)]);
  assert.ok(z(t.item('m')) > z(t.item('long')));
  done();
});

test('noteName and peekLines: what a note says', () => {
  assert.equal(noteName(note('a', 72, 72, { text: 'Two good takes', by: 'magic' })), 'Note at 01:12, by Magic: Two good takes. Return opens.');
  assert.equal(noteName(note('a', 72)), 'Empty note at 01:12. Return opens.');
  assert.equal(noteName(note('a', 72, 100, { text: 'x' })), 'Note from 01:12 to 01:40: x. Return opens.');
  assert.deepEqual(peekLines(note('a', 72)), { text: 'Empty note', empty: true, when: '01:12' });
  assert.deepEqual(peekLines(note('a', 72, 100, { text: 'hm', by: 'magic' })), { text: 'hm', empty: false, when: '01:12 – 01:40 · 28 s · ✦ Magic' });
});
