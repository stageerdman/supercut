// Twin sync: keeps the hidden twin video running in step on the far side of the next cut, so that at the cut the
// two can swap without the picture or the sound standing still. Pure, no DOM. Tested in test/twin-sync.test.mjs.
// What WebKit taught us (measured: updates/2026-11-23 SEAMLESS CUTS - OPEN/wiki.md):
// - a seek in the playing video holds its picture while it decodes: the old hitch at every cut;
// - a paused, audible video takes ~0.3 s from play() until its picture moves: a twin waiting paused freezes the cut;
// - volume 0 → audible, muting, pausing or replaying either video, or changing a rate, stall the other ~0.1 s;
// - a twin playing at an inaudible volume, seeked while it plays, disturbs nothing.
// So while you play, the twin plays too, at QUIET, and is only ever seeked; it is never paused.

export const QUIET = 1e-4; // the twin's volume while it waits: inaudible (−80 dB), yet not 0, which WebKit treats as off
export const SYNC = 0.02; // s: the twin is in step when it is this close to where it should be
export const TOLERANCE = 0.1; // s the twin may be off at the cut and still take over (off by more: seek instead)
export const FIX_BEFORE = 0.25; // s before the cut, the last moment to correct the twin by a seek
const MAX_LAG = 0.5;

/** Where the twin should be now: as far before `to` as the one you see (at `t`) is before the cut at `at`. */
export const twinTarget = (at, to, t) => to - (at - t);

/** How far the twin (at `twinT`) is ahead (+) or behind (−) where it should be. */
export const drift = (at, to, t, twinT) => twinT - twinTarget(at, to, t);

/** A new lag after landing `off` seconds off (behind is −): aim that much further ahead next time. */
export const learnLag = (lag, off) => Math.min(MAX_LAG, Math.max(0, lag - off));

/**
 * What to do with the twin this frame. `cue` = { at, to, t }: the cut at `at` lands on `to`, you are at `t`.
 * `twin` = { paused, busy (seeking or loading), time }. `lags` = { start, seek }: how late its clock runs after a
 * play() and after a seek. → { do: 'wait' | 'play' | 'ok' } or { do: 'park' | 'seek', time }.
 */
export function twinStep(cue, twin, lags) {
  if (twin.busy) return { do: 'wait' };
  const want = twinTarget(cue.at, cue.to, cue.t);
  if (want + lags.start < 0) { // the far side starts a part: wait at its start for the cue
    return twin.paused && Math.abs(twin.time) < SYNC ? { do: 'wait' } : { do: 'park', time: 0 };
  }
  if (twin.paused) return { do: 'play' };
  if (Math.abs(twin.time - want) <= SYNC || cue.at - cue.t < FIX_BEFORE) return { do: 'ok' };
  return { do: 'seek', time: want + lags.seek };
}
