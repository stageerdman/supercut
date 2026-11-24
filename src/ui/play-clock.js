// Play clock: a smooth time for the playhead, every display frame, while the video plays.
// The video's currentTime can step coarsely (it may only change with each decoded frame or timeupdate). Between
// changes we run on with the wall clock at the playback rate; a new reading is eased toward. While playing the line
// only moves forward: a reading behind it is held until the video catches up (a settling video or a swap reads a
// little behind, and a line that runs back looks broken). A big jump forward is a skipped cut and is taken at once.
// Only reset() (a seek you make) or a new key (part) lets it go back. Pure: `now` (ms) is passed in.
// Spec: design/timeline.md § Playhead.

const SEEK = 0.25; // s: a reading this far ahead of the estimate is a jump, not drift
const AHEAD = 0.15; // s: never run further than this past the last reading (a stall); a small run-ahead, a small hold
const PULL = 0.5; // how far toward a new reading we move at once: the rest is eased over the next frames

export function createPlayClock() {
  let last = null; // { key, raw, at, out }

  return {
    /** The playhead time for `raw` (video.currentTime) at `now` ms; `key` (the part) resets it; paused = raw. */
    read(raw, now, { playing = true, rate = 1, key = 0 } = {}) {
      if (!playing || !(rate > 0)) { last = null; return raw; }
      if (!last || last.key !== key) { last = { key, raw, at: now, out: raw }; return raw; }
      const est = last.out + (Math.max(0, now - last.at) / 1000) * rate;
      const jump = raw - est > SEEK;
      let out;
      if (jump) out = raw; // a skipped cut: straight there
      else if (raw === last.raw) out = Math.min(est, raw + AHEAD); // no news: run on
      else out = Math.min(est + (raw - est) * PULL, raw + AHEAD); // news: ease toward it
      if (!jump) out = Math.max(out, last.out); // never step back
      last = { key, raw, at: now, out };
      return out;
    },
    reset() { last = null; },
  };
}
