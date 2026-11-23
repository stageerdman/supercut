// Twin sync: keeps the hidden twin video running in step on the far side of the next cut, so that at the cut the
// two can swap without the picture or the sound standing still. Pure, no DOM. Tested in test/twin-sync.test.mjs.
// What WebKit taught us (measured: updates/2026-11-23 SEAMLESS CUTS - OPEN/wiki.md):
// - a seek in the playing video holds its picture while it decodes: the old hitch at every cut;
// - a paused, audible video takes ~0.3 s from play() until its picture moves: a twin waiting paused freezes the cut;
// - volume 0 → audible, muting, pausing or replaying either video, or changing a rate, stall the other ~0.1 s;
// - a twin playing at an inaudible volume, seeked while it plays, disturbs nothing; it lands ~0.47 s behind where it
//   was sent (steady by ~0.8 s), the same within ~10 ms seek after seek: a lag worth learning.
// So while you play, the twin plays too, at QUIET, and is only ever seeked; it is never paused. Only when the far side
// starts a part (nothing before it to play along) does it wait paused, and the cut starts it.

export const QUIET = 1e-4; // the twin's volume while it waits: inaudible (−80 dB), yet not 0, which WebKit treats as off
export const SYNC = 0.05; // s: the twin is in step when it is this close to where it should be (seeks land ±a frame)
export const TOLERANCE = 0.1; // s the twin may be off at the cut and still take over (off by more: seek instead)
// s after a seek lands until the twin runs steady: its clock runs ~0.3 s, stands still ~0.3 s, then runs.
export const SETTLE = 0.8;
// s before the cut, the last moment to correct the twin by a seek: one begun later would still stand at the cut
// (measured: a twin seeked 0.7 s before froze the picture ~80 ms right after the swap). A kept stretch at least
// this long lets the old one seek on at the swap and be in step for the next cut; a shorter one seeks there.
export const FIX_BEFORE = SETTLE + 0.05;
const MAX_LAG = 1;
// s a seek while playing costs before the twin runs steady again (WebKit, measured 0.41–0.50; learned per seek).
export const SEEK_LAG = 0.47;

/** Where the twin should be now: as far before `to` as the one you see (at `t`) is before the cut at `at`. */
export const twinTarget = (at, to, t) => to - (at - t);

/** How far the twin (at `twinT`) is ahead (+) or behind (−) where it should be. */
export const drift = (at, to, t, twinT) => twinT - twinTarget(at, to, t);

/**
 * The seek lag a settled twin shows: sent to `aimed` `elapsed` wall seconds ago at `rate`, it is at `time` instead.
 * Measured on the twin's own clock, not against the video you see (whose clock stands still now and then).
 */
export const seekLoss = (aimed, elapsed, rate, time) => Math.min(MAX_LAG, Math.max(0, aimed + elapsed * rate - time));

/** The twin waits paused at the far side (it starts a part: nothing to play along before it); the cut plays it. */
export const parked = (to, twin) => twin.paused && Math.abs(twin.time - to) < SYNC;

/**
 * What to do with the twin this frame. `cue` = { at, to, t }: the cut at `at` lands on `to`, you are at `t`.
 * `twin` = { paused, busy (seeking, loading or settling), time }. `seekLag`: how far a seek while playing falls behind.
 * → { do: 'wait' | 'play' | 'ok' } or { do: 'park' | 'seek', time }.
 */
export function twinStep(cue, twin, seekLag) {
  if (twin.busy) return { do: 'wait' };
  const want = twinTarget(cue.at, cue.to, cue.t);
  if (want < 0) return parked(cue.to, twin) ? { do: 'wait' } : { do: 'park', time: cue.to };
  if (twin.paused) return { do: 'play' };
  if (Math.abs(twin.time - want) <= SYNC || cue.at - cue.t < FIX_BEFORE) return { do: 'ok' };
  return { do: 'seek', time: want + seekLag };
}
