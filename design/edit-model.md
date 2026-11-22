# The edit model: one truth behind the timeline and the transcript

Author: Jony · 2026-11-22 · For: Uncle Bob (builds it), Jony (views on top). Roadmap: `updates/2026-11-22 MANUAL EDITING - OPEN/update v1.md`.
Pure JS, no DOM, every rule a unit test. The timeline and the transcript are two **views** of this; neither keeps its own copy.

## User goal
"What I cut is what goes, wherever I cut it, and I can always take it back." The user never thinks about two views.
They cut a word and the timeline shows it; they drag an edge and the words strike. One model makes that automatic.

## Time
- **Source time**: seconds in one part's own file. Cuts, words, selection, playhead and timeline all use it.
- **Edited time**: seconds in the finished video (cuts removed, parts back to back). Used only by the readout and
  playback, and only through `playback.js`.

## The state
```js
edit = {
  cuts:  [{ part, s, e, by: 'you' | 'magic', reason? }], // per part: sorted, never overlapping, each ≥ 1 frame
  words: { [partId]: [{ w, s, e, fixed? }] },            // starts as the transcript; fixes replace entries
}
```
`by` replaces today's "has a `reason` = Magic" test. `reason` stays for the hover text, also on a Magic cut that became yours.
A frame is 1/30 s (`FRAME` in `bit.js`) until we read the real frame rate.

## Rules

### normalize(cuts) — runs after every change
Per part: sort by `s`; merge cuts that overlap or leave less than a frame between them; drop cuts shorter than a frame;
clamp to `[0, duration]`. A merge is `by: 'you'` if any piece was yours (the user touched it).

### Cutting words — cutWords(cuts, part, picked, allWords)
A cut made from words runs from the **middle of the pause before** the first word to the **middle of the pause after**
the last one. That leaves one natural pause at the join instead of two. Cutting a part's first word starts the cut at
0, cutting its last word runs it to the part's end: that's a trim, and the silence there is never wanted. A word is
cut when its middle is inside a cut (as today).

### toggle — the one ⌫ rule, for words and for time ranges
If everything selected is already cut → restore it (take the range out of every cut, splitting a cut that spans past
it; the pieces keep their owner and reason). Otherwise → cut it, `by: 'you'`.

### moveEdge(cuts, cut, side, t)
- Clamped to the part. The edge may cross its own other edge: the cut gets shorter, and under a frame it's gone
  (restored).
- Into a neighbouring cut: they merge (by `normalize`).
- Any move on a Magic cut makes it `by: 'you'` (keeps `reason`).
- The cut is found by identity at drag start; during a drag, the view calls `moveEdge` on the **drag-start** list
  each move, so nothing accumulates.

### withMagic(cuts, magicCuts) — a Magic run
Drop the old `by: 'magic'` cuts; keep yours (incl. Magic cuts you changed). Add the new ones, minus any time already
cut by you. One history step labelled "Magic Cut".

### fixWords(words, from, to, text) — fixing and adding words
Replace words `from..to` (inclusive) with the words in `text` (split on spaces). Their times share the old span
`[words[from].s, words[to].e]` in proportion to letter count. Each new word gets `fixed: true`. Empty `text` = no change.
Cuts don't move: a fixed word inside a cut is still cut. Magic gets the fixed words next time (`ai.js` already sends
`words` from the state).

## Selection — selection.js
One selection for the whole screen: `{ part, s, e }` in source time, or `null`. A selected cut is a selection that
equals the cut (`{ part, s, e, cut: true }`).
- From the transcript: the words' range (word starts and ends, not the gap midpoints).
- From the timeline: the dragged range, clamped to the part where the drag began.
- `wordsIn(selection, words)`: words whose middle is inside, so both views highlight the same words.
- Cleared by Esc, by a click on nothing, and after ⌫.

## History — history.js
Undo/redo over the whole `edit` (cuts **and** words). Each entry: `{ edit, label }`.
- **One user gesture = one step**: a ⌫, a whole edge drag (down → up), a run of keyboard nudges on one edge (until focus
  leaves it), a fix commit, a Magic run.
- Labels, short and plain: "Cut 3 words", "Cut 2.4 s", "Restored 2.4 s", "Changed a cut", "Fixed “gonna”", "Magic Cut".
- `changed(a, b)` → `{ part, s, e }` that differs between two states, so undo can bring it into view.
- `forget(part)` stays (removing a part wipes it from history; removing isn't undoable).
- A new edit clears redo. No limit needed at this size (a 30 min file is ~5 000 words; only the changed part's
  array is new per step).

## Playback — playback.js
- `keptSpans(parts, cuts)` → `[{ part, s, e }]` in play order. Export will read the same list.
- `skipTarget(part, t, cuts, through)` → where to be next frame: inside a cut → its end; a cut to the part's end → the
  next part's first kept time; to the very end → stop there and pause.
- **Playing from inside a cut plays that cut** (you asked to hear it), then skips the rest as normal. `through` is that
  cut until the playhead leaves it.
- `editedTime(parts, cuts, part, t)` and `editedLength(parts, cuts)` for the readout. Inside a cut, edited time is the
  time of the join.
- The player checks every frame (`requestVideoFrameCallback`, per the Phase 0 spike), not on `timeupdate` (4×/s runs
  a quarter second into a cut).

## What the views do with it
| User does | Model call | Views |
|---|---|---|
| ⌫ on words or a range | `toggle` → `push` | transcript strikes/unstrikes, timeline hatches/clears |
| drags an edge | `moveEdge` on drag-start list each move; `push` once on release | both repaint live |
| types a fix | `fixWords` → `push` on commit | transcript text; timeline unchanged |
| Magic finishes | `withMagic` → `push` | both |
| ⌘Z / ⇧⌘Z | `undo` / `redo`, `changed` | both repaint; the changed range scrolls into view; status says the label |
| plays | `skipTarget` each frame | playhead moves; lit word follows |
