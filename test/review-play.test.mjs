// Cut review: a window plays from its first span, waits at its end, replays: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withMagic } from '../src/ui/cuts.js';
import { reviewWindow } from '../src/ui/review.js';
import { editedTime } from '../src/ui/playback.js';
import { createWindowPlay } from '../src/ui/review-play.js';

const PARTS = [{ id: 1, duration: 60 }];
const CUTS = withMagic([], [{ part: 1, s: 20, e: 22, reason: 'Filler' }], { 1: 60 });
const STOP = { joins: [editedTime(PARTS, CUTS, 0, 20)], items: [] };

function fakePlayer() {
  const calls = [];
  return {
    calls,
    playing: false,
    show(i, t, play) { calls.push(['show', i, t]); this.playing = play; },
    pause() { calls.push(['pause']); this.playing = false; },
    play() { calls.push(['play']); this.playing = true; },
  };
}
const setup = (onEnd) => {
  const player = fakePlayer();
  return { player, w: createWindowPlay(player, { parts: () => PARTS, cuts: () => CUTS, onEnd }) };
};

test('a window starts at its first span and pauses at its end, once', () => {
  let ends = 0;
  const { player, w } = setup(() => ends++);
  w.play(reviewWindow(STOP, PARTS, CUTS));
  assert.deepEqual(player.calls[0], ['show', 0, 17]);
  w.at(0, 19); // before the cut
  w.at(0, 23); // past it: the player skipped 20–22, edited 21
  assert.equal(player.playing, true);
  w.at(0, 25); // edited 23 = the window's end
  assert.equal(player.playing, false);
  assert.equal(w.ended, true);
  w.at(0, 25.1);
  assert.equal(ends, 1, 'it waits; nothing moves on its own');
});

test('Space pauses and plays mid-window, and replays once it has ended; R replays any time', () => {
  const { player, w } = setup();
  w.play(reviewWindow(STOP, PARTS, CUTS));
  w.toggle();
  assert.equal(player.playing, false);
  w.toggle();
  assert.equal(player.playing, true);
  w.at(0, 18);
  w.at(0, 25);
  w.toggle();
  assert.deepEqual(player.calls.at(-1), ['show', 0, 17], 'replay from the start');
  assert.equal(w.ended, false);
  w.replay();
  assert.deepEqual(player.calls.at(-1), ['show', 0, 17]);
});

test('after says how far into the window the verdict came', () => {
  const { w } = setup();
  w.play(reviewWindow(STOP, PARTS, CUTS));
  w.at(0, 18.8);
  assert.ok(Math.abs(w.after - 1.8) < 1e-6);
  w.at(0, 30);
  assert.equal(w.after, 6, 'never past the window');
});

test('a paused player or a stopped window ignores time updates', () => {
  const { player, w } = setup();
  w.at(0, 25);
  assert.deepEqual(player.calls, []);
  w.play(reviewWindow(STOP, PARTS, CUTS));
  w.stop();
  assert.equal(player.playing, false);
  w.at(0, 25);
  assert.equal(w.window, null);
});

test('a stale time from before the seek landed does not end the window', () => {
  const { player, w } = setup();
  w.play(reviewWindow(STOP, PARTS, CUTS));
  w.at(0, 50); // still where the last window left it
  assert.equal(player.playing, true);
  assert.equal(w.ended, false);
  w.at(0, 17.1);
  w.at(0, 25);
  assert.equal(w.ended, true);
});

test('an empty window is refused', () => {
  const { w } = setup();
  assert.throws(() => w.play({ from: 0, to: 0, spans: [] }), /nothing to play/);
});
