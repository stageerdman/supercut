# Manual editing, CapCut-style — v1

Feature: f-manual-editing-capcut-style. Lead: Jony. Builders: Uncle Bob (engine, Rust, playback) and Jony (screen).

## Goal
Let people edit by hand, properly. You see the whole recording on a timeline under the video, with the kept
and the cut parts. You drag a cut's edges to change how much it removes. Next to it is the transcript: delete words
and that part of the video goes; type to fix or add words. Magic Cut's cuts are ordinary cuts you can change.
Undo and redo cover everything, playback skips the cuts, and the playhead, timeline and transcript always agree.

## The design (read these before building)
- `design/edit-model.md`: the one shared model (cuts, words, selection, history, playback). Pure logic, no DOM.
- `design/timeline.md`: the timeline under the video (ruler, waveform, cuts, edges, playhead, zoom).
- `design/transcript-editing.md`: the transcript next to the video (cut words, fix words, follow the playhead).
- `design/main-screen.md`: updated where these replace older text (state 6, keyboard table).

## Shape (where the code goes)
| File | What | Owner |
|---|---|---|
| `src/ui/cuts.js` | Cut list rules: `normalize`, `cutRange`, `cutWords`, `moveEdge`, `withMagic`, `cutAt` | Uncle Bob |
| `src/ui/fix.js` | `fixWords(words, from, to, text)`: new text, times spread over the old span | Uncle Bob |
| `src/ui/history.js` | Undo/redo over the whole edit state, labelled steps, `changed(a, b)` | Uncle Bob |
| `src/ui/playback.js` | `keptSpans`, `skipTarget`, `editedTime`, `editedLength`: pure | Uncle Bob |
| `src/ui/player.js` | Uses `playback.js` to skip cuts on every frame | Uncle Bob |
| `src-tauri/src/waveform.rs` + command `waveform` | Peaks per part, from the bundled ffmpeg | Uncle Bob |
| `src/ui/selection.js` | The one shared selection, words ↔ time | Jony |
| `src/ui/timeline-geometry.js` | time ↔ x, zoom, `snap`, `bit` | Jony |
| `src/ui/timeline.js` (+ `waveform-view.js`, `cut-view.js`) | The timeline view | Jony |
| `src/ui/transcript.js` (+ `fix-field.js`) | Transcript editing and following | Jony |
| `src/main.js` | Holds the edit state, wires the views. Stays thin | both |

## Roadmap
Each phase ends with tests that lock it in. "Check in the window" means someone opens the app (`npm run dev`) and
does it by hand; agents can't see the screen, so say so in Status when that hasn't happened.

