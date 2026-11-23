// The timeline frames a review stop (timeline.js frame / inView, against the fake DOM): design/cut-review.md,
// "The timeline frames each stop". No rAF in the tests, so frame() jumps (as under Reduce Motion).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { layout, xAt, fitPps, MAX_PPS } from '../src/ui/timeline-geometry.js';

async function rig(parts) {
  globalThis.document = makeDocument();
  const { createTimeline } = await import('../src/ui/timeline.js');
  const root = document.createElement('div');
  root.clientWidth = 800;
  const zooms = [];
  const timeline = createTimeline(root, {
    parts: () => parts, cuts: () => [], words: () => [], waveform: () => undefined, lengths: () => ({}),
    playhead: () => ({ i: 0, t: 0 }), current: () => 0, max: parts.length,
    onSeek() {}, onLive() {}, onCommit() {}, onToggle() {}, onRemove() {}, onDragStart() {}, onZoom: (z) => zooms.push(z),
  });
  timeline.render();
  const fit = fitPps(parts, 800);
  const ppsAt = (z) => fit * (MAX_PPS / fit) ** z;
  /** Where a moment is on screen now. */
  const screen = (i, t) => xAt(layout(parts, ppsAt(timeline.zoom)), i, t) - root.scrollLeft;
  return { timeline, root, zooms, screen };
}

const TALK = [{ id: 1, name: 'talk.mov', duration: 1200 }]; // a 20-minute talk

test('frame: a 6 s stretch fills 80 % of the view, centred, and the zoom slider follows', async () => {
  const { timeline, zooms, screen } = await rig(TALK);
  const r = { i0: 0, t0: 600, i1: 0, t1: 606, seconds: 6, gaps: 0 };
  timeline.frame(r);
  assert.ok(Math.abs(screen(0, 600) - 80) < 0.5, `starts at 10 %: ${screen(0, 600)}`);
  assert.ok(Math.abs(screen(0, 606) - 720) < 0.5, `ends at 90 %: ${screen(0, 606)}`);
  assert.equal(zooms.at(-1), timeline.zoom);
  assert.equal(timeline.inView(r), true);
  delete globalThis.document;
});

test('inView: false once you scroll the stretch away; a frame brings it back', async () => {
  const { timeline, root } = await rig(TALK);
  const r = { i0: 0, t0: 600, i1: 0, t1: 606, seconds: 6, gaps: 0 };
  timeline.frame(r);
  root.scrollLeft += 2000;
  assert.equal(timeline.inView(r), false);
  timeline.frame(r);
  assert.equal(timeline.inView(r), true);
  delete globalThis.document;
});

test('frame: a stretch across two parts counts the gap; a stretch past the deepest zoom stays at MAX_PPS', async () => {
  const two = [{ id: 1, name: 'a.mov', duration: 300 }, { id: 2, name: 'b.mov', duration: 300 }];
  const { timeline, screen } = await rig(two);
  timeline.frame({ i0: 0, t0: 297, i1: 1, t1: 3, seconds: 6, gaps: 1 });
  assert.ok(Math.abs(screen(0, 297) - 80) < 0.5 && Math.abs(screen(1, 3) - 720) < 0.5);
  timeline.frame({ i0: 0, t0: 100, i1: 0, t1: 100.5, seconds: 0.5, gaps: 0 });
  assert.equal(timeline.zoom, 1, 'clamped');
  assert.ok(Math.abs(screen(0, 100.25) - 400) < 0.5, 'still centred');
  delete globalThis.document;
});
