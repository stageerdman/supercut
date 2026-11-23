# Cut review mode: update v1

Feature: `f-cut-review-mode`. Design: `design/cut-review.md` (Jony). Research: `research-cut-review.md` (Columbo).
Trace and learning: `design/magic-trace.md`, "Verdicts". Notes it reuses: `design/notes.md`.

## Goal
After Magic, the user checks every cut in a few minutes without watching the whole video again:
1. **Start** with the "Review cuts" button (the primary after a Magic run) or R.
2. **Hear each join** in a ~6 s window of edited time, the join in the middle (shifted at the video's start and end,
   close cuts joined into one stop of at most 3).
3. **Answer at any moment:** Y = looks good, next. N = fix later: an empty red note about the cut, next. ⌫ = put it
   back now. R replays, ↑/↓ move without a verdict, Esc leaves and progress stays.
4. **See where they are** ("Cut 7 of 38") and finish on "3 cuts to fix · ⌥→", which hands over to the notes loop.
5. **Teach Magic:** each verdict is stored in the run's trace; a "No" and what the user later did with the cut become a
   learning case with the ~6 s clip they heard.

## Decisions
- **A mode of the same screen, one new element (the bar).** Player, transcript and timeline already show what a
  verdict needs.
- **Which cuts:** Magic's cuts from the latest run; with no Magic run, your own cuts minus head/tail trims. (Settles
  research Q8: the feature text and the old decision both hold.)
- **Time order**, not least-sure first (research Q1): ↑/↓ means time order in every editor, and the story's thread
  matters more than the order.
- **The window waits** at its end: no loop, no auto-advance (Q4).
- **⌘Z right after a verdict undoes that verdict** and goes back to it (Q2). Otherwise ⌘Z is the usual undo.
- **No peek of the removed audio and no nudge keys in the MVP** (Q5): text first, and mouse drags + R already work.
- **"No" is a note, not a new kind of thing.** Red, empty, `about` = the cut. The notes loop does the fixing.
- **Verdicts are recorded; the fix is worked out** by `outcome()`. "Fixed" = note done or outcome changed, since
  people forget to tick the note.

## Roadmap

### Phase 1: the review model, pure (`src/ui/review.js`)
- `reviewCuts`: Magic's still-cut proposals of the live run (not `agreed`, not `gone`), else your cuts without
  head/tail trims; each with proposal index, part, s, e, by, reason.
- `stops`: grouping (next join within 3 s of edited time, cap 3) and numbering ("Cut 7" / "Cuts 7–8 of 38").
- `reviewWindow`: `{ from, to, edge }` in edited time and the source spans it plays: J ± 3 s, shifted to 6 s at the
  start or end, across two parts in play order.
- `checked`, `firstUnchecked`, `step(dir)`, `progress` → `{ checked, total, toFix }`; a restored cut counts as checked.
- **Tests:** a cut in the middle; at 0:00; at the end; across two parts; a 40 s cut; a 0.3 s cut; three fillers in 4 s
  (one stop) and five (two stops); your cuts when there's no run, trims left out; a restored proposal is checked and
  skipped; progress after a re-normalize (merge/split) still matches.

### Phase 2: verdicts and the "No" note
- `trace.js`: `withVerdict(trace, runId, indices, verdict)`, `withoutVerdict(…)`. Outside undo.
- A "No" builds the note through `notes.js` (`addNote`, red, `about`), one per part of the stop; No → Yes removes
  the note only if it's empty and not done.
- **Tests:** a verdict per proposal in a group; overwrite; survives an undo of an unrelated edit; frozen with the run
  on a Magic re-run; undo of the whole Magic step leaves the verdicts but the stops vanish; the note's shape (`color`,
  `about`, span); No → Yes keeps a note with text.

### Phase 3: playing a window
- In `review-control.js`: play a window's source spans in order, stop at its end and wait, R / Space-after-end
  replays, pre-load the next stop's start, a verdict mid-window starts the next at once (target ≤ 150 ms).
- Reuse the timeline's skip-over-cuts playback (`playback.js`); no second player path.
- **Tests:** the span list for each Phase 1 case (pure); stop-at-end and replay with a fake clock. **Manual:** listen
  to five joins on a real recording, including one across parts; no black frame or hitch on the next stop.