### Phase 0 — Research: playback that skips cuts (spike, Uncle Bob)
New ground: does a single `<video>` in WebKit jump over a cut cleanly enough?
- Spike in `updates/2026-11-22 MANUAL EDITING - OPEN/skip-spike/`: a plain HTML page + one sample video, opened in
  Safari (same WebKit as the app's web view). Outside the main code.
- Try A: `requestVideoFrameCallback`; when the next frame is inside a cut, set `currentTime` to the cut's end.
  Try B (only if A is bad): two `<video>` elements, the next kept span preloaded and paused in the other one, swap.
- Measure: how far playback runs into a cut before the jump (target ≤ 1 frame), and the silence/stall at the join
  (target ≤ 80 ms, no click). 20 cuts in 60 s.
- Done when `wiki.md` says which approach the player uses and why. Test: none (it's a spike), numbers in the wiki.

### Phase 1 — The edit model (pure JS, Uncle Bob)
Everything in `design/edit-model.md` except playback: cut list rules, word cuts that take half the pause on each side,
edges that move/merge/vanish, Magic cuts that become yours when you change them, word fixes, the labelled history
over `{ cuts, words }`. `main.js` moves to the new history; the current Backspace/⌘Z behaviour keeps working.
Tests (`test/edit.test.mjs`): normalize (sort, merge overlaps, drop < 1 frame, ownership on merge); `cutWords` gap
midpoints, first word of a part → from 0, last → to the end; **cut words, ⌫ again leaves no cuts** (restore uses the
same `wordRange`); `toggleCut` restore splits; `moveEdge` clamp, merge into a neighbour,
close to nothing, Magic → yours; `withMagic` keeps yours and edited ones, subtracts yours from Magic's; `fixWords`
one → one, one → three (times by length), many → one, empty = no change; history push/undo/redo/labels, one step per
call, redo cleared by a new edit; removing a part is one step and `rename(old, new)` swaps its id through past and
future (replaces `forget`); a selection is clamped to the part it began in; `changed(a, b)` gives the range that differs.

### Phase 2 — Playback that skips cuts (Uncle Bob)
`playback.js` + the player, using Phase 0's approach. Readout shows edited time (`01:12 / 23:40`, hover: original).
Tests: `keptSpans` across two parts; `skipTarget` (cut ahead → its end; cut to part end → next part's first kept
time; cut to the very end → stop; started inside a cut → play it through, skip the next ones); `editedTime` /
`editedLength`; the player against a fake `<video>` (frame callbacks, seeks, part change).
Check in the window: play a file with three cuts and listen to the joins.

### Phase 3 — Waveform (Rust, Uncle Bob)
Command `waveform { id }` → `{ perSecond: 100, peaks: [0‥255] }`, decoded with the bundled ffmpeg right after a part
is added (not waiting for the transcript queue). Register it in `generate_handler!`.
Tests (Rust): peaks length = duration × 100 (± 1), silence → 0s, a full-scale tone → ≥ 250, a missing file → the
plain error; UI: the command name is registered (like the rules test).

### Phase 4 — The timeline view (Jony)
Ruler, one track per part with waveform, cuts drawn yours/Magic, playhead, click to seek, drag to select a time range,
⌫ on a range or a selected cut, the shared selection, zoom (fit default, ⌘+ / ⌘−, pinch, slider) setting `bit`,
following the playhead while playing. Replaces today's name tiles (badge, remove ✕ and add-slot stay). The ✕ becomes undoable: ⌘Z re-adds the file
with `add_video` and renames the id in the history (`design/edit-model.md`, History); a missing file → today's
"Can't find …" banner.
Tests: remove a part with cuts and a fix, ⌘Z → it's back with all of them, ⇧⌘Z removes it again (fake `invoke`);
`timeline-geometry.js` (time ↔ x at several zooms, fit, zoom anchored on the playhead, `bit` = 4 pt, never
under a frame); `selection.js` (words → range → words, a range clamps to one part); range ⌫ uses the same rule as
words (all cut → restore, else cut); render tests with a fake DOM like the rules panel's (cuts become elements with
the right labels and colours, selected cut shows "Restore ⌫").
Check in the window: zoom, scroll, select a range, ⌫, ⌘Z.

### Phase 5 — Cut edges (Jony)
Hover → handle, drag → live: the cut grows or shrinks, transcript strikes/unstrikes words as you go, the player shows
the frame at the edge, a chip says the cut's length. Snap to word edges, playhead and part ends; ⌥ drags free.
Trim = dragging a part's outer edge inward. Release: one undo step, playhead waits 1 s before the join.
Edges are keyboard sliders (← → one bit, nudges in a row = one undo step).
Tests: `snap` (nearest target within 8 pt, ⌥ off, no transcript → only playhead/ends); a drag sequence
(down/move/move/up) → exactly one history step with the final cut; drag into a neighbour merges; drag closed restores;
drag on a Magic cut makes it yours; keyboard nudges group into one step; edge `aria-valuetext` reads the time.
Check in the window: drag ten edges on a Magic Cut result; everything struck in the transcript matches.

### Phase 6 — Transcript editing (Jony)
Click selects and seeks (keeps play/pause), drag/⇧-click extends, ⌫ cuts or restores, typing or double-click or
Return opens the fix field, Return/click away commits, Esc cancels. Yours struck grey, Magic's struck coral.
The lit word follows the playhead and the panel scrolls with it unless you scrolled in the last 4 s.
Selections show on the timeline and the other way round.
Tests: the key map (which key does what, in and out of the fix field); a fix commits one undo step and reaches
Magic's input (`ai.js` sends the fixed words); follow-scroll pauses after a manual scroll and resumes; cut colour by
owner; a timeline range selects the right words.
Check in the window: fix a misheard word, add a missing one, cut a sentence, ⌘Z all three.

### Phase 7 — Sync, undo and access pass (Jony, Uncle Bob reviews)
Undo/redo bring the change into view (timeline + transcript scroll, no seek) and say what they did in the status
line ("Undo · Cut 2.4 s"). Full keyboard path: cut, nudge, restore, fix without a mouse. VoiceOver labels from the
specs. Reduce Motion. Update `design/user-model.md` with what we saw.
Tests: undo/redo labels and `changed` scroll targets; a keyboard-only script through the main path (fake DOM);
every new command the UI calls is registered in Rust.
Check in the window: one full edit of a real recording, keyboard only, then with VoiceOver on for a minute.

## Out of scope (on purpose)
- Saving the project to disk (no project file exists yet; edits live until the window closes, like today).
- Export (its own update; it will read `keptSpans`).
- Thumbnails on the track (talking-head frames all look alike; the waveform is what you cut by).
- Moving or reordering pieces, a razor tool / `S` split, multiple tracks, captions, effects.
- Folding long cut runs in the transcript. Revisit if struck text gets hard to read (assumption A9).

## Status (2026-11-22)
- Roadmap and design written (Jony): this file, `design/edit-model.md`, `design/timeline.md`,
  `design/transcript-editing.md`; `design/main-screen.md` and `design/user-model.md` updated.
- **Phase 1 done (Uncle Bob).** Pure JS, as designed (Pixel confirmed JS over the brief's first "Rust", and no
  saving yet: the edit is plain JSON-safe data so saving can come later). Files: `src/ui/cuts.js` (normalize,
  wordRange, toggleWords, toggleRange, cutRange/restoreRange, moveEdge, withMagic, cutAt/isCut), `src/ui/fix.js`
  (fixWords), `src/ui/edit.js` (the `{ cuts, words }` state: withWords, withoutPart, renamePart),
  `src/ui/history.js` (labelled steps, `everywhere`, `rename`, `changed`). `main.js` uses them: ⌫ makes a
  labelled step, Magic's result is one "Magic Cut" step, the ✕ is one "Removed part N" step and ⌘Z re-adds the
  file (Rust `add_video` now says "Can't find my-video.mov." when it's gone). `forget` and `toggleCut` are gone.
  Tests: `test/edit.test.mjs` (23), `npm run test:ui` 51/51, `npm run test:rust` 80/80.
  Not done here: `selection.js` (Jony, Phase 4; `main.js` takes the first part of a transcript selection until
  then). Not checked in the window yet.
- **Phases 2, 3, 4 and 5 done (Jony, in one item).** Phase 0's spike was skipped: the player goes straight to
  approach A (`requestVideoFrameCallback`, jump to the cut's end when the next frame is inside it).
  Files: `src/ui/playback.js`, `src/ui/player.js` (skips cuts per frame, edited-time readout),
  `src-tauri/src/waveform.rs` + command `waveform` (`audio::decode_at`), `src/ui/timeline-geometry.js`,
  `src/ui/edge-drag.js`, `src/ui/cut-view.js`, `src/ui/waveform-view.js`, `src/ui/timeline.js` (`createTimeline`).
  `main.js`: live cuts during a drag, one history step on release, ⌘+ / ⌘− / ⌘0 zoom, ⇧← / ⇧→ grow a selection,
  Esc, ⌫ uses the timeline selection first (same `toggleRange` rule), undo scrolls `changed` into view.
  `index.html`: zoom − slider + in the transport row, `#timeline` a 128 pt horizontal scroll box.
  Tests: `test/timeline.test.mjs` (24), `npm run test:ui` 75/75, `npm run test:rust` 84/84.
  **Not checked in the window** (agents can't see the screen): the joins, drag feel, zoom and scroll all need a person.
  Not done here: `selection.js` (a timeline range highlighting transcript words, Phase 6), Reduce Motion fades,
  Increase Contrast, the hatch fade while dragging an edge.
  Known limits: a long file's waveform decodes the whole audio at 8 kHz (a few seconds before it shows); a part's
  trim-end handle is hidden until its duration is known; refocusing an edge after a repaint during nudges relies
  on a `painting` flag (WebKit's focus-on-removal behaviour untested).
- **Phase 6 done (Jony).** Files: `src/ui/selection.js` (`wordsIn`, `wordSelection`, `toggleSelection`: the one
  ⌫ rule for words, ranges and cuts), `src/ui/transcript.js` (`createTranscript`: a view like the timeline, no
  cuts or selection of its own), `src/ui/fix-field.js` (`fixStep` + the inline field), `src/ui/follow.js` (4 s
  pause, comfortable band, a third from the top). `edit.js` gains `partsWithWords` (what the views and Magic read).
  The timeline holds the one selection: the transcript sets it with `timeline.select`, and `onSelect` repaints the
  transcript, so a word selection shows as a range on the timeline and a dragged range highlights its words.
  Native text selection is gone from the panel (the words are the selection); the old `selectedWords()` went with it.
  Tests: `test/transcript.test.mjs` (15), `npm run test:ui` 90/90.
  **Not checked in the window**: drag-select feel, the fix field in WebKit (`contenteditable="plaintext-only"`,
  blur on click-away), smooth follow-scroll. Typing a letter opens the fix field only when focus is in the panel
  (clicking a word puts it there); a range picked on the timeline needs a click in the panel before typing.
- Next: Phase 7.

## Decisions
- **One time base: source time.** Timeline, transcript and cuts all speak seconds in each part's own file. Only the
  readout and playback speak edited time. Nothing converts back and forth except `playback.js`.
- **The timeline shows the whole recording, cuts in place** (hatched, full width), instead of the collapsed slivers in
  the first screen spec. You can only drag an edge you can see, and the transcript already shows cut words in place;
  the two views now match one to one. The readout gives the edited length.
- **No clips, no razor.** A cut is a range. Making one is: select (words or time) + ⌫. `S` split is gone: with
  ranges there is nothing to split.
- **⌫ never deletes text.** Outside the fix field, ⌫ cuts (or restores). Inside it, ⌫ edits letters. One rule each.
- **Fixing text never touches the video**, and cutting never changes text.
- **A cut you touch is yours.** Dragging a Magic cut's edge makes it yours (grey), so the next Magic run won't take it.
- **⌫ twice gets back exactly what was there.** Word cuts and word restores use the same pause-midpoint range.
- **Removing a part is undoable, not confirmed.** One click on ✕ shouldn't cost an hour of hand edits, and a dialog
  would tax every intended removal. Undo re-adds the file and renames its id in the history.
- **A selection stays in one part** (the one it began in), in both views.
- **Yours and Magic's cuts that only touch stay two cuts** (overlaps still merge, as yours). Keeps Magic's
  remnants replaceable by the next run after `withMagic` subtracts your cuts.
- **The transcript arriving is not an undo step**: `history.everywhere` writes the words into past and future.
- **Clicking a word no longer starts playback**; it moves the playhead and keeps play/pause as it was.
