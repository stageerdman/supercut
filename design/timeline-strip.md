# The transcript strip (on top of the timeline)

Author: Jony · 2026-11-22 · Status: built. Builds on `design/timeline.md` and `design/edit-model.md`.
**Superseded in part** by `design/timeline-words-by-zoom.md`: words are drawn whole by zoom level (no clipped
fragments), cut words and cut pauses sit under the cut block (no strike, no hatch here). Pauses are unchanged.
**Also** `design/missed-words.md`: pauses come from the audio's speech runs (not word gaps), and speech with no words
shows as a dotted "unheard" block you can select, cut and type into.
Checked against `design/user-model.md`: goal 2 (trust every cut: see what's said where you cut) and goal 3 (throw away
junk myself: dead air is the most common junk in a talking-head take).

## User goal
"See what I'm saying at this point of the timeline, and kill a long silence in one move."

## What I removed, and why
| Removed | Why |
|---|---|
| Clickable words in the strip | The transcript panel is where words are selected and fixed. Two places to select words is two ways to do one thing. A click on a word seeks, like the ruler. |
| A "Remove all pauses" button | Not asked for, and it's Magic's job (it already cuts dead air with reasons). Revisit if people ⌫ pause after pause. |
| A pause threshold setting | One good default (below). |
| Pauses in the transcript panel | The panel is for reading; the strip shows timing. |

## Layout
```
│ 0:00        0:30   ▼    1:00                │ ruler 20 (top 8)
│ Hi there so [ 0.8 s ] yes we [  ] then      │ strip 20 (top 32): words at their times, pause blocks
│ ▁▃▅▃▁▂▆▇▅▂░░░░░░▃▅▆▃▁▁▂▅▇▆▃▁│▁▃▅▆░░░       │ track 72 (top 56)
```
Timeline grows 128 → 152 pt (strip 20 + gap 4).
- **Words**: `caption` 11 pt, `text` 90 %, drawn on the timeline canvas (visible range only). Each word is clipped to its
  slot (its start → the next word's start, or a breath past its end before a pause). Zoomed out you see fragments; under
  4 pt a word draws nothing and only the pause blocks show where speech is.
- **Cut words**: `textSecondary` 50 % with a 1 pt strike in the owner's colour (grey yours, coral Magic's), as in the
  transcript panel.
- **Pauses**: a block, radius 3, inset 2 pt top and bottom, `textSecondary` 14 %. Its length ("0.8 s", tabular) when
  it's ≥ 36 pt wide. **Cut**: the cut's hatch in the owner's colour, no label.
- **Selected pause**: 1.5 pt accent ring, plus the usual selection fill over strip + track and the chip **Cut ⌫**
  (or **Restore ⌫**).
- The selection fill now covers the strip as well as the track, so words selected in the transcript light up here too.

## What a pause is (pure: `src/ui/pauses.js`)
- Between two words: from 0.1 s after the first word to 0.1 s before the next (`BREATH`). Cutting it leaves 0.2 s at the
  join, so the words never butt together.
- Before the first word: from 0 to a breath before it. After the last: from a breath after it to the part's end (a trim).
- Shown only if ≥ 0.2 s (`MIN_PAUSE`); shorter gaps are just speech.
- Recomputed from the edit's words, so a fix in the transcript moves the pauses at once.

## Interactions
| Do | Result |
|---|---|
| Click a pause | Playhead to its start; the pause is selected |
| Tab onto a pause | It's selected (pauses are in Tab order, by time, per part) |
| ⌫ / Delete | The one toggle rule: not all cut → cut it, `by: 'you'` ("Cut 0.8 s pause", one undo step). All cut already → restore it ("Restored 0.8 s pause") |
| Click a word or a blank in the strip | Seek there, like the ruler; drag scrubs |
| Press on a pause and drag ≥ 4 pt | A time selection, like on the track |

A pause half inside a word cut (word cuts reach to the pause middle) counts as not cut: ⌫ cuts the rest of it.
Decision: ⌫ on an already-cut pause restores it rather than doing nothing. Same rule as every other selection, and the
chip says so before you press.

## States
| State | Strip |
|---|---|
| Transcribing / no words | Empty; the track works as before |
| Transcript failed | Empty |
| Zoomed out | Fragments of words; pauses as thin blocks (≥ 2 pt so none is invisible) |
| Edge drag in progress | Words strike/unstrike and pauses hatch live |

## Accessibility
- Each pause: `role="button"`, "Pause, 0.8 seconds, at 0:42.3. Backspace cuts it." / "…, cut. Backspace restores."
- The lane is a group, "Pauses in part 1". Words on the canvas aren't read: the transcript panel is the accessible text.

## Components
- `pauses.js` (pure): `pauses(words, length)`, `pauseCut(p, part, cuts)`.
- `strip-view.js`: `stripWords` (pure layout), `drawStrip` (canvas), `pauseView` / `pauseLabel` (one block).
- `timeline.js`: one lane per part, click/Tab select; ⌫ goes through `toggleSelection` in `main.js` as before.
