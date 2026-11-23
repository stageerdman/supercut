// twin-sync.js: the rules that keep the hidden twin in step on the far side of the next cut (see its header for why).
import test from 'node:test';
import assert from 'node:assert/strict';
import { twinTarget, drift, seekLoss, parked, twinStep, SYNC, FIX_BEFORE, SEEK_LAG } from '../src/ui/twin-sync.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const playing = (time) => ({ paused: false, busy: false, time });

test('twinTarget / drift: the twin is as far before the far side as you are before the cut', () => {
  near(twinTarget(10, 20, 8.5), 18.5);
  near(drift(10, 20, 8.5, 18.6), 0.1, 'ahead is +');
  near(drift(10, 20, 8.5, 18.3), -0.2, 'behind is −');
});

test('seekLoss: how far behind the twin runs, by its own clock; clamped to 0 … 1 s', () => {
  near(seekLoss(5, 1, 1, 5.53), 0.47, 'sent to 5, 1 s on it should be at 6');
  near(seekLoss(5, 1, 2, 6.6), 0.4, 'at double speed it should be at 7');
  assert.equal(seekLoss(5, 1, 1, 6.2), 0, 'ahead counts as no lag');
  assert.equal(seekLoss(5, 1, 1, 3), 1, 'a wild reading is capped');
});

test('twinStep: busy (seeking, loading, settling) → wait; far off with time left → seek ahead by the lag', () => {
  const cue = { at: 10, to: 20, t: 7 };
  assert.deepEqual(twinStep(cue, { paused: false, busy: true, time: 0 }, SEEK_LAG), { do: 'wait' });
  const seek = twinStep(cue, playing(4), SEEK_LAG);
  assert.equal(seek.do, 'seek');
  near(seek.time, 17 + SEEK_LAG);
});

test('twinStep: paused and off → seek it there paused, ahead by the lag (its start costs that); then → play', () => {
  const cue = { at: 10, to: 20, t: 7 }; // it should be at 17
  const park = twinStep(cue, { paused: true, busy: false, time: 0 }, SEEK_LAG);
  assert.equal(park.do, 'park');
  near(park.time, 17 + SEEK_LAG);
  assert.deepEqual(twinStep(cue, { paused: true, busy: false, time: 17 + SEEK_LAG }, SEEK_LAG), { do: 'play' });
  assert.deepEqual(twinStep(cue, { paused: true, busy: false, time: 17 }, SEEK_LAG), { do: 'play' }, 'in step already');
  assert.equal(twinStep(cue, { paused: true, busy: false, time: 18 }, SEEK_LAG).do, 'park', 'too far ahead');
});

test('twinStep: in step → ok; off, but too close to the cut for a seek to settle → ok (the cut decides)', () => {
  assert.deepEqual(twinStep({ at: 10, to: 20, t: 7 }, playing(17 + SYNC / 2), SEEK_LAG), { do: 'ok' });
  const late = 10 - FIX_BEFORE + 0.01;
  assert.deepEqual(twinStep({ at: 10, to: 20, t: late }, playing(4), SEEK_LAG), { do: 'ok' }, 'a seek now would freeze it at the cut');
});

test('twinStep: the far side starts a part (nothing before it to play along) → park paused there, then wait', () => {
  const cue = { at: 10, to: 0, t: 8 };
  assert.deepEqual(twinStep(cue, playing(3), SEEK_LAG), { do: 'park', time: 0 });
  assert.deepEqual(twinStep(cue, { paused: true, busy: false, time: 0 }, SEEK_LAG), { do: 'wait' });
  assert.ok(parked(0, { paused: true, time: 0.01 }) && !parked(0, { paused: false, time: 0 }) && !parked(0, { paused: true, time: 1 }));
  assert.deepEqual(twinStep({ at: 10, to: 1.5, t: 9 }, { paused: true, busy: false, time: 0.5 }, SEEK_LAG), { do: 'play' },
    'a part starting after a cut at 0: there is time before its first kept moment to play along');
});
