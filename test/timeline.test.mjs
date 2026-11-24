// The timeline and playback: pure rules (playback.js, timeline-geometry.js, edge-drag.js, cut-view.js labels,
// waveform-view.js columns) and the player against a fake <video>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keptSpans, skipTarget, firstKept, editedTime, editedLength, cutHere } from '../src/ui/playback.js';
import { layout, fitPps, xAt, timeAt, anchoredScroll, bitFor, snap, snapTargets, tickStep, tickLabel, zoomScaled, zoomFor, pinchFactor, wheelFactor, PINCH_GAIN, PAD, GAP, MAX_PPS } from '../src/ui/timeline-geometry.js';
import { startEdgeDrag } from '../src/ui/edge-drag.js';
import { cutLabel, cutHover, edgeText, cutView, MIN_W } from '../src/ui/cut-view.js';
import { bars, ticks } from '../src/ui/waveform-view.js';
import { toggleRange, isCut } from '../src/ui/cuts.js';
import { pauses, pauseCut, MIN_PAUSE } from '../src/ui/pauses.js';
import { pauseView, pauseLabel } from '../src/ui/strip-view.js';
import { toggleSelection } from '../src/ui/selection.js';
import { FRAME } from '../src/ui/bit.js';
import { QUIET, SEEK_LAG } from '../src/ui/twin-sync.js';

