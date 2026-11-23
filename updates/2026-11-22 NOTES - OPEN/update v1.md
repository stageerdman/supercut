# Notes — v1

Feature: f-notes. Concept, design and roadmap: Jony. Research: `research-notes.md` (Columbo).
Next feature that builds on it: f-cut-review-mode (a "No" in review leaves a note).

## Goal
The editor can park a doubt at a moment or over a stretch of the recording **without stopping playback**, find
every open one again, fix it, and tick it done, so nothing is forgotten before export. Magic can point at the few
places it wants a human to check. Notes are for the editor only: never in the video, never touched by Magic once
they're yours.

## The concept in eight lines
1. **A note is a to-do pinned to time**: `{ id, part, s, e, text, color, by, done, doneAt?, about? }` in
   `edit.notes`. `s === e` is a moment note, `s < e` is a section note. The text can be empty.
2. **One action, two kinds**: `M` / ⚑ / right-click. With no selection it makes a moment note at the playhead. With a
   selection (words, a range, a cut) it makes a section note over it. While playing nothing opens. When paused the
   card opens, ready to type.
3. **Its own lane under the track.** A cut block never covers a note. The text shows in the lane when it fits whole,
   notes too close together merge into a cluster that zooms in on click, and hover shows a peek.
4. **One card, non-modal**: text, four colours, a quiet Delete, and **Done** as the primary action. Text is never lost.
5. **The way back**: ⌥→ / ⌥← and the "3 notes" chip go to the next open note, 1 s of kept time early, and open its
   card without focus, so you can fix things while you read it.
6. **Done hides, Delete removes, and both undo.** Done notes stay in the state, and "Show done notes" brings them
   back to view.
7. **Magic's notes are rare** (≤ 1 per 3 min, ≤ 5 per run, zero is normal). They ask you to decide or listen and
   never explain a cut. A re-run replaces only its own untouched notes and never brings back one you deleted.
8. **Notes belong to time, not cuts.** Cutting, restoring and dragging never move them. Cut review later reuses all of
   this with `about` and `doneAt`.

## The design (read before building)
- `design/notes.md`: the whole spec (model, making, lane, peek, card, the way back, transcript marks, Magic,
  states, accessibility, keys, components).
