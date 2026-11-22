// Play clock: a smooth time for the playhead, every display frame, while the video plays.
// The video's currentTime can step coarsely (it may only change with each decoded frame or timeupdate). Between
// changes we run on with the wall clock at the playback rate; a new reading that is a little behind our estimate
// is held (the line never steps back); a big jump either way is a seek or a skipped cut and is taken as is.
// Pure: `now` (ms) is passed in. Spec: design/timeline.md § Playhead.

const SEEK = 0.25; // s: a reading this far from the estimate is a jump, not drift
const AHEAD = 0.5; // s: never run further than this past the last reading (a stall)
const PULL = 0.5; // how far toward a new reading we move at once: the rest is eased over the next frames

export function createPlayClock() {
  let last = null; // { key, raw, at, out }

  return {
    /** The playhead time for `raw` (video.currentTime) at `now` ms; `key` (the part) resets it; paused = raw. */
    read(raw, now, { playing = true, rate = 1, key = 0 } = {}) {
      if (!playing || !(rate > 0)) { last = null; return raw; }
      if (!last || last.key !== key) { last = { key, raw, at: now, out: raw }; return raw; }
      const est = last.out + (Math.max(0, now - last.at) / 1000) * rate;
      let out;
      if (raw === last.raw) out = Math.min(est, raw + AHEAD); // no news: run on
      else if (Math.abs(raw - est) > SEEK) out = raw; // a jump: take it
      else out = est + (raw - est) * PULL; // news: ease toward it
      if (Math.abs(raw - est) <= SEEK || raw === last.raw) out = Math.max(out, last.out); // never step back
      last = { key, raw, at: now, out };
      return out;
    },
    reset() { last = null; },
  };
}
