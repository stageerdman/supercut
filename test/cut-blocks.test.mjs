// Cuts as blocks (design/timeline-words-by-zoom.md, Cut blocks): the block itself (cut-view.js), its layer over the
// strip and the track (timeline.js, against a small fake DOM), and ⌫ toggling the same spot (selection.js), the way
// main.js wires it: toggleSelection → commit → keptSelection; ⌘Z keeps the spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutView, MIN_W, HIT_W, LABEL_W } from '../src/ui/cut-view.js';
import { toggleSelection, keptSelection } from '../src/ui/selection.js';
import { createHistory } from '../src/ui/history.js';
import { isCut, cutsOf } from '../src/ui/cuts.js';
import { pauses } from '../src/ui/pauses.js';
import { STRIP, TRACK } from '../src/ui/waveform-view.js';
import { MAX_PPS as P, PAD } from '../src/ui/timeline-geometry.js';

const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });
const magic = (s, e, reason = 'earlier take', part = 1) => ({ part, s, e, by: 'magic', reason });

import { makeDocument, px, z } from './fake-dom.mjs';

// ---------- cut-view.js: the block ----------

test('cut block: base, hatch and border in its owner colour; length label from 40 pt; never under 2 pt; 12 pt hit area', () => {
  globalThis.document = makeDocument();
  const label = (n) => n.children.find((c) => c.tag === 'span');
  const wide = cutView(magic(2, 4.4), { left: 20, width: LABEL_W, selected: true, index: 3 });
  assert.match(wide.style.cssText, /255 106 61/, 'Magic: coral border');
  assert.match(wide.style.cssText, /23 24 27 \/ 0.72/, 'the dimming base');
  assert.match(wide.children[0].style.cssText, /repeating-linear-gradient\(45deg, rgb\(255 106 61/, 'coral hatch');
  assert.ok(wide.classes.has('ring-accent'), 'selected');
  assert.equal(label(wide).textContent, '2.4 s');
  assert.ok(label(wide).classes.has('text-accent'));
  assert.equal(cutView(magic(2, 4.4), { left: 20, width: LABEL_W - 1, selected: false, index: 3 }).children.find((c) => c.tag === 'span'), undefined, 'no label at 39 pt');
  const mine = cutView(you(2, 4.4), { left: 20, width: 80, selected: false, index: 0 });
  assert.match(mine.style.cssText, /158 161 168/, 'yours: grey');
  assert.ok(label(mine).classes.has('text-text-secondary'));
  const thin = cutView(you(2, 2.05), { left: 20, width: 0.5, selected: false, index: 0 });
  assert.equal(px(thin, 'width'), MIN_W);
  const hit = thin.children.find((c) => c.dataset.hit != null);
  assert.ok(px(hit, 'width') >= HIT_W, 'a thin cut is still a 12 pt target');
  assert.equal(px(hit, 'left') + px(hit, 'width') / 2, MIN_W / 2, 'centred on the block');
  assert.equal(thin.children.filter((c) => c.attrs.role === 'slider').length, 0, 'too small to drag: zoom in');
  assert.equal(mine.children.filter((c) => c.attrs.role === 'slider').length, 2, 'edge handles with room');
  delete globalThis.document;
});

// ---------- timeline.js: the layer, click, ⌫ ⌫ ⌘Z ----------

// Words every 0.5 s with a long gap at 6.2…8 s (a pause) and one at 12.2…13.5 s.
const words = [];
for (let t = 0.1; t < 20; t += 0.5) if (!(t > 6 && t < 8) && !(t > 12 && t < 13.5)) words.push({ w: 'word', s: t, e: t + 0.4 });

async function rig(startCuts, speech) {
  globalThis.document = makeDocument();
  const { createTimeline } = await import('../src/ui/timeline.js');
  const root = document.createElement('div');
  const history = createHistory({ cuts: startCuts, words: { 1: words } });
  const seeks = [];
  const lens = () => ({ 1: 20 });
  const timeline = createTimeline(root, {
    parts: () => [{ id: 1, name: 'take.mov', duration: 20 }], cuts: () => history.edit.cuts, words: (id) => history.edit.words[id] ?? [],
    speech: () => speech, waveform: () => undefined, lengths: lens, playhead: () => ({ i: 0, t: 0 }), current: () => 0, max: 1,
    onSeek: (i, t) => seeks.push([i, t]), onLive() {}, onCommit() {}, onToggle() {}, onRemove() {}, onDragStart() {},
  });
  timeline.zoomTo(1); // 300 pt a second: the 2.4 s cut is a wide block
  const content = root.children[0];
  let spot = null;
  const app = {
    history, seeks, timeline, content,
    layer: () => content.querySelector('[data-layer="0"]'),
    lane: () => content.querySelector('[data-lane]'),
    frame: () => content.querySelector('[data-part]'),
    cutEls: () => app.layer().querySelectorAll('[data-cut]'),
    chip: () => content.children.find((n) => n.tag === 'button' && n.classes.has('z-[6]')),
    /** main.js cutSelection */
    backspace() {
      const sel = timeline.selection;
      const { cuts, label } = toggleSelection(history.edit.cuts, sel, history.edit.words[sel.part], lens());
      if (!label) return '';
      spot = keptSelection(sel, cuts);
      history.push({ ...history.edit, cuts }, label);
      timeline.paintCuts();
      timeline.select(spot);
      return label;
    },
    /** main.js undoRedo + selectionAfterUndo */
    undo() {
      history.undo();
      const sel = timeline.selection;
      const keep = spot && sel && Math.abs(sel.s - spot.s) < 1e-6 && Math.abs(sel.e - spot.e) < 1e-6;
      timeline.select(keep ? keptSelection(sel, history.edit.cuts) : null);
      timeline.paintCuts();
    },
  };
  return app;
}
const done = () => delete globalThis.document;

test('timeline: each cut is a block from the strip top to the track bottom, above the pauses', async () => {
  const t = await rig([magic(2, 4.4)]);
  const layer = t.layer();
  assert.equal(px(layer, 'top'), STRIP.top);
  assert.equal(px(layer, 'height'), TRACK.top + TRACK.h - STRIP.top);
  assert.equal(px(layer, 'height'), 96);
  assert.ok(z(layer) > 2, 'above the pause blocks (z 2) and the words canvas (z 1)');
  const [block] = t.cutEls();
  assert.ok(block.classes.has('inset-y-0'), 'the block fills the layer');
  assert.equal(px(block, 'left'), 2 * P);
  assert.ok(Math.abs(px(block, 'width') - 2.4 * P) < 1e-6);
  assert.ok(z(t.frame().children.find((c) => c.tag === 'span')) > z(layer), 'the part badge stays on top');
  done();
});

test('timeline: a pause all inside a cut makes no element (no Tab stop); one half inside still does', async () => {
  const ps = pauses(words, 20);
  const big = ps.find((p) => p.s > 5.5 && p.e < 8.5), other = ps.find((p) => p.s > 11.5 && p.e < 14);
  const t = await rig([you(big.s - 0.05, big.e + 0.05), you(other.s - 0.1, (other.s + other.e) / 2)]);
  const shown = t.lane().querySelectorAll('[data-pause]').map((n) => ps[+n.dataset.pause]);
  assert.ok(!shown.includes(big), 'covered: not made');
  assert.ok(shown.includes(other), 'half covered: still there, ⌫ cuts the rest');
  done();
});

test('timeline: pauses come from the audio speech runs, so talking the transcript missed is never a pause', async () => {
  // The audio hears talking all through 6…8 s (no words there) and is silent at 15…17 s (words there are made up).
  const speech = [{ s: 0.1, e: 14.9 }, { s: 17, e: 19.9 }];
  const t = await rig([], speech);
  const shown = t.lane().querySelectorAll('[data-pause]').map((n) => +n.dataset.pause);
  const ps = pauses(speech, 20);
  assert.equal(shown.length, ps.length, 'one block per silence between speech runs');
  assert.ok(!ps.some((p) => p.s < 8 && p.e > 6), 'no pause over the missed talking');
  assert.ok(ps.some((p) => p.s <= 15.1 && p.e >= 16.8), 'a pause where the audio is silent');
  done();
});

test('timeline: a transcript without speech runs (made before the detector) falls back to word gaps', async () => {
  const t = await rig([]);
  assert.equal(t.lane().querySelectorAll('[data-pause]').length, pauses(words, 20).length);
  done();
});

test('timeline: click a cut at strip height selects it; ⌫ restores and keeps the range; ⌫ again cuts it back; ⌘Z keeps it', async () => {
  const t = await rig([magic(2, 4.4)]);
  const inside = words.filter((w) => w.s > 2 && w.e < 4.4);
  const [block] = t.cutEls();
  // a click on its strip row (not the track): it selects the cut, not just a seek
  t.content.fire('pointerdown', { target: block, clientX: PAD + 2.5 * P, clientY: STRIP.top + 6 });
  t.content.fire('pointerup', { target: block });
  assert.deepEqual(t.timeline.selection, { part: 1, s: 2, e: 4.4, cut: true });
  assert.deepEqual(t.seeks.at(-1), [0, 2], 'playhead to its start');
  assert.equal(t.chip().textContent, 'Restore ⌫');
  t.cutEls()[0].focus(); // keyboard focus on the block (as a click or Tab gives it)

  // ⌫: restored, one step, the same range stays selected as a time range; focus stays in the timeline
  assert.equal(t.backspace(), 'Restored 2.4 s cut');
  assert.deepEqual(t.history.edit.cuts, []);
  assert.equal(t.cutEls().length, 0, 'the block is gone');
  assert.ok(inside.every((w) => !isCut(w, t.history.edit.cuts)), 'its words play again (the transcript reads the same cuts)');
  assert.deepEqual(t.timeline.selection, { part: 1, s: 2, e: 4.4 });
  assert.equal(t.chip().textContent, 'Cut ⌫');
  assert.equal(document.activeElement, t.frame(), 'focus on the part group');

  // ⌫ again: cut back, yours, selected as a cut
  assert.equal(t.backspace(), 'Cut 2.4 s');
  assert.deepEqual(t.history.edit.cuts, [you(2, 4.4)]);
  assert.ok(inside.every((w) => isCut(w, cutsOf(t.history.edit.cuts, 1))), 'its words are cut again');
  assert.deepEqual(t.timeline.selection, { part: 1, s: 2, e: 4.4, cut: true });
  assert.ok(t.cutEls()[0].classes.has('ring-accent'), 'the block is back, selected');
  assert.equal(t.chip().textContent, 'Restore ⌫');

  // ⌘Z: undoes that toggle; the range is still selected
  t.undo();
  assert.deepEqual(t.history.edit.cuts, []);
  assert.deepEqual(t.timeline.selection, { part: 1, s: 2, e: 4.4 });
  assert.equal(t.chip().textContent, 'Cut ⌫');
  t.undo();
  assert.deepEqual(t.history.edit.cuts, [magic(2, 4.4)], 'and back to Magic’s cut');
  assert.deepEqual(t.timeline.selection, { part: 1, s: 2, e: 4.4, cut: true });
  done();
});

test('timeline: a click on a cut in the track row selects it too; a drag from it selects time', async () => {
  const t = await rig([you(2, 4.4)]);
  const [block] = t.cutEls();
  t.content.fire('pointerdown', { target: block, clientX: PAD + 3 * P, clientY: TRACK.top + 30 });
  t.content.fire('pointerup', { target: block });
  assert.equal(t.timeline.selection.cut, true);
  const again = t.cutEls()[0]; // repainted
  t.content.fire('pointerdown', { target: again, clientX: PAD + 3 * P, clientY: TRACK.top + 30 });
  t.content.fire('pointermove', { target: block, clientX: PAD + 3 * P + 60 });
  t.content.fire('pointerup', { target: block });
  assert.equal(t.timeline.selection.cut, undefined, 'a time selection');
  assert.ok(Math.abs(t.timeline.selection.s - 3) < 0.11, 'from where you pressed');
  done();
});

// ---------- selection.js: what stays selected ----------

test('keptSelection: a cut or range keeps its ends (a cut when one cut spans it exactly); words and pauses clear', () => {
  const r = { part: 1, s: 2, e: 4 };
  assert.deepEqual(keptSelection({ ...r, cut: true }, []), r);
  assert.deepEqual(keptSelection(r, [you(2, 4)]), { ...r, cut: true });
  assert.deepEqual(keptSelection(r, [you(1, 4)]), r, 'merged into a bigger cut: a range (⌫ restores just it)');
  assert.deepEqual(keptSelection(r, [you(2, 4, 2)]), r, 'other parts don’t count');
  assert.equal(keptSelection({ ...r, words: true }, []), null);
  assert.equal(keptSelection({ ...r, pause: true }, []), null);
  assert.equal(keptSelection(null, []), null);
});
