# Notes UI — build plan (Jony, phases 2–5 and 7's toggle)

Working notes for building the UI phases of `update v1.md`. Phase 6 (Magic's notes, Rust) is not in this item.

## Files
- `src/ui/waveform-view.js`: add `export const NOTES = { top: TRACK.top + TRACK.h + 4, h: 20 }` (top 132).
- `src/ui/note-layout.js` (pure): `layoutNotes({ notes, len, pps, measure, showDone })` → items in **time order**
  (DOM/Tab order), each `{ kind:'moment'|'section'|'cluster', ids, x, w, cx, color, by, done, label, labelX, hit:{x,w}, z }`
  in points from the part's start. Moment w 6 (Magic 14, done 14 with ✓), section w = max(6, (e-s)·pps), cluster 18.
  Cluster = chain of small items (moments, sections narrower than 12) whose centres are < 12 apart; colour shared or null.
  Labels: first line, whole words then "…" (export `fitPhrase` from word-levels.js and reuse), room = min(next item's
  x, part end) − 6 − labelX (sections also ≤ bar end − 4); moment label at x+w+4, section at x+6 (+14 if Magic).
  Stacking via `z`: long sections lowest, shorter higher, moments/clusters top. `clusterPps(notes)` = 12·1.15 / smallest
  centre gap. Hit ≥ 12 wide, centred.
- `src/ui/note-view.js`: `NOTE_HEX` (#F2C94C yellow, #5AA9FF blue, #B48CFF violet, #3CC8B4 teal), `noteName(note)`
  ("Note at 01:12, by Magic: text. Return opens." / "Empty note at 01:12" / "Note from 01:12 to 01:40…"),
  `peekLines(note)` (text or "Empty note"; "01:12" or "01:12 – 01:40 · 28 s", + " · ✦ Magic"), `noteLane(box, i, …)`
  (role group "Notes, part 1, 3 open", `data-notes=i`; items role=button tabIndex 0 `data-note=id` or `data-cluster`),
  `createPeek()` (150 ms, above the lane). Label is clickable (part of the note).
- `src/ui/timeline.js`: `export const HEIGHT = 176`; notes lane per part after the pause lane (Tab order); paintNotes
  inside paintCuts; relayout moves, settle repaints; playhead runs through the lane; pointerdown on `[data-note]` →
  release → `o.onNote(id, { focus: true })`; cluster click → zoom to `clusterPps` anchored on it; Return on a note →
  onNote; right-click note → `o.onNoteMenu(id, at)`; right-click elsewhere → `o.onMenu(at, { part, t, lane })` always
  (Add Note Here). API: `setNote(id)` ring, `focusNote(id)`, `noteX(id)` client x, `pop(id)`.
  New options: `notes()`, `showDone()`.
- `src/ui/note-card.js`: `CARD_W = 280`, `cardLeft(x, width)` clamp with 8 margin, `cardTitle(note)`;
  `createNoteCard(host, { onSave, onColor, onDone, onDelete, onPlay, onClosed, keepOpen(target) })` →
  `{ open(note, { left, focus }), close({ save }), sync(note), id, isOpen, contains }`. Textarea: Return saves+closes,
  ⇧Return newline, Esc/✕ close keep text, ⌘Return Done, ⌘⌫ Delete, Space with empty field → close + onPlay. Text saved
  trimmed at the end, one "Edited note" only if changed. Swatches radio group "Colour: Yellow". Done note → "Reopen".
  Document pointerdown outside card and timeline (keepOpen) → close keeps text.
- `src/ui/note-control.js` (testable controller, no Tauri): `createNoteControl(o)` with `add()`, `open(id, {focus})`,
  `go(dir)`, `done(id)`, `remove(id)`, `toggleShowDone()`, `afterUndo()`, `paint()` (chip "3 notes"/"1 note", hidden at
  0), `cardOpen`. Status: playing add → "Note added · ⌘Z undoes" 2 s; first note ever → "Note added. Notes are only for
  you, never in your video." 6 s (localStorage flag `magiccut.notes.seen`); Done → "Done · 2 notes left · ⌘Z undoes" /
  "All notes done"; Delete → "Note deleted · ⌘Z undoes". go(): from `{id: current}` only while the playhead hasn't
  passed the current note, else the playhead; seek to `preRoll`, ring, reveal, card open unfocused.
- `src/main.js`: M (before writeKey; not in text fields), ⌥→/⌥←, ⌘Return = Done while a card is open else Magic, ⚑
  `#add-note` and chip `#notes-chip` (mousedown preventDefault so focus stays), menus (Add Note Here, Done/Delete or
  Reopen on a note, Show/Hide Done Notes on the lane). `transcriptKey`: m/M → null so it reaches the app.
- `src/index.html`: timeline h-[176px]; transport `▶ time ⚑ chip <spacer> zoom`; player box id `player-box` hosts the card.
- `src/ui/transcript.js` (Phase 5): words under an open section note get a 2 pt underline via background-image in the
  note colour at 60 % (works with the strike), a 2×14 bar before the word under a moment note, title gets "Note: …",
  aria-label ", has a note". Click on a marked word: select as usual and open the card **unfocused** (so ⌫ still cuts);
  click on a bar opens it focused. Options `notes()`, `onNote(id, {focus})`.
- Tests: move the fake DOM from `test/cut-blocks.test.mjs` into `test/fake-dom.mjs` (shared); new
  `test/note-layout.test.mjs`, `test/note-lane.test.mjs`, `test/note-card.test.mjs` (card + control), additions in
  `test/transcript.test.mjs`; add them to `test:ui` in package.json.

## Decisions taken while building
- Clicking a marked word in the transcript opens the card without focus (a word click is usually for selecting).
- The transcript peek is the native title tooltip (no second peek component).
- Not built: the 200 ms fade-out on Done, Increase Contrast variants (inline colours).
