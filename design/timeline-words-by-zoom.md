# Timeline words by zoom, cuts as blocks

Author: Jony · 2026-11-22 · Status: ready to build. Plan: `updates/2026-11-22 TIMELINE WORDS BY ZOOM - OPEN/update v1.md`.
Replaces the "Words", "Cut words" and cut-pause parts of `design/timeline-strip.md` and the "Cuts" line of
`design/timeline.md`. Tokens: `design/visual-system.md`.
Checked against `design/user-model.md`: goal 2 (trust every cut: see what's cut, at a glance, at any zoom) and goal 3
(throw away junk myself: find a cut and take it back without hunting).

## User goal
"Whatever the zoom, show me what I can actually read, and show me the cuts so clearly I can click one and undo it."

User feedback (first look at the strip): words read well when zoomed far in; zoomed out they are chopped mid-letter
and unreadable. Noise, not information.

## What I removed, and why
| Removed | Why |
|---|---|
| Words clipped to their slot (fragments) | A half word is noise. A word is drawn whole or not at all. |
| The strike line under cut words in the strip | Cut words are now under the cut block. The block says "cut" louder than a 1 pt line. The panel still strikes them. |
| The hatch on cut pause blocks | Same: the cut block covers them. One way to show a cut. |
| Pause blocks inside a cut (drawing and Tab stop) | They sit under the block and can't be clicked. Tab to the cut instead. |
| A zoom-level setting or toggle | The zoom is the setting. Three levels follow it on their own. |
| Words inside a cut block | The block is about the cut, not the words. Hover / the panel give the words. |

## The three levels
The level is one property of the zoom, the same for every part, so the strip reads the same everywhere.
It is measured in **points per word** (`ppw`): points per second at this zoom × average seconds per word
(`spw`: each part's span from first word start to last word end, summed, ÷ all words; computed when words change).
Typical talk: 2.5 words/s → `spw` ≈ 0.4.

| Level | When | Strip shows |
|---|---|---|
| **Words** | `ppw` ≥ 32 | Every word, at its start time, whole |
| **Phrases** | 4 ≤ `ppw` < 32 | The first words of each phrase: "So the first thing…" |
| **None** | `ppw` < 4 | No text. Pause blocks (≥ 2 pt) and the cut blocks show where things are |

Why these numbers: an 11 pt caption averages ≈ 5.5 pt per letter, so a typical word plus a gap is ≈ 28–32 pt. From
32 up, nearly every word fits its own room. Under 4, a 12-word sentence is under 48 pt: barely one short word, and the
phrases would flicker every few points. Fit on a 20-minute recording is ≈ 0.4 ppw: None, as it should be.

**Hysteresis** (no flicker while a pinch hovers on a line): go up to Words at 32, back down below 28; up to Phrases
at 5, back to None below 4.

### Rules for every label (both levels)
1. **Whole or nothing.** A label is drawn only if all of it fits its room. Never clipped, never mid-letter.
2. **No overlap.** A label's room runs from its x to the first **obstacle** minus a 6 pt gap. Obstacles: the next
   label, a visible pause block, a cut block, the part's end.
3. **Kept words only.** A word inside a cut is not laid out (it is under the block). A cut is an obstacle.
4. **At its time.** A label starts at its first word's start x (+1 pt). Nothing slides to make room.

### Words
Every kept word is a label of its own. Its room: to the next word's start, or to the pause/cut that follows.
A word that doesn't fit is skipped (rare from 32 ppw; zoom in a little and it appears).

### Phrases
Only **phrase starts** become labels (pure, computed when words change):
- the part's first word;
- a word after one ending a sentence (`.` `?` `!` `…`, closing quotes allowed — the same test as `blocks.js`);
- a word after a gap ≥ 0.4 s (`LOOSE_PAUSE`, for transcripts without punctuation);
- the first kept word after a cut.

A phrase label takes as many whole words from its start as fit its room, then "…" if the phrase goes on (the "…"
must fit too; drop the last word to make room). If not even the first word fits, the label is skipped. A phrase
stops at the next phrase start, a cut or a pause block.
Greedy, left to right, in time order: a skipped label frees its room for nobody (positions stay true to time).

### Transitions
- **Level change**: the old labels fade out while the new fade in, 150 ms, ease-out. The canvas draws both sets
  during the fade.
- **Inside a level**, while you zoom: a label that appears fades in over 120 ms; one that no longer fits goes at once
  (it leaves because something needs its room; a fading ghost would overlap).
- Labels are keyed by their first word's index, so a phrase that grows from "So the…" to "So the first…" is the
  same label: no fade, it just gains words.
- Reduce Motion: no fades; labels switch instantly.
- Colour: `caption` 11 pt, `text` 90 %. One style at every level.

## Cut blocks
Each cut is one block, **above** the words and the pause blocks, from the strip's top to the track's bottom.

```
│ 0:00        0:30   ▼    1:00                       │ ruler
│ So the first… ┌──────────┐ and then [0.8 s] we… ┌┐ │ strip  ← block starts here
│ ▁▃▅▃▁▂▆▇▅▂▃▅▆ │  2.4 s   │ ▃▅▆▃▁▁▂▅▇▆▃▁▁▃▅▆▃▅▃ ││ │ track
│               └──────────┘                      └┘ │        ← and ends here
```
- **Box**: top `STRIP.top` (32), bottom the track's bottom (128): 96 pt. Width from the cut's times, at least 2 pt
  (`MIN_W`). Radius 4 (2 when under 8 pt wide).
- **Fill**, bottom to top: `surface` at 72 % (the words and waveform under it become a faint ghost; the waveform near
  an edge is still there to cut by), then the owner's hatch (45°, 6 pt: yours grey 35 %, Magic coral 45 %, as today),
  then a 1 pt border all round in the owner's line colour (90 %).
- **Label**: the cut's length, "2.4 s", `caption` 11 pt tabular, in the owner's colour, centred on the strip row,
  when the block is ≥ 40 pt wide. Nothing else inside.
- **Hover**: hatch +10 % and the hover text as today (Magic's reason, or "Cut · 2.4 s").
- **Selected**: the 1.5 pt accent ring (outside the border) and the chip **Restore ⌫** above it, as today.
- **Edges**: the drag handles keep their 12 pt hit area and 4 × 40 pt grip, now full block height, centred.
- **Layers** (z, low to high): words canvas 1 · pause blocks 2 · **cut blocks 3** · selection fill 4 · playhead 5 ·
  chips and the part badge / ✕ 6. The part badge and ✕ stay readable on top of a cut at the part's start.
- Far zoomed out (None level) the blocks are the only marks on the strip: clear ticks where the edit happened.

### Interactions
| Do | Result |
|---|---|
| Click a cut block, anywhere in its height (strip row or track row) | Playhead to its start; the cut is selected |
| Tab | Cuts and the remaining pause blocks, in time order, per part. Focus selects |
| ⌫ / Delete on a selected cut | Restores the whole cut: one undo step, "Restored 2.4 s cut". The block fades out (120 ms) and the words fade back in. Focus goes to the part's group, so Tab carries on from there |
| ⌘Z | The cut is back, selected |
| Drag a block's edge | As today (`design/timeline.md`, Dragging an edge) |
| Press on a block and drag ≥ 4 pt | A time selection, as on the track |

A pause half inside a cut: drawn, the block covers the cut half; clicking the uncovered half selects the pause
(⌫ cuts the rest, same rule as before).

## States
| State | Strip | Cut blocks |
|---|---|---|
| No transcript yet / failed | Empty | Drawn as usual (strip row part of the block is just hatch) |
| Words arriving | Labels fade in as they come | — |
| A word fixed in the panel | Re-laid out at once (no fade for the same key) | — |
| Magic running | — | New blocks fade in (200 ms), coral |
| Edge drag | Labels re-lay out live; words leaving the cut fade in | The block grows/shrinks live |
| A cut closed by dragging | — | Fades out (120 ms) |
| Increase Contrast | Text 100 % | Border 2 pt, hatch +20 %, base 85 % |

## Accessibility
- Words on the canvas aren't read (as before: the transcript panel is the accessible text).
- A cut block keeps its button role and label: "Cut, 0:42.3 to 0:44.7, 2.4 seconds, by Magic Cut: earlier take.
  Backspace restores." The visible "2.4 s" is part of that label.
- Contrast: the length label on the block's ~72 % surface base: grey `textSecondary` ≥ 4.5 : 1, coral ≥ 3 : 1 (11 pt
  caption, tabular; if coral measures under 4.5, use `text` for Magic's label and keep the coral border).
- Hit target: a block under 12 pt wide still gets a 12 pt-wide invisible hit area, centred (neighbouring cuts: the
  nearer centre wins).

## Components (each its own file, tested on its own)
- `src/ui/word-levels.js` (pure, new): `secondsPerWord(wordsByPart)`, `levelFor(ppw, previous)` (hysteresis),
  `phraseStarts(words, cuts)`, `layoutLabels({ box, words, cuts, pauses, scroll, width, level, measure })` →
  `[{ key, x, text }]`. `measure(text)` is passed in, so tests use a fake (letters × 5.5).
- `src/ui/strip-view.js`: `drawStrip` paints the labels and runs the fades (alpha per key, level crossfade). No more
  clipping or strikes.
- `src/ui/cut-view.js`: the block (base, hatch, border, length label, hit area).
- `src/ui/timeline.js`: one cut layer per part spanning strip + track at z 3 (cuts leave the track frame); pause
  blocks inside a cut aren't made.
