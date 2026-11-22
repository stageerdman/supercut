# Timeline words by zoom, cuts as blocks — v1

Feature: f-timeline-words-by-zoom-cuts-as-blocks. Design and roadmap: Jony.

## Goal
The words over the timeline are readable at every zoom: full words when zoomed in, the first words of each phrase
in the middle, no text far out. Never clipped mid-letter, never overlapping, with smooth changes between levels.
Each cut is its own block, above the words and pause blocks, clearly distinct; click it and ⌫ restores it.

## The design (read before building)
- `design/timeline-words-by-zoom.md`: the three levels (thresholds in points per word, hysteresis, label rules,
  fades) and the cut block (box, layers, label, interactions, states, access).
- It replaces the word/strike/cut-pause parts of `design/timeline-strip.md` and the "Cuts" line of
  `design/timeline.md` (both point to it).

## Shape (where the code goes)
| File | What |
|---|---|
| `src/ui/word-levels.js` (new, pure) | `secondsPerWord`, `levelFor` (hysteresis), `phraseStarts`, `layoutLabels` |
| `src/ui/strip-view.js` | `drawStrip` paints the labels and runs the fades; clipping and strikes go |
| `src/ui/cut-view.js` | The cut block: base, hatch, border, length label, hit area |
| `src/ui/timeline.js` | A cut layer per part over strip + track (z 3); no pause blocks inside cuts |

## Roadmap
Each phase ends with tests that lock it in. "Check in the window" means a person opens the app (`npm run dev`);
agents can't see the screen, so say so in Status when that hasn't happened.

### Phase 1 — Layout by level (pure, `word-levels.js`)
Levels from points per word, with hysteresis; phrase starts; greedy whole-word layout with obstacles.
Tests (`test/word-levels.test.mjs`, fake `measure` = letters × 5.5):
- `secondsPerWord` over two parts; no words → none.
- `levelFor`: 40 → words, 20 → phrases, 2 → none; hysteresis: from words, 30 stays words, 27 drops; from none, 4.5
  stays none, 5 rises.
- `phraseStarts`: part start, after `.` `?` `!` `…` (with a closing quote), after a ≥ 0.4 s gap, first kept word
  after a cut; nothing else.
- `layoutLabels`, at each level, over a fixture talk (≥ 60 words, two cuts, three pauses):
  **no two labels overlap** (with the 6 pt gap); **every label fits its room whole** (`measure(text)` ≤ room);
  **no label starts inside or runs into a cut**, a visible pause block or past the part end; every label's x is its
  first word's start x + 1; phrases end in "…" only when the phrase goes on and the "…" fits; none level → `[]`.
- Fit zoom on a 20-minute part → none; a 10-second view → words.

### Phase 2 — Drawing and transitions (`strip-view.js`)
`drawStrip` uses `layoutLabels`; alpha per key: new keys fade in 120 ms, a level change crossfades 150 ms, Reduce
Motion switches at once. A measured-width cache per word string. No `clip()` or strike lines left.
Tests (fake canvas context recording calls; a fake clock):
- three zooms on the fixture → the `fillText` strings are exactly the layout's labels; no `clip` calls.
- a new key starts at alpha 0 and reaches 1 by 120 ms; the same key growing a word keeps alpha 1.
- crossing a level draws both sets for 150 ms, then only the new one; with Reduce Motion, only the new one at once.

### Phase 3 — Cut blocks (`cut-view.js`, `timeline.js`)
Cuts move from the track frame to a per-part layer from `STRIP.top` to the track's bottom, above pauses (z 3).
Base + hatch + border, "2.4 s" label from 40 pt, 12 pt minimum hit area, pauses fully inside a cut not made (not
drawn, not in Tab order). Restore by ⌫ fades the block out, focus to the part's group. Part badge and ✕ stay on top.
Tests (fake DOM, as `test/timeline.test.mjs`):
- a cut element's top = `STRIP.top`, height = 96, its layer's z above the pause lane's.
- the label shows at 40 pt, not at 39; the block is ≥ 2 pt wide; its hit area ≥ 12 pt.
- a pause inside a cut makes no element; one half inside still does.
- a click at strip height over a cut selects the cut (not a seek-only); ⌫ → one history step "Restored 2.4 s cut",
  the cut is gone, focus is on the part group; ⌘Z → it's back, selected.
- existing edge-drag and Tab-order tests still pass.

### Phase 4 — Docs and check in the window
Mark the strip and timeline specs as superseded where this replaces them (done in the design step), update Status
here, add what we learn to `wiki.md` and `design/user-model.md` (A14, A15).
Test: `npm run test:ui` all green.
Check in the window: pinch from fit to full zoom and back on a real 20-minute recording; no text ever cut
mid-letter or overlapping, no flicker at the two thresholds; a Magic run's cuts read at a glance at fit; click a cut,
⌫, ⌘Z.

## Out of scope (on purpose)
- Words inside cut blocks, or a hover preview of the cut's words (the panel already shows them struck).
- Changing the pause rules, the waveform, or the zoom gestures.
- Per-part levels (one level for the whole timeline).

## Status (2026-11-22)
- Roadmap and design written (Jony): this file, `design/timeline-words-by-zoom.md`; `design/timeline-strip.md`,
  `design/timeline.md` and `design/user-model.md` point to it.
- Next: Phase 1.

## Decisions
- **Levels by points per word, not seconds on screen.** A fast talker needs more room; ppw follows the talk.
- **One level for the whole timeline**, from the average over all parts: the strip reads the same everywhere.
- **Whole or nothing.** A word or phrase that doesn't fit is skipped; labels never slide off their time to make room.
- **Cuts cover their words.** The block is the one sign of a cut on the timeline; strikes and cut-pause hatching go.
- **Thresholds 32 and 4 ppw, ±(28 / 5) hysteresis.** Reasoned from an 11 pt caption (~5.5 pt per letter); check A14.