- Pointers added to `design/edit-model.md` (the `notes` field and its rules), `design/timeline.md` (the lane),
  `design/transcript-editing.md` (`M` isn't type-to-fix), `design/main-screen.md` (keys) and
  `design/visual-system.md` (note colours).

## Shape (where the code goes)
| File | What |
|---|---|
| `src/ui/notes.js` (new, pure) | add / edit / done / delete, `openNotes`, `noteAt`, `nextOpen`, `preRoll`, `withMagicNotes` |
| `src/ui/note-layout.js` (new, pure) | markers, sections, whole-or-nothing labels, stacking, clusters |
| `src/ui/note-view.js` (new) | lane elements, ring, hit areas, the peek |
| `src/ui/note-card.js` (new) | the card |
| `src/ui/edit.js`, `history.js` | `notes` and `dismissed` in the edit; `withoutPart`, `renamePart` and `changed` cover notes |
| `src/ui/timeline.js` | the lane row (+24 pt `HEIGHT`), right-click, Tab order |
| `src/ui/transcript.js` | underlines and moment bars |
| `src/main.js` | `M`, ⌥→ / ⌥←, ⚑ button, count chip, status lines |
| `src-tauri/src/autocut/` | an optional `check` list in Claude's reply → Magic's notes |

## Roadmap
Each phase ends with tests that lock it in (`npm run test:ui` for JS on a fake DOM, `cargo test` for Rust).
"Check in the window" means a person opens the app (`npm run dev`). Agents can't see the screen, so Status says so
when that hasn't happened yet.

### Phase 1 — The note model (pure: `notes.js`, `edit.js`, `history.js`)
Notes and `dismissed` in the edit. All the rules from the spec, with no DOM.
Tests (`test/notes.test.mjs`, `test/edit.test.mjs`):
- `addNote` with no selection → `s === e` at the playhead, `by: 'you'`, `color: 'yellow'`, empty text, a fresh id.
  With words → the words' first start / last end (**not** the pause midpoints of `wordRange`). With a selected cut →
  the cut's range and `about = { s, e, by }`.
- `noteAt(notes, part, t, 0.5)` finds an open moment note within 0.5 s and ignores done notes. `addNote` there returns
  the existing note (no twin).
- `editNote` (text, colour) on a Magic note makes it `by: 'you'`. `setDone` sets `doneAt` and `done`, and undoing it
  restores both.
- `deleteNote` of a Magic note adds `{ part, s, e }` to `dismissed`, and deleting your own adds nothing.
- `openNotes` skips done notes. `nextOpen` / previous go in play order across two parts, wrap at both ends, skip done
  notes, and with none open return `null`.
- `preRoll`: 1 s of **kept** time before the note's start (a cut in between is skipped, not counted), clamped to the
  part's first kept moment. For a note inside a cut it lands before the join.
- `withMagicNotes`: drops untouched old Magic notes, keeps everything `by: 'you'` (including done ones), drops new
  notes that overlap a `dismissed` spot or one of your open notes, and caps at 5 in time order and 1 per 3 min of
  speech.
- `withoutPart` / `renamePart` carry notes. `changed(a, b)` reports a changed note's range. History labels: "Added
  note", "Noted 1:12–1:40", "Edited note", "Changed note colour", "Done: note", "Deleted note".
- Cutting, restoring and moving an edge (`toggle`, `moveEdge`, `withMagic`) leave `notes` exactly equal.

### Phase 2 — The lane (`note-layout.js`, `note-view.js`, `timeline.js`)
The row under the track, drawn from the layout. Hover peek, click selects (ring) and seeks with the pre-roll.
Tests (`test/note-layout.test.mjs` with the fake `measure`, `test/note-lane.test.mjs` on a fake DOM):
- The lane's top = the track's bottom + 4, its height = 20, and `HEIGHT` = 176. It exists with zero notes. No lane
  without a part.
- A moment pill is 6 pt wide (14 pt for Magic, with ✦), centred on its time. A section bar spans `s..e`, is at least
  6 pt wide, and has a start stripe. Hit areas are ≥ 12 pt.
- Labels: **whole or nothing**, no overlap (6 pt gap), never past the part's end, first line only, none for an empty
  note.
- Stacking order: moments over sections, short sections over long ones. Done notes make no element.
- Clusters: two moment centres 11 pt apart → one cluster with count 2, and 12 pt apart → two markers. Clicking a
  cluster sets a zoom where they are ≥ 12 pt apart.
- A note under a cut block is still its own clickable element (the cut layer ends at the track's bottom).
- The peek shows after 150 ms with the text or "Empty note" and its time line. Click → playhead at `preRoll` and the
  ring is on. Tab order: the part's cuts and pauses, then its notes in time order, with the spec's names.

### Phase 3 — Making and changing (`note-card.js`, `main.js`)
`M`, the ⚑ button, right-click "Add note here", the card with every key, the first-note line.
Tests (`test/note-card.test.mjs`, `test/ui.test.mjs`):
- `M` while playing → one note, playback still playing, no card, status "Note added · ⌘Z undoes". `M` while paused
  → the card opens and the text field has focus. `M` twice within 0.5 s (playing or paused) → still one note; paused,
  the second `M` opens that note's card.
- Paused `M`, then Space with the field empty → the card closes, playback starts, one empty note stays. Paused `M`,
  type "a", Space → the field reads "a " and nothing plays.
- `M` is ignored in the fix field, rules box, search and the card's own field. In the panel with words selected it
  makes a section note and **doesn't** open the fix field. Another letter there still does.
- The first note ever shows the "only for you, never in your video" line once, and the second note shows the short
  line (the flag is saved with app settings).
- Card: Return saves and closes, ⇧Return adds a line, Esc / ✕ / clicking outside **keeps the text**, and clicking the
  timeline leaves it open. One undo step "Edited note" only if the text changed. A swatch changes the colour at once.
  ⌘Return → Done (and Magic doesn't run). ⌘⌫ → Delete. Focus goes back to the note on close.
- Done → the note is hidden from the lane, the count goes down, and the status says "Done · 2 notes left · ⌘Z
  undoes". ⌘Z brings it back open.
- Placement: the card sits over the player's bottom, centred on the note's x, clamped inside the player's width.

### Phase 4 — The way back (`main.js`, `timeline.js`)
⌥→ / ⌥←, the count chip, going to a note with the card unfocused.
Tests:
- Over three open notes in two parts plus one done note: ⌥→ from 0 visits the three in order and wraps, ⌥← goes back,
  and the done note is never visited.
- After a jump, the playhead is at `preRoll`, an off-screen note is centred, its ring is on, and its card is open
  **without focus** (Space still toggles playback, ← → still step). Play/pause is unchanged.
- ⌥→, then ⌘Return **without clicking into the card** → that note is Done and Magic doesn't run. With no card open,
  ⌘Return runs Magic as today. Right-click a note in the lane → "Done" does the same as the card's button.
- The chip shows "3 notes" only while some are open, says "1 note" for one, and clicking it equals ⌥→. After the last
  Done it's gone and the status says "All notes done".

### Phase 5 — Notes in the transcript panel (`transcript.js`)
Underlines for open sections and bars for open moments. Hover peek, and click opens the card.
Tests (`test/transcript.test.mjs`):
- Words whose middle is inside an open section note get the underline class with the note's colour, words outside
  don't, and a done note gives none. A cut word under a note has both the strike and the underline.
- A moment note puts one bar before the word under its time.
- Clicking an underline opens that note's card and seeks. Words' names get ", has a note".

### Phase 6 — Magic's notes (Rust `autocut`, `magic.js`)
Claude's reply may hold `check: [{ line, why }]`. The prompt says when to flag (two close takes, an almost-cut
stretch, unclear speech), never to explain a cut, and that zero is normal. It sets the caps. Rust turns lines into
times. The app applies `withMagicNotes` inside the one "Magic Cut" step.
Tests:
- Rust (`cargo test`): a reply with no `check` parses as today. `check` lines map to the line's `part, s, e`. Unknown
  line ids are dropped. More than 5 → the first 5 in time order. `why` is trimmed to 70 characters.
- The prompt test (as for the existing prompt) states the rule, the caps and the "zero is normal" line.
- JS: a Magic result with notes → one history step that holds both cuts and notes. ⌘Z removes both. A re-run keeps
  your notes and a recoloured Magic note, doesn't recreate a deleted one, and replaces the untouched ones. The done
  line says "· 2 notes to check · ⌥→" only when there are some.
- Live (`live_tests.rs`, run by hand, needs Claude): on the fixture talk, at most 5 notes, none of them repeating a
  cut's reason. Record what it flagged in `wiki.md` (Q3).

### Phase 7 — Show done notes, docs, check in the window, install
"Show done notes" (lane right-click) draws done notes at 35 % with a ✓, and their card has "Reopen". Then the docs and
a real run.
Tests:
- With the toggle on, done notes make elements with the done style and count in the Tab order. Reopen → open again
  (one undo step "Reopened note"). With the toggle off, they're gone. The toggle isn't part of the undo history.
- `npm run test:ui` and `cargo test` all green.
Check in the window (a person): play a real recording and press `M` five times without stopping, type text into two
notes, mark a section from the transcript, put a note on a cut, ⌥→ through all of them fixing and ticking done, ⌘Z a
Done, run Magic and read its notes, re-run Magic and check yours are untouched.
Then update this Status, `wiki.md` and `design/user-model.md` (A16–A19), and `npm run install-app` from an
up-to-date main.

## Out of scope (on purpose)
- Sharing, comments for other people, replies, mentions, rich text.
- Exporting notes (chapters, YouTube timestamps, Final Cut markers).
- Magic reading notes as instructions (Q2, a product call for Pixel).
- Dragging or resizing notes, a notes list panel, popups as the playhead passes.
- Cut review itself and its learning log (f-cut-review-mode). This update only gives it `about` and `doneAt`.
- Saving notes across launches: they're in `edit`, so they save when projects save (f-home-screen-with-past-projects).
- The export mention: the line is specified in `design/notes.md` and belongs to the export feature when it's built.

## Status (2026-11-22)
- Concept, design and roadmap written (Jony): this file, `design/notes.md`, `wiki.md`. Pointers added to the edit
  model, timeline, transcript editing, main screen and visual system specs, and A16–A19 added to the user model.
- Step review (Eraser, `step-review.md`): **RETURNED, small rework**. Must change: Space after a paused `M` must
  play (A), ⌘Return = Done while a card is open even unfocused (B). Colour stays, since the user asked for it (C). Should: "⌥→" in
  Magic's done line (D), reword the 0.5 s row (E). About 74 → 50 overhead steps in a common session.
- **Revised (Jony), final.** All five review points folded into `design/notes.md` and the phase tests:
  A, Space on a just-made empty note closes the card and plays (`M`, Space = 2 keys); B, ⌘Return = Done while any card
  is open, plus right-click → Done as the mouse path (loop overhead 5 → 3 per note); C, colour kept as designed; D,
  done line "· 2 notes to check · ⌥→"; E, the 0.5 s row reworded (no twin, playing or paused; paused opens it).
  Common session ≈ 50 overhead steps.
- **Phase 1 done (Uncle Bob, 2026-11-23).** `src/ui/notes.js` (pure): `addNote` (+ `noteSpot`, `noteAt` for the
  no-twin rule), `editNote`, `setDone`, `deleteNote`, `openNotes`, `nextOpen`, `preRoll`, `withMagicNotes`. `edit.js`:
  `notes` and `dismissed` in `emptyEdit`; `withoutPart` / `renamePart` carry them; `notesOf` / `dismissedOf` read an
  older edit without notes as none. `history.js`: `changed()` covers notes. 15 tests in `test/notes.test.mjs`, all
  of `npm run test:ui` green (170). Saving: notes are plain JSON inside the edit, so they save when projects save
  (that feature isn't built yet). Nothing on screen yet. Next: Phase 2 (the lane).
- **Phases 2–5 and Phase 7's Show done toggle done (Jony, 2026-11-23).** `note-layout.js` (pure lane layout: pills,
  bars, clusters, whole-word labels, stacking), `note-view.js` (the lane under the track: markers, labels, clusters
  that zoom in, ring, peek, right-click, Return), `note-card.js` (text, four colours, Done/Reopen, Delete, keys),
  `note-control.js` (add/open/go/done/reopen/remove/save/colour/show done, chip text), `context-menu.js` (Add note,
  Show done notes, the note menu), `transcript.js` (underlines and bars for notes), `timeline.js` (`currentNote`),
  `main.js` and `index.html` wired (`M`, ⚑, the chip, ⌥→/⌥←, card over the player). Tests: `test/note-card.test.mjs`,
  additions to `test/transcript.test.mjs` and the layout tests; `npm run test:ui` green (214).
  **Not yet checked in the window** (agents can't see the screen): `main.js` passes `node --check` only.
  Remaining: the window check by a person, Phase 6 (Magic's notes, Rust), docs (`wiki.md`, user-model A16–A19
  results), `npm run install-app`.

### Phases 2–5 decisions
- A click on a noted word in the transcript opens its card **unfocused** and doesn't seek, so fixing goes on; a click
  on a note bar opens it focused. Transcript clicks keep the card open.
- The transcript peek is the native `title` tooltip, not a custom popup.
- ⌘Return = Done while a card is open; Esc closes an open card before it clears the selection.
- Not built in v1: the 200 ms fade on Done, Increase Contrast colour variants.

### Phase 1 decisions
- Every note change returns `{ edit, label }` (like `toggleWords` returns `{ cuts, label }`); no change → the same
  edit, so `history.push` makes no step.
- `nextOpen(notes, order, from)`: `from` is the current note `{ id }` after a jump (the playhead sits at the pre-roll,
  before the note), else the playhead `{ part, t }`. A note exactly at the playhead counts as next.
- Section labels use the app's `clock()`: "Noted 01:12–01:40", the same time format as everywhere else.
- Magic's cap is one per **started** 3 min of speech (`ceil`), so a 2-minute talk may get one; no speech → none.
- Ids are `crypto.randomUUID()` (injectable in tests). Reopening drops `doneAt`.

## Decisions
- **`M` beats type-to-fix in the panel.** Notes are frequent (L8 F8) and fixes rare (A10), so the common action keeps
  the key editors know. Fixes that start with "m" open with Return or a double-click.
- **Notes don't join the cut selection, and ⌫ never deletes a note.** ⌫ stays "cut / restore" everywhere. Deleting a
  note happens only in the card (🗑, ⌘⌫), which keeps delete the quiet action.
- **The lane is always there** once a part is loaded, so the layout never jumps mid-playback.
- **The card floats over the player, not over the timeline**, so it stays open and readable while you fix underneath.
- **Done never auto-advances.** The playhead moves only when you ask it to.
- **⌘Return means Done while a note card is open**, focused or not; Magic again once it's closed. Done undoes, so a
  wrong guess is one ⌘Z.
- **Space keeps its meaning.** On a just-made empty note, Space closes the card and plays; with text, it's a space.
- **Four colours, yellow by default. Magic doesn't choose colours, it gets a ✦.**
- **A touched Magic note becomes yours**, the same as a moved Magic cut.
- **No drag, no list, no pass-by popups** in v1. Add one back only if a real user misses it.