const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });
const magic = (s, e, reason = 'earlier take', part = 1) => ({ part, s, e, by: 'magic', reason });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≈ ${b}`);
const two = [{ id: 1, duration: 10 }, { id: 2, duration: 5 }];

// ---------- playback.js ----------

test('keptSpans: what plays, in order, across two parts', () => {
  const cuts = [you(0, 1), you(4, 6), you(3, 5, 2)];
  assert.deepEqual(keptSpans(two, cuts), [
    { part: 1, s: 1, e: 4 }, { part: 1, s: 6, e: 10 },
    { part: 2, s: 0, e: 3 },
  ]);
  assert.deepEqual(keptSpans(two, []), [{ part: 1, s: 0, e: 10 }, { part: 2, s: 0, e: 5 }]);
});

test('skipTarget: a cut ahead → its end; to the part end → end; inside the one you chose → keep playing', () => {
  const cuts = [you(2, 3), you(8, 10)];
  assert.equal(skipTarget(1, 1.5, cuts, 10), null, 'nothing near');
  assert.deepEqual(skipTarget(1, 2 - FRAME / 2, cuts, 10), { t: 3 }, 'the next frame would be in the cut');
  assert.deepEqual(skipTarget(1, 2.5, cuts, 10), { t: 3 }, 'already inside');
  assert.deepEqual(skipTarget(1, 7.99, cuts, 10), { end: true }, 'cut to the end of the part');
  assert.equal(skipTarget(1, 2.5, cuts, 10, you(2, 3)), null, 'started inside it: it plays');
  assert.deepEqual(skipTarget(1, 7.99, cuts, 10, you(2, 3)), { end: true }, '…and the next one still skips');
  assert.equal(skipTarget(2, 2.5, cuts, 5), null, 'other parts are not touched');
});

test('firstKept: a part starts after a cut at 0; all cut → null', () => {
  assert.equal(firstKept([you(0, 2, 2)], 2, 5), 2);
  assert.equal(firstKept([magic(0, 1, 'x', 2), you(1, 2, 2)], 2, 5), 2, 'touching cuts chain');
  assert.equal(firstKept([you(0, 5, 2)], 2, 5), null);
  assert.equal(firstKept([], 2, 5), 0);
});

test('editedTime / editedLength: the finished video clock; inside a cut it is the join', () => {
  const cuts = [you(2, 4), you(0, 1, 2)];
  near(editedLength(two, cuts), 8 + 4);
  near(editedTime(two, cuts, 0, 1), 1);
  near(editedTime(two, cuts, 0, 3), 2, 'inside the cut: the join');
  near(editedTime(two, cuts, 0, 5), 3);
  near(editedTime(two, cuts, 1, 0.5), 8, 'part 2 inside its first cut');
  near(editedTime(two, cuts, 1, 3), 10);
  assert.equal(cutHere(cuts, 1, 3)?.s, 2);
});

// ---------- timeline-geometry.js ----------

test('geometry: time ↔ x round trip at several zooms, parts in order with a gap', () => {
  for (const pps of [0.5, 10, 120]) {
    const boxes = layout(two, pps);
    assert.equal(boxes[0].x, PAD);
    near(boxes[1].x, PAD + 10 * pps + GAP);
    for (const [i, t] of [[0, 0], [0, 7.25], [1, 3.5]]) {
      const hit = timeAt(boxes, xAt(boxes, i, t));
      assert.equal(hit.i, i);
      near(hit.t, t, `pps ${pps}`);
    }
  }
});

test('geometry: x is clamped to the part; a drag pins its part', () => {
  const boxes = layout(two, 10);
  assert.deepEqual(timeAt(boxes, 0), { i: 0, part: 1, t: 0 });
  assert.equal(timeAt(boxes, 1e6).t, 5);
  assert.deepEqual(timeAt(boxes, 1e6, 0), { i: 0, part: 1, t: 10 }, 'pinned to part 1');
});

test('geometry: fit fills the width; zoom anchored keeps the moment under the same point', () => {
  const pps = fitPps(two, 1000);
  const boxes = layout(two, pps);
  near(boxes[1].x + boxes[1].w + PAD, 1000);
  assert.ok(fitPps([{ id: 1, duration: 1 }], 1e6) <= MAX_PPS, 'never past the max');
  // the playhead at 12 pt on screen stays at 12 pt after zooming in
  const zoomed = layout(two, pps * 4);
  const scroll = anchoredScroll(12, xAt(zoomed, 0, 6));
  near(xAt(zoomed, 0, 6) - scroll, 12);
});

test('zoom: a pinch scales the view in proportion, the same at any length; ⌘-scroll too, one notch capped', () => {
  const ppsAt = (z, fit) => fit * (MAX_PPS / fit) ** z;
  for (const fit of [0.4, 12]) { // a 30-minute and a 1-minute recording
    const z1 = zoomScaled(0.2, pinchFactor(2.5), fit); // one full spread
    near(ppsAt(z1, fit) / ppsAt(0.2, fit), 2.5 ** PINCH_GAIN);
    near(zoomScaled(z1, pinchFactor(1 / 2.5), fit), 0.2, 'pinching back returns exactly');
  }
  assert.equal(zoomScaled(0.99, 10, 1), 1, 'clamped at the max');
  assert.equal(zoomScaled(0.01, 0.1, 1), 0, 'and at fit');
  assert.equal(zoomScaled(0.3, 2, MAX_PPS), 0.3, 'already at the max: nothing to zoom');
  assert.ok(wheelFactor(-10) > 1 && wheelFactor(10) < 1, 'up / spread zooms in');
  near(wheelFactor(-10) * wheelFactor(10), 1);
  near(wheelFactor(-1000), wheelFactor(-25), 'a mouse notch is capped');
  near(wheelFactor(-1, 1), wheelFactor(-16), 'lines count as 16 pt');
  // 20 small trackpad events (deltaY 5 each) zoom ×7: a real distance, not a nudge
  near(wheelFactor(-5) ** 20, Math.exp(2));
});

test('zoomFor: the stretch fills 80 % of the view, clamped to fit and MAX_PPS; a part gap counts', () => {
  const ppsAt = (z, fit) => fit * (MAX_PPS / fit) ** z;
  const fit = 0.8; // a 20-minute talk in ~1000 pt
  near(ppsAt(zoomFor(6, 1000, fit), fit) * 6, 800, 'a 6 s clip: 800 of 1000 pt');
  near(ppsAt(zoomFor(48, 1000, fit), fit) * 48, 800);
  assert.equal(zoomFor(2000, 1000, fit), 0, 'longer than fit: just fits');
  assert.equal(zoomFor(1, 1000, fit), 1, 'past MAX_PPS: clamped');
  near(ppsAt(zoomFor(6, 1000, fit, 1), fit) * 6 + GAP, 800, 'across two parts the gap is in the width');
  assert.equal(zoomFor(6, 1000, MAX_PPS), 0, 'a fit at the max: nothing to zoom');
});

test('play clock: glides between coarse readings, never steps back, takes seeks and part changes at once', async () => {
  const { createPlayClock } = await import('../src/ui/play-clock.js');
  const c = createPlayClock();
  assert.equal(c.read(10, 0), 10);
  // the video still says 10 s, 16 ms later: the line runs on
  near(c.read(10, 16), 10.016);
  near(c.read(10, 32), 10.032);
  // a reading a hair behind the estimate: the line holds, no step back
  const before = c.read(10, 48);
  assert.ok(c.read(10.04, 50) >= before);
  // 2× speed runs twice as fast
  const c2 = createPlayClock();
  c2.read(5, 0, { rate: 2 });
  near(c2.read(5, 50, { rate: 2 }), 5.1);
  // a stall: never more than 0.15 s past the last reading
  assert.ok(c.read(10.04, 5000) <= 10.19 + 1e-9);
  // a skipped cut: straight there
  assert.equal(c.read(20, 5016), 20);
  // a reading behind the line (a swap, a settling video), even far behind: held, never back
  assert.ok(c.read(19.8, 5032) >= 20);
  assert.ok(c.read(3, 5048) >= 20);
  // only a seek you make (reset) goes back
  c.reset();
  assert.equal(c.read(3, 5064), 3);
  // a new part starts at its own time
  assert.equal(c.read(0.5, 5048, { key: 1 }), 0.5);
  // paused: exactly the video's time
  assert.equal(c.read(7, 6000, { playing: false }), 7);
});

test('geometry: a bit is the time under 4 pt, never under a frame', () => {
  near(bitFor(4), 1);
  near(bitFor(40), 0.1);
  assert.equal(bitFor(10000), FRAME);
});

test('snap: nearest target within 8 pt; ⌥ moves free; no transcript → only playhead and ends', () => {
  const targets = snapTargets([{ s: 1, e: 1.4 }, { s: 1.5, e: 2 }], 10, 5);
  assert.equal(snap(1.44, targets, 100), 1.4, 'nearest of two within reach');
  assert.equal(snap(1.46, targets, 100), 1.5, 'nearest of two within reach');
  assert.equal(snap(1.2, targets, 100), 1.2, 'nothing within 8 pt');
  assert.equal(snap(1.39, targets, 100, true), 1.39, 'free');
  assert.deepEqual(snapTargets(undefined, 10, null), [0, 10]);
  assert.equal(snap(4.97, snapTargets([], 10, 5), 100), 5, 'the playhead');
});

test('ruler: ticks at least 64 pt apart, plain labels', () => {
  assert.equal(tickStep(1), 120);
  assert.equal(tickStep(100), 1);
  assert.equal(tickLabel(90), '1:30');
  assert.equal(tickLabel(5.5), '0:05.5');
  const [box] = layout([{ id: 1, duration: 60 }], 10);
  const t = ticks(box, 0, 400, 10);
  assert.equal(t[0].label, '0:00');
  near(t[1].x - t[0].x, 100);
});

// ---------- edge-drag.js: one drag = one step ----------

const lengths = { 1: 10, 2: 5 };

test('drag: down / move / move / up → one change, the final cut, from the drag-start list', () => {
  const start = [you(2, 4), you(6, 7)];
  const d = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 'e', lengths, pps: 100 });
  d.move(4.5);
  d.move(5);
  const r = d.end();
  assert.equal(r.changed, true);
  assert.equal(r.label, 'Changed a cut');
  assert.deepEqual(r.cuts, [you(2, 5), you(6, 7)]);
  assert.equal(r.join, 2, 'the playhead waits before the join');
  assert.deepEqual(start, [you(2, 4), you(6, 7)], 'nothing accumulates in the start list');
});

test('drag into a neighbour merges; through the other edge closes it (restored)', () => {
  const start = [you(2, 4), you(6, 7)];
  const into = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 'e', lengths, pps: 100 });
  into.move(6.5);
  assert.deepEqual(into.end().cuts, [you(2, 7)]);
  const shut = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 'e', lengths, pps: 100 });
  shut.move(2);
  assert.equal(shut.cut, undefined, 'the chip says 0.0 s');
  assert.deepEqual(shut.end().cuts, [you(6, 7)]);
});

test('dragging a Magic cut makes it yours (the reason stays for the hover)', () => {
  const start = [magic(2, 4)];
  const d = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 's', lengths, pps: 100 });
  d.move(1.5);
  assert.deepEqual(d.end().cuts, [{ part: 1, s: 1.5, e: 4, by: 'you', reason: 'earlier take' }]);
});

test('drag snaps to word edges; ⌥ drags free; clamped to the part', () => {
  const start = [you(2, 4)];
  const d = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 'e', lengths, targets: [4.5], pps: 100 });
  d.move(4.47);
  assert.equal(d.t, 4.5);
  d.move(4.47, true);
  assert.equal(d.t, 4.47);
  d.move(99);
  assert.equal(d.t, 10);
});

test('trim: a part edge with no cut there, dragged inward, makes a cut from the start (or to the end)', () => {
  const head = startEdgeDrag({ cuts: [], part: 1, side: 's', lengths, pps: 100 });
  head.move(1.5);
  const r = head.end();
  assert.deepEqual(r.cuts, [you(0, 1.5)]);
  assert.equal(r.label, 'Trimmed a part');
  const tail = startEdgeDrag({ cuts: [you(0, 1)], part: 1, side: 'e', lengths, pps: 100 });
  tail.move(8);
  assert.deepEqual(tail.end().cuts, [you(0, 1), you(8, 10)]);
});

test('a drag that comes back where it started is no step; keyboard nudges add up to one step', () => {
  const start = [you(2, 4)];
  const back = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 'e', lengths, pps: 100 });
  back.move(5);
  back.move(4);
  assert.equal(back.end().changed, false);
  const keys = startEdgeDrag({ cuts: start, cut: start[0], part: 1, side: 'e', lengths, pps: 100 });
  keys.nudge(0.1); keys.nudge(0.1); keys.nudge(0.1);
  near(keys.end().cuts[0].e, 4.3);
});

test('a range ⌫ uses the same rule as words: cut it, then all cut → restore it', () => {
  const range = { part: 1, s: 2, e: 3 };
  const cut = toggleRange([], range, lengths);
  assert.equal(cut.label, 'Cut 1.0 s');
  assert.deepEqual(toggleRange(cut.cuts, range, lengths).cuts, []);
});

// ---------- cut-view.js: labels, colours, handles ----------

test('a cut reads its times, length and owner; an edge reads its time', () => {
  assert.equal(cutLabel(magic(42, 44.4)), 'Cut, 0:42.0 to 0:44.4, 2.4 seconds, by Magic Cut: earlier take. Backspace restores.');
  assert.equal(cutLabel(you(42, 44.4)), 'Cut, 0:42.0 to 0:44.4, 2.4 seconds, yours. Backspace restores.');
  assert.equal(edgeText('s', 42.3), 'Start of cut, 0:42.3');
  assert.equal(cutHover({ ...you(1, 2), reason: 'earlier take' }, true), 'Magic Cut: earlier take', 'a Magic cut you changed still says why');
  assert.equal(cutHover(you(1, 3.4), false), 'Cut · 2.4 s · Zoom in to drag');
});

/** Just enough DOM for cut-view. */
function fakeDocument() {
  const make = (tag) => ({
    tag, className: '', style: {}, dataset: {}, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); },
  });
  return { createElement: make };
}

test('cut view: hatch in its owner colour, handles only with room, never invisible', () => {
  globalThis.document = fakeDocument();
  const sliders = (n) => n.children.filter((h) => h.attrs.role === 'slider');
  const wide = cutView(magic(2, 4), { left: 20, width: 40, selected: true, index: 3 });
  assert.match(wide.style.cssText, /255 106 61/, 'Magic is coral');
  assert.match(wide.className, /ring-accent/, 'selected');
  assert.equal(wide.dataset.cut, 3);
  assert.equal(wide.attrs.role, 'button');
  assert.equal(sliders(wide).length, 2);
  assert.equal(sliders(wide)[0].attrs['aria-valuetext'], 'Start of cut, 0:02.0');
  const thin = cutView(you(2, 2.05), { left: 20, width: 0.5, selected: false, index: 0 });
  assert.match(thin.style.cssText, /158 161 168/, 'yours is grey');
  assert.match(thin.style.cssText, new RegExp(`width:${MIN_W}px`));
  assert.equal(sliders(thin).length, 0, 'too small to drag: zoom in');
  delete globalThis.document;
});

// ---------- waveform-view.js ----------

test('waveform: scaled to the loudest moment, dimmed inside cuts, only what is in view', () => {
  const [box] = layout([{ id: 1, duration: 2 }], 100); // 200 pt wide, 2 pt per bar = 1 peak per bar
  const wf = { perSecond: 100, peaks: Array.from({ length: 200 }, (_, i) => (i < 100 ? 64 : 128)) };
  const cols = bars(box, wf, [you(1, 2)], 0, 1000);
  assert.equal(cols.length, 100);
  near(cols[0].h, 0.5);
  near(cols.at(-1).h, 1);
  assert.equal(cols[0].cut, false);
  assert.equal(cols.at(-1).cut, true);
  assert.equal(bars(box, wf, [], 116, 50).length, 25, 'only the visible range');
  assert.deepEqual(bars(box, undefined, [], 0, 1000), [], 'no waveform yet: the flat line');
});

// ---------- pauses.js + strip-view.js: the transcript strip ----------

const said = [{ w: 'Hi', s: 0.5, e: 0.8 }, { w: 'there', s: 0.85, e: 1.2 }, { w: 'so', s: 2.2, e: 2.4 }, { w: 'yes', s: 2.6, e: 2.9 }];

test('pauses: gaps between words minus a breath each side; short gaps are just speech; the ends are trims', () => {
  const ps = pauses(said, 5);
  assert.equal(ps.length, 3);
  near(ps[0].s, 0); near(ps[0].e, 0.4, 'before the first word: from 0');
  near(ps[1].s, 1.3); near(ps[1].e, 2.1, 'a breath kept next to each word');
  near(ps[2].s, 3.0); near(ps[2].e, 5, 'after the last word: to the end');
  assert.equal(pauses(said, undefined).length, 2, 'length unknown: no pause after the last word');
  assert.deepEqual(pauses([], 5), [], 'no transcript yet: no pauses');
  assert.equal(pauses(said, 5), pauses(said, 5), 'memoized per words list');
  assert.ok(ps.every((p) => p.e - p.s >= MIN_PAUSE), 'never shorter than MIN_PAUSE');
});

test('select a pause + ⌫ cuts exactly it (one step), the words stay; ⌫ again restores it', () => {
  const lens = { 1: 5 };
  const p = pauses(said, 5)[1];
  const sel = { part: 1, s: p.s, e: p.e, pause: true };
  const cut = toggleSelection([], sel, said, lens);
  assert.equal(cut.label, 'Cut 0.8 s pause');
  assert.deepEqual(cut.cuts, [you(p.s, p.e)]);
  assert.ok(said.every((w) => !isCut(w, cut.cuts)), 'no word is touched');
  assert.equal(pauseCut(p, 1, cut.cuts)?.by, 'you');
  const back = toggleSelection(cut.cuts, sel, said, lens);
  assert.equal(back.label, 'Restored 0.8 s pause');
  assert.deepEqual(back.cuts, []);
});

test('a pause half inside a word cut is not cut: ⌫ cuts the rest; touching cuts count together', () => {
  const p = pauses(said, 5)[1]; // 1.3 … 2.1
  const half = [you(0.825, 1.7)]; // "there" cut to the pause middle
  assert.equal(pauseCut(p, 1, half), undefined);
  const r = toggleSelection(half, { part: 1, ...p, pause: true }, said, { 1: 5 });
  assert.equal(r.label, 'Cut 0.8 s pause');
  assert.deepEqual(r.cuts, [you(0.825, 2.1)]);
  assert.equal(pauseCut(p, 1, [you(1, 1.7), magic(1.7, 2.5)])?.by, 'magic', 'two owners, all covered: the middle decides');
  assert.equal(pauseCut(p, 1, [you(1.3, 2.1, 2)]), undefined, 'other parts are not touched');
});

test('pause view: grey block with its length, selectable by Tab, says what ⌫ does', () => {
  globalThis.document = fakeDocument();
  const p = { s: 42, e: 43.2 };
  const kept = pauseView(p, { left: 10, width: 120, selected: true, index: 2 });
  assert.equal(kept.textContent, '1.2 s');
  assert.equal(kept.dataset.pause, 2);
  assert.equal(kept.tabIndex, 0);
  assert.equal(kept.attrs.role, 'button');
  assert.match(kept.className, /ring-accent/, 'selected');
  assert.equal(kept.attrs['aria-label'], 'Pause, 1.2 seconds, at 0:42.0. Backspace cuts it.');
  const narrow = pauseView(p, { left: 10, width: 20, selected: false, index: 0 });
  assert.equal(narrow.textContent, '', 'no label when narrow');
  assert.equal(pauseLabel(p), 'Pause, 1.2 seconds, at 0:42.0. Backspace cuts it.');
  delete globalThis.document;
});

// ---------- player.js against a fake <video> ----------

function fakeVideo({ twin = false } = {}) {
  const on = {};
  const classes = new Set();
  return {
    on, paused: true, currentTime: 0, duration: 10, readyState: 4, dataset: {}, src: '', muted: false, volume: 1, id: 'player',
    classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) },
    addEventListener(k, f) { (on[k] ??= []).push(f); },
    emit(k) { (on[k] ?? []).forEach((f) => f()); },
    play() { this.paused = false; this.emit('play'); },
    pause() { this.paused = true; this.emit('pause'); },
    getAttribute: () => 'x', setAttribute() {}, removeAttribute() {}, load() {}, after(n) { this.twin = n; },
    requestVideoFrameCallback() {},
    ...(twin ? { cloneNode: () => fakeVideo() } : {}),
  };
}

async function rigPlayer(cuts, { preview, onFrame, ...opts } = {}) {
  globalThis.window = { __TAURI__: { core: { convertFileSrc: (p) => p } } };
  globalThis.document = { getElementById: () => null };
  const { createPlayer } = await import('../src/ui/player.js');
  const video = fakeVideo(opts);
  const parts = [{ id: 1, path: 'a', duration: 10 }, { id: 2, path: 'b', duration: 5 }];
  const player = createPlayer(video, {
    parts: () => parts, cuts: () => cuts, onTime() {}, onPart() {}, onError() {}, onFrame,
    ...(preview ? { preview: () => preview.now } : {}),
  });
  return { video, player, parts };
}

// Display frames on demand: each pump runs the frames asked for since the last.
function fakeFrames() {
  const asked = [];
  globalThis.requestAnimationFrame = (f) => asked.push(f);
  return { pump: () => asked.splice(0).forEach((f) => f()), done: () => delete globalThis.requestAnimationFrame };
}

const forwardOnly = (times, msg) => times.forEach((x, k) => k && assert.ok(x >= times[k - 1] - 1e-9, `${msg}: ${times[k - 1]} then ${x}`));

test('player: with a preview ready, playing plays the preview over every cut (no seek, no start at a cut); the playhead only moves forward', async () => {
  const { laidOut } = await import('../src/ui/edit-map.js');
  const frames = fakeFrames();
  const seen = [];
  const cuts = [you(2, 3), you(8, 10)];
  const preview = { now: null };
  const { video, player, parts } = await rigPlayer(cuts, { twin: true, preview, onFrame: (i, t) => seen.push(editedTime(parts, cuts, i, t)) });
  preview.now = { key: 'k', file: 'preview.mp4', map: laidOut(keptSpans(parts, cuts)) };
  const pv = video.twin.twin;
  player.show(0, 1);
  player.play();
  assert.ok(video.paused && !pv.paused, 'the preview plays, the source waits');
  assert.equal(pv.src, 'preview.mp4');
  assert.equal(pv.currentTime, 1, 'part 1 at 1 s is the edit at 1 s');
  assert.ok(pv.classList.contains('opacity-0'), 'hidden until its first frame plays');
  pv.emit('playing');
  assert.ok(!pv.classList.contains('opacity-0'));
  // the preview's clock: steady, a stall, a reading a little behind (as WebKit's does), across both cuts
  for (const T of [1.5, 1.98, 2.02, 2.02, 2.02, 1.99, 2.1, 4, 6.95, 7.01, 7.0, 7.5, 11.9]) {
    pv.currentTime = T;
    frames.pump();
  }
  assert.equal(player.current, 1, 'into part 2 as the preview crosses into it');
  assert.equal(video.currentTime, 1, 'the source never seeked');
  forwardOnly(seen, 'edited time of the playhead');
  assert.ok(seen.at(-1) > 11.5);
  player.pause();
  assert.ok(pv.paused && video.paused);
  assert.equal(video.dataset.path, 'b');
  near(video.currentTime, 4.9, 'paused, the source shows the same spot');
  frames.done();
});

test('player: playing from inside a cut, or with an outdated preview, plays the source; an edit mid-play hands back to it', async () => {
  const { laidOut } = await import('../src/ui/edit-map.js');
  const cuts = [you(2, 3)];
  const preview = { now: null };
  const { video, player, parts } = await rigPlayer(cuts, { twin: true, preview });
  const pv = video.twin.twin;
  preview.now = { key: 'k', file: 'preview.mp4', map: laidOut(keptSpans(parts, cuts)) };
  player.show(0, 2.5);
  player.play();
  assert.ok(!video.paused && pv.paused, 'you asked to hear the cut: the source plays it');
  player.pause();
  player.show(0, 1);
  player.play();
  assert.ok(!pv.paused);
  pv.currentTime = 1.5;
  preview.now = null; // you edited: the new preview is being made
  pv.emit('timeupdate');
  assert.ok(pv.paused && !video.paused, 'the source plays on');
  near(video.currentTime, 1.5, 'from the same spot');
});

test('player: twin mode: a swap whose twin reads a little behind never moves the playhead back', async () => {
  const frames = fakeFrames();
  const seen = [];
  const cuts = [you(2, 3)];
  const { video, player, parts } = await rigPlayer(cuts, { twin: true, onFrame: (i, t) => seen.push(editedTime(parts, cuts, i, t)) });
  const spare = video.twin;
  player.show(0, 1);
  video.play();
  player.tick();
  player.tick();
  for (const t of [1.5, 1.9, 1.99]) { video.currentTime = t; frames.pump(); }
  spare.currentTime = 3.04;
  player.tick();
  await afterSwap();
  assert.equal(player.element, spare);
  for (const t of [3.04, 2.97, 2.97, 3.0, 3.05, 3.2]) { spare.currentTime = t; frames.pump(); }
  forwardOnly(seen, 'edited time of the playhead');
  frames.done();
});

const afterSwap = () => new Promise((r) => setTimeout(r, 30)); // the swap waits for the cut's exact moment

test('player: a hidden twin plays along at QUIET on the far side of the next cut; at the cut they swap, no seek, no pause', async () => {
  const { video, player } = await rigPlayer([you(2, 3), you(8, 10)], { twin: true });
  const spare = video.twin;
  assert.ok(spare.classList.contains('opacity-0') && spare.volume === QUIET && !spare.muted, 'hidden, inaudible, never muted');
  player.show(0, 4);
  video.play();
  player.tick();
  assert.equal(spare.dataset.path, undefined, 'the next cut is 4 s away (over LEAD): not yet');
  player.show(0, 1);
  player.tick();
  assert.ok(spare.paused && spare.currentTime === 2 + SEEK_LAG, 'seeked while paused (disturbs nothing), ahead by what its start costs');
  player.tick();
  assert.equal(spare.paused, false, 'then it plays along (a seek while both play would be a second hitch)');
  spare.currentTime = 2.99; // settled, in step
  video.currentTime = 1.99;
  player.tick();
  await afterSwap();
  assert.equal(video.currentTime, 1.99, 'the old one never seeks (that is the hitch)');
  assert.equal(player.element, spare);
  assert.ok(!spare.classList.contains('opacity-0') && spare.volume === 1, 'the twin is seen and heard');
  assert.ok(!video.paused && video.volume === QUIET && video.classList.contains('opacity-0'),
    'the old one plays on, hidden and inaudible (pausing it would stall the other)');
  assert.equal(player.time, 2.99);
  spare.currentTime = 6.5;
  player.tick();
  assert.equal(video.dataset.path, 'b', "the next part's file waits for the cut to the end");
  assert.ok(video.paused && video.currentTime === 0, 'it cannot play before 0: parked at the start');
  spare.currentTime = 7.98;
  player.tick();
  assert.equal(video.paused, false, 'the cut (a frame ahead) starts it: its start lag ≈ the wait for the cut');
  await afterSwap();
  assert.equal(player.current, 1, 'on to part 2 by a swap');
  assert.equal(player.element, video);
});

test('player: a short kept stretch (0.9 s) between two cuts: the old one seeks on at once and swaps back in', async () => {
  const { video, player } = await rigPlayer([you(2, 3), you(3.9, 4.5)], { twin: true });
  const spare = video.twin;
  player.show(0, 1);
  video.play();
  player.tick();
  player.tick();
  spare.currentTime = 2.99;
  video.currentTime = 1.99;
  player.tick();
  await afterSwap();
  assert.equal(player.element, spare);
  player.tick();
  near(video.currentTime, 4.5 - 0.91 + SEEK_LAG, 'the cut is 0.91 s off: still time for one seek');
  video.currentTime = 4.49; // it settled in step
  spare.currentTime = 3.89;
  player.tick();
  await afterSwap();
  assert.equal(player.element, video, 'the second cut swaps too: no seek after a short kept stretch');
  assert.equal(spare.currentTime, 3.89, 'the one left behind was not seeked over the cut');
});

test('player: you seek while a swap is due within the frame: no swap', async () => {
  const { video, player } = await rigPlayer([you(2, 3)], { twin: true });
  const spare = video.twin;
  player.show(0, 1);
  video.play();
  player.tick();
  player.tick();
  spare.currentTime = 2.99;
  video.currentTime = 1.99;
  player.tick(); // the swap is due in 10 ms
  video.currentTime = 0.5; // you seek back before it comes
  await afterSwap();
  assert.equal(player.element, video, 'you stay where you sought');
  assert.equal(video.currentTime, 0.5);
});

test('player: the twin not in step at the cut: it seeks as before; pausing pauses the twin too', async () => {
  const { video, player } = await rigPlayer([you(2, 3)], { twin: true });
  const spare = video.twin;
  player.show(0, 1.9);
  video.play();
  player.tick(); // the twin starts playing, but has no time left to get in step
  video.currentTime = 1.99;
  player.tick();
  assert.equal(player.element, video);
  assert.equal(video.currentTime, 3);
  assert.equal(spare.paused, false);
  video.pause();
  assert.equal(spare.paused, true, 'it only plays along while you do');
});

test('player: playing skips each cut on the frame before it, and cuts that touch in one jump', async () => {
  const { video, player } = await rigPlayer([you(2, 3), magic(3, 4)]);
  player.show(0, 1);
  video.play();
  video.currentTime = 1.99;
  player.tick();
  assert.equal(video.currentTime, 4, 'straight past both');
  video.emit('seeked');
  video.currentTime = 4.5;
  player.tick();
  assert.equal(video.currentTime, 4.5);
});

test('player: started inside a cut, that cut plays; a cut to the part end goes on to the next part', async () => {
  const { video, player } = await rigPlayer([you(2, 3), you(8, 10), you(0, 1, 2)]);
  player.show(0, 2.5);
  video.play();
  player.tick();
  assert.equal(video.currentTime, 2.5, 'you asked to hear it');
  video.currentTime = 7.99;
  player.tick();
  assert.equal(player.current, 1, 'on to part 2');
  assert.equal(video.currentTime, 1, "from part 2's first kept moment");
});

test('player: a cut to the very end stops there; paused never jumps; readout is edited time', async () => {
  const { video, player } = await rigPlayer([you(3, 5, 2)]);
  player.show(1, 2.99);
  video.duration = 5; // part 2's file
  video.play();
  player.tick();
  assert.equal(video.paused, true, 'stopped');
  video.currentTime = 4;
  player.tick();
  assert.equal(video.currentTime, 4, 'paused: no skipping');
  assert.deepEqual(player.times(), { at: '00:13', total: '00:13', original: '00:15' });
  delete globalThis.window;
  delete globalThis.document;
});

// ---------- wiring ----------

test('the timeline only calls commands Rust registers', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const handlers = (await readFile(new URL('src-tauri/src/main.rs', root), 'utf8')).match(/generate_handler!\[([^\]]*)\]/)[1];
  const main = await readFile(new URL('src/main.js', root), 'utf8');
  for (const cmd of [...main.matchAll(/invoke\('(\w+)'/g)].map((m) => m[1])) assert.match(handlers, new RegExp(`\\b${cmd}\\b`), cmd);
  assert.match(main, /invoke\('waveform'/);
});
