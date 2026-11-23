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
   to correct the twin dropped from 1 s to 0.75 s, so kept stretches down to ~0.8 s swap too. Two twins were tried
   and measured worse (three decoders starve WebKit), so the player keeps one, behind `SPARES` in `player.js`.

## Status
- Measured: all 6 test cuts hold ≤ 1 frame, with no long holds anywhere, in 2 of 3 runs. In the third, the 0.8 s
  stretch fell back to a seek. Edited clock 6–34 ms behind the wall clock (was 1.3–1.9 s).
- Tests: `test/twin-sync.test.mjs`, `test/jumps.test.mjs`, the player tests in `test/timeline.test.mjs` (swap with
  no seek and no pause, part start parked, short stretch seeks on at once and swaps, out of step falls back).
- Limits: see `wiki.md`, Known limits. Not yet measured inside the Tauri app itself.

## Next
- Measure once in the real app (WKWebView) with a long, real recording.
- If stretches under 0.75 s matter, try a second twin that only plays during a short stretch. It would have to stop
  without `pause()` stalling the video you see.
