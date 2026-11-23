# Seamless cuts: update v1

## Goal
Playing over a cut leaves no pause. "Hey I'm Vlado, ~~nice to meet you,~~ let's go for it" plays as one sentence.
Done means the picture holds under one frame at a cut (measured), an automated test guards it, and the tests pass.

## Phases
1. **Measure (done).** A WebKit harness plays the real player and records every presented frame
   (`spike/measure.mjs`). Root cause found: seeking at the cut, or starting a paused audible video, freezes the
   picture ~300 ms. Facts: `wiki.md`.
2. **Twin that plays along (done).** A hidden twin plays inaudibly in step on the far side of the next cut. At the cut
   the two swap. Nothing seeks, starts or pauses there. Code: `src/ui/twin-sync.js` (pure), `src/ui/player.js`.
3. **Learned seek lag (done).** The twin's seeks land ~0.47 s behind. The lag is learned on its own clock after it
   settles (800 ms).
4. **Short kept stretches (done).** Where playing jumps moved into a pure module, `src/ui/jumps.js`. The last moment
   to correct the twin is `FIX_BEFORE` = `SETTLE` (0.8 s) + 0.05 s, so kept stretches from ~0.9 s swap too. Two
   twins were tried and measured worse (three decoders starve WebKit), so the player has one `twin`, no more.
5. **Review round 1 (done).** The measure counts any hold until 0.5 s after a cut as that cut's, runs N times and
   exits 1 unless all pass. Two holds right after a swap were found and fixed: a correcting seek too close to the cut
   (now none under `FIX_BEFORE`), and a twin started then seeked while young before the first cut (now seeked while
   still paused, then started). A swap waiting for its exact moment is dropped if you seek meanwhile.

## Status
- Measured, strict metric, 20 runs: 16 pass every cut. Cuts after stretches ≥ 1.2 s: clean in 79 of 80 crossings.
  After the 0.9 s stretch: 17 of 20. After the 0.8 s stretch: always seeks (the known limit). Details: `wiki.md`.
- Tests: `test/twin-sync.test.mjs`, `test/jumps.test.mjs`, the player tests in `test/timeline.test.mjs` (swap with
  no seek and no pause, part start parked, short stretch seeks on at once and swaps, out of step falls back, your
  seek voids a due swap).
- Limits: see `wiki.md`, Known limits. Not yet measured inside the Tauri app itself.

## Next
- Measure once in the real app (WKWebView) with a long, real recording.
- If stretches under 0.9 s matter, try a second twin that only plays during a short stretch. It would have to stop
  without `pause()` stalling the video you see.
