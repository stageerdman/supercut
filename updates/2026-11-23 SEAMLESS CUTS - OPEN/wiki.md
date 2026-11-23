# Seamless cuts: measured facts

Measured in WebKit (Playwright's build, macOS) with the real `src/ui/player.js`, on a 30 fps test clip.
Harness: `spike/` (`serve.mjs` serves the repo and makes the clip, `GOP=30|120`; `page.html` plays it; `measure.mjs`
prints, per run, the worst hold at each cut from the last frame before it until 0.5 s after it, plus any other hold
over one frame, and exits 1 unless every run passes; `probe*.html/mjs` are the single-question probes).
Run: `RUNS=10 node "updates/2026-11-23 SEAMLESS CUTS - OPEN/spike/measure.mjs"` (`FROM=0` starts playing at 0 s
instead of 2 s; `LOG=1` prints each video's events). Cuts after a kept stretch under `FIX_BEFORE` show as `limit`.

## Root cause of the old freeze
- The old code waited at the cut, then seeked the playing video (or swapped to a paused spare and called `play()`).
- Seeking a playing video holds its picture while it decodes from a keyframe: ~300–400 ms.
- A paused, audible video takes ~300 ms from `play()` until its picture moves. Swapping to a paused spare moved the
  freeze, it didn't remove it.

## What disturbs the video you see
- On **either** video, these stall the **other** one's picture for 50–130 ms: volume 0 → 1, mute/unmute, `pause()`,
  pause + play, and changing `playbackRate` while playing. Probe 3, pause+play: 83–116 ms gaps.
- These don't disturb it: a hidden twin at volume 1e-4 (not 0: WebKit treats 0 as off) going to 1 while the old one
  goes to 1e-4, an opacity swap, a seek in the hidden twin while it plays, and `play()` on a hidden quiet twin.

## A seek while playing (hidden twin)
- It lands ~0.47 s behind where it was sent (0.41–0.50 across runs; one run's consecutive seeks agree within ~10 ms,
  with a rare ~90 ms step). So the lag is learned per seek (`seekLoss`), on the twin's own clock: the video you see
  stands still now and then, so it is no reference.
- After the seek: the clock runs ~0.3 s, stands ~0.3 s, and runs steady by ~0.8 s (`SETTLE`).
- A seek begun 0.7 s before the cut froze the picture ~80 ms right after the swap: hence `FIX_BEFORE` = `SETTLE` + 0.05.
- A twin started and then seeked while playing, ~1.1 s before the first cut after you press play, held ~50–120 ms
  right after the swap in 9 of 10 runs. Seeked while still paused, then started, it held in 1 of 20.
- The keyframe interval (1 s vs 4 s) makes no difference.

## Results (6 cuts: 4-6, 7.5-8.2, 9.5-13, 14.2-15.1, 16-16.5, 17.3-18; kept stretches 0.9 s and 0.8 s before the last two)
| Version | Hold at each cut beyond one frame | Long holds anywhere | Edited clock behind wall |
|---|---|---|---|
| Original (seek at the cut) | ~300 ms each | at every cut | 1.3–1.9 s |
| One twin, `FIX_BEFORE` 1 s | ≤ 0 ms on the first 4; last 2 seek (~400 ms) | 2 | ~560 ms |
| Two twins | 70–120 ms each, most cuts seek | 8 | ~1.5 s |
| One twin, `FIX_BEFORE` 0.75 s (old metric: the cut's own gap only) | ≤ 1 ms on all 6, in 2 of 3 runs | ~80 ms after the first swap | 6–34 ms |
| **One twin, paused seek, `FIX_BEFORE` 0.85 s** (shipped; strict metric: a cut's hold counts until 0.5 s after it) | see below | see below | ~380–560 ms (the 17.3-18 fallback) |

Shipped version, strict metric, 20 runs (10 starting at 2 s, 10 at 0 s): **16 of 20 runs pass every cut**, with the
17.3-18 cut (after a 0.8 s stretch) counted as the known limit and listed apart.
- 4-6, 7.5-8.2, 9.5-13, 14.2-15.1 (stretches ≥ 1.2 s): clean in 79 of 80 cut crossings. The one miss is an 86 ms hold
  right after the first cut, 2 s after pressing play.
- 16-16.5 (after a 0.9 s stretch): clean in 17 of 20. The twin may swap in up to 0.1 s off, so sometimes less than
  `FIX_BEFORE` is left and the cut seeks (~0.4 s).
- 17.3-18 (after 0.8 s): seeks every time (~0.35 s), as designed.

## Known limits
- A kept stretch under 0.85 s between cuts seeks (~0.4 s hold); about 0.9 s is a toss-up. A cut right after you seek
  also seeks.
- A jump that lands on a part's start (t = 0) parks the twin paused, and the cut starts it. Its start lag is about
  the wait for the cut, so it is near seamless, not measured as tightly.
- The hidden twin keeps decoding while you play: one extra decoder. Pausing it would stall the video you see.
- Only measured in Playwright's WebKit, not inside the Tauri app's WKWebView (same engine, not the same build).