### Phase 4: the bar, keys, entering and leaving
- `review-bar.js`: count line, reason line (with a check note's text), actions with key caps, chosen verdict, end
  line, narrow layout, a11y names and live region.
- `review-control.js` + `main.js`: the "Review cuts" toolbar button and its primary state, R to start, the done line
  "· R to review", dropping the selection on entry, review keys before type-to-fix, ⌫ as a verdict, ⌘Z of the last
  verdict, clicks on a stop, transcript and timeline following the stop, Esc and the end line handing over to ⌥→,
  leaving on a Magic re-run with the status line.
- **Tests:** Y with words selected never writes a word; N makes one red note and moves on; ⌫ restores and moves on;
  ⌘Z after N removes the note and goes back; ↑ shows the given verdict; resume opens the first unchecked; the end
  line with and without Nos; a re-run mid-review leaves review. **Manual:** a full keyboard-only pass and a VoiceOver
  pass of one stop.

### Phase 5: learning from verdicts
- `learning.js`: `verdicts` beside `outcomes`; a case for every "no" (plus restored/adjusted as today) with
  `verdict`, `fixed`, `doneAt`.
- Write the log again when a red review note is marked done.
- Rust `save_learning_clip(id, spans)`: ffmpeg renders `heard` to `learning/<run id>-<index>.mp4` (480p, H.264 +
  AAC), atomic, id checked like `save_learning_log`.
- **Tests:** JS: each row of the "No, then fixed" table in `design/magic-trace.md` gives the right case (or none);
  a yes-only run stays null. Rust: the clip is written, a bad id is refused, a rewrite overwrites.

### Phase 6: verify and ship
- `npm test`, `cargo test`, a release build. One real Magic run reviewed end to end in the app (Y, N, ⌫, ↑, ⌘Z,
  Esc and resume, the end line into ⌥→), then a fix and Done to see the case and clip land in `learning/`.
- `npm run install-app` from up-to-date main. Record the status here and set the feature to shipped.

## Status
- Phase 0 (research and design): done. Research by Columbo, `design/cut-review.md` and the "Verdicts" section of
  `design/magic-trace.md` by Jony.
- Phase 1: done. `src/ui/review.js`, `test/review.test.mjs`.
- Phase 2: done. `trace.js` `withVerdict` / `withoutVerdict` (a part rename renames the spans heard), `notes.js`
  `addFixLater` / `dropFixLater`; `test/review-verdicts.test.mjs`.
- Phase 3: done, minus the pre-load. `src/ui/review-play.js` plays a window on the normal player (no second
  player path), waits at its end, Space / R replay, and ignores stale times from before a seek lands. The next stop's
  start is **not** pre-loaded (`player.show` seeks), so a verdict may hitch on a slow disk: check by ear in Phase 6.
- Phase 4: done. Engine: `src/ui/review-session.js` (`createReviewSession`) does start, Y / N / ⌫, ↑ / ↓ / goTo,
  R / Space, ⌘Z of the last verdict, Esc and resume, the end line and going stale on a Magic re-run;
  `test/review-session.test.mjs`. Screen: `src/ui/review-bar.js` (the bar over the player, key caps, ✓ Noted,
  end line, a live region per stop, 480 pt / narrow), `src/ui/review-control.js` (key routing ahead of type-to-fix,
  the ring on the current cut, clicking another stop's cut, ⌥→ from the end line into the first red note), the
  **Review cuts** toolbar button (primary after a Magic run until all is checked) and R to start, Magic's done line
  offering R; wired in `main.js`. `test/review-bar.test.mjs`, `test/review-control.test.mjs`.
  Known gaps, for Phase 6: no keyboard-only or VoiceOver pass yet (no screen here); if every Magic cut is put back
  with ⌫ during review, the stops fall back to your own cuts mid-session; the bar and an open note card share the
  spot over the player; a seek forward during review can end the window early. The session's commit does not call
  `review.changed()` on purpose (no re-entry mid-verdict).
- Phase 5: done. `learning.js` writes verdicts beside outcomes and a case for every "no" (`verdict`, `heard`,
  `fixed`, `doneAt`); `learningClips` names the clips. Rust `save_learning_clip` (`src-tauri/src/learning_clip.rs`)
  renders `heard` to `learning/<run id>-<index>.mp4`, 854×480 boxed, H.264 + AAC, temp file then rename; paths come
  from the open project, never from the web side. `main.js` saves the clips with the log. The log is not rewritten
  the moment a red note is ticked: it is written when the run is replaced or the window closes, with the notes as they
  are then, which already carries `doneAt`.
- Phase 6: built and installed, hands-on pass still to do. On main `dc17b7e`: 309 UI tests and 114 Rust tests
  pass (423 total), the CSS is up to date, and `npm run install-app` built a release and replaced
  `/Applications/Magic Cut.app` (frontend id `d9ae6673cf557901`, checked in the build and the installed copy;
  Spotlight finds it). `npm run smoke` passes on the release build: codesign, the bundled Claude call, and the
  bundled ffmpeg + Parakeet transcription. The run through in the app (Y, N, ⌫, ↑, ⌘Z, Esc and resume, the end line
  into ⌥→, a fix and Done landing in `learning/`) and the keyboard-only and VoiceOver passes need someone at the
  screen. Nobody has used it there yet.

Next: the user runs review once in the app; anything found goes to issues.txt, then close the update.
