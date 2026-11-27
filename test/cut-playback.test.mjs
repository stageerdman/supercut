// "An added cut doesn't cut": every way of making a cut, with the playhead left where that gesture leaves it
// (at the cut's start or inside it), then Play. The cut never plays: from just before, at or inside it, playing
// lands past it — on the source and on the preview. Export renders the same spans the player plays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleWords, toggleRange, moveEdge, withMagic, normalize } from '../src/ui/cuts.js';
import { createHistory } from '../src/ui/history.js';
import { emptyEdit } from '../src/ui/edit.js';
import { fromDoc, toDoc } from '../src/ui/project-doc.js';
import { keptSpans, editedTime } from '../src/ui/playback.js';
import { exportSpans } from '../src/ui/export.js';
import { FRAME } from '../src/ui/bit.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≈ ${b}`);
const parts = [{ id: 1, path: 'a', duration: 10 }, { id: 2, path: 'b', duration: 5 }];
const lengths = { 1: 10, 2: 5 };
const words = [{ w: 'so', s: 1, e: 2 }, { w: 'um', s: 4, e: 4.5 }, { w: 'like', s: 4.5, e: 5 }, { w: 'yes', s: 6, e: 7 }];

function fakeVideo() {
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
    requestVideoFrameCallback(f) { this.frame = f; },
    cloneNode: () => fakeVideo(),
  };
}

/** A player over the edit's live cuts (as main.js: cutsNow()), with an optional preview of them. */
async function rig(state, { preview = false } = {}) {
  globalThis.window = { __TAURI__: { core: { convertFileSrc: (p) => p } } };
  globalThis.document = { getElementById: () => null };
  const { createPlayer } = await import('../src/ui/player.js');
  const { laidOut } = await import('../src/ui/edit-map.js');
  const video = fakeVideo();
  const player = createPlayer(video, {
    parts: () => parts, cuts: () => state.cuts, onTime() {}, onPart() {}, onError() {},
    ...(preview ? { preview: () => ({ key: 'k', file: 'p.mp4', map: laidOut(keptSpans(parts, state.cuts)) }) } : {}),
  });
  return { video, player, pv: video.twin.twin };
}

/** Play from `at` with the cut [s, e) on the timeline: playing must start at or after e, never inside. */
async function playsPast(cuts, at, s, e, msg) {
  const src = await rig({ cuts });
  src.player.show(0, at);
  src.player.play();
  src.player.tick();
  assert.ok(!src.video.paused, `${msg}: it plays`);
  assert.ok(src.video.currentTime >= e - 1e-6, `${msg}: source from ${at} starts at ${src.video.currentTime}, past ${e}`);
  const pre = await rig({ cuts }, { preview: true });
  pre.player.show(0, at);
  pre.player.play();
  assert.ok(!pre.pv.paused, `${msg}: the preview plays`);
  // The preview file holds only kept time: it starts at the edit time of `at` (inside a cut: the join).
  near(pre.pv.currentTime, editedTime(parts, cuts, 0, at), `${msg}: preview from the join`);
  if (at >= s) assert.ok(pre.player.time >= e - 1e-6, `${msg}: the playhead shows the cut's far side`);
  assert.deepEqual(exportSpans(parts, cuts), keptSpans(parts, cuts).map((k) => ({ ...k })), `${msg}: export = playback`);
}

const gestures = [
  ['transcript ⌫ on words (playhead at the first word)', () => toggleWords([], 1, words.slice(1, 3), words, lengths).cuts, 4, 5],
  ['timeline selection + Cut (playhead at its start)', () => toggleRange([], { part: 1, s: 4, e: 5 }, lengths).cuts, 4, 5],
  ['a cut edge dragged over the playhead', () => {
    const cuts = toggleRange([], { part: 1, s: 4.8, e: 5 }, lengths).cuts;
    return moveEdge(cuts, cuts[0], 's', 4, lengths);
  }, 4, 5],
  ['Magic Cut', () => withMagic([], [{ part: 1, s: 4, e: 5, reason: 'filler' }], lengths), 4, 5],
  ['a reopened project', () => {
    const edit = { ...emptyEdit(), cuts: normalize([{ part: 1, s: 4, e: 5, by: 'you' }], lengths) };
    return fromDoc(JSON.parse(JSON.stringify(toDoc({ parts, edit, trace: null }))), parts).edit.cuts;
  }, 4, 5],
  ['undo then redo of a cut', () => {
    const h = createHistory();
    h.push({ ...h.edit, cuts: toggleRange([], { part: 1, s: 4, e: 5 }, lengths).cuts }, 'Cut');
    h.undo();
    h.redo();
    return h.edit.cuts;
  }, 4, 5],
];

for (const [how, make, s, e] of gestures) {
  test(`cut by ${how}: playing from just before, at and inside it skips it`, async () => {
    const cuts = make();
    assert.ok(cuts.some((c) => c.part === 1 && c.s <= s + 1e-6 && c.e >= e - 1e-6), 'the cut is on the timeline');
    for (const at of [s - FRAME / 2, s, (s + e) / 2, e - 0.01]) await playsPast(cuts, at, s, e,`${how}, from ${at}`);
  });
}

test('undo of a cut: the time plays again', async () => {
  const h = createHistory();
  h.push({ ...h.edit, cuts: toggleRange([], { part: 1, s: 4, e: 5 }, lengths).cuts }, 'Cut');
  h.undo();
  const { video, player } = await rig({ cuts: h.edit.cuts });
  player.show(0, 4.5);
  player.play();
  player.tick();
  assert.equal(video.currentTime, 4.5, 'no cut there any more');
});

test('a cut made while playing, ahead of or under the playhead, skips on the next frame (live cuts, no stale copy)', async () => {
  const state = { cuts: [] };
  const { video, player } = await rig(state);
  player.show(0, 3.9);
  player.play();
  player.tick();
  state.cuts = toggleRange([], { part: 1, s: 3.5, e: 6 }, lengths).cuts;
  player.tick();
  assert.equal(video.currentTime, 6);
});

test('the rest all cut: Play from inside it plays nothing', async () => {
  const cuts = toggleRange(toggleRange([], { part: 1, s: 8, e: 10 }, lengths).cuts, { part: 2, s: 0, e: 5 }, lengths).cuts;
  const { video, player } = await rig({ cuts });
  player.show(0, 9);
  player.play();
  assert.ok(video.paused, 'nothing kept after');
  delete globalThis.window;
  delete globalThis.document;
});
