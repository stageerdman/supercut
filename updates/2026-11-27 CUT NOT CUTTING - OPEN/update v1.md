# Cut not cutting — v1

**Goal:** any cut you see on the timeline is always skipped on playback. User report: "I added a cut but when I play
it, it just plays over the cut as if there's none there."

## Root cause

The player had a rule: **playing from inside a cut plays that cut** ("you asked to hear it", `through` in
`player.js`, `skipTarget(…, through)` in `playback.js`, `createJumps({ through })` in `jumps.js`). It guessed intent
from where the playhead *was*. But the ways of making a cut leave the playhead there themselves:

- Transcript: clicking a word seeks to its start; ⌫ then cuts a range that begins *before* it (mid-pause) → the
  playhead is inside the new cut.
- Timeline: clicking a pause block seeks to its start and selects it; ⌫ cuts it → playhead at the cut's start.
- Timeline: clicking a cut block seeks to the cut's start (`timeline.js` press `at: c.s`).
- Click-then-drag a selection: the click seeks to the selection start → Cut → playhead at the cut's start.
- Edge drag shows the frame at the edge while dragging (the release then seeks a second before the join: fine).

Then Space → the `play` listener runs `meant()` → `through = cutHere(…)` = the new cut → it plays. The preview path
does the same (`play()` falls back to the source when `cutHere`). Evidence: the user's project
(`projects/gva6ahztfxxm`) has cuts 0‥10.25 and 18.81‥21.43; the second starts on a snapped word/pause edge.

The edit model is not stale: player, timeline, preview and export all read `cutsNow()` (main.js). Export uses the same
`keptSpans`.

## Phases

1. **Fix** — delete the play-through rule. Playing from inside a cut starts at the cut's end (the landing, over any
   cut touching it); a cut to the end of a part goes to the next kept moment; all cut → nothing plays. The preview path
   plays from that landing too (no fallback to the source). Paused scrubbing inside a cut still shows its frames.
2. **Tests** (fail before, pass after) — player-level, with fake videos: play from just before, at, and inside a cut;
   a cut made around the resting playhead by each gesture's cut function (toggleWords, toggleRange, moveEdge,
   withMagic, fromDoc restore, undo/redo); preview path starts at the landing. Export spans = player's kept spans.
3. **Ship** — build, install (Start), push, release 0.1.7 to the update site like 0.1.6.

## Status

- [ ] Phase 1
- [ ] Phase 2
- [ ] Phase 3
