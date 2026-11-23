# Magic Trace: update v1

Feature: `f-magic-trace`. Research and design: `design/magic-trace.md` (Elon Engineer, 2026-11-23).

## Goal
Every Magic run leaves a trace in the background:
1. **Recorded:** each run saves one run record: what Claude read, what it answered, which model and rules it used,
   and each proposed cut with its reason, its source (Claude or our last-take rule) and the take it kept instead.
2. **Saved with the project:** the trace sits in the project state beside the edit, outside undo. Undoing the
   Magic Cut step leaves the trace, and every cut then reads as "restored".
3. **Linked to what the user did:** the app never logs gestures. It works out each proposal's outcome (kept,
   touched, adjusted, restored, agreed, gone) and the cuts Magic missed by comparing the record with the current cuts.
4. **Exported as learning logs:** when a run's outcome is final, the runs where the user disagreed are written as
   one JSON log each to `~/Library/Application Support/xyz.supercut.editor/learning/`. The log is a replayable
   test case for a new prompt or model. It never leaves the Mac.

The user sees one new thing: a dropped take's hover says which take Magic kept.

## Decisions
- **Outcomes are computed, not recorded.** Comparing by time survives merges, splits, undo and re-runs. An id on each
  cut or a gesture log would not.
- **No confidence score.** `claude -p` gives no real probabilities. The honest signals are `source: 'rule'`, check
  notes and similar-take groups.
- **"Saved with the project" means beside `edit` in the app's project state.** No project file exists yet (edits
  last until the window closes). When project saving lands, `magic` is one more key in the same file. Nothing
  else changes.
- **When a log is written.** Video export doesn't exist yet. So the outcome counts as final (a) when a newer Magic run
  replaces the run, which freezes it, and (b) when the window closes. Once video export exists, it is a third moment.
  A rewrite of the same run id overwrites its log, so writing twice is harmless.
- **Only disagreements are written** (restored, adjusted, missed). If the user agreed with everything, the run is
  cheap to rebuild and not worth the disk space.
- **Left for later features:** the 6-second clip per case and the review verdicts belong to Cut review mode
  (`f-cut-review-mode`). Reading the logs and deleting them once processed belong to the tool that processes them.

## Roadmap

### Phase 1: Rust builds the run record
- `claude::stream` reads the real model id from the stream's `system/init` line. `ask` returns `{ answer, model }`.
- `decide` marks each cut's `source` (`claude` or `rule`), its `line`, and `instead`: the take kept in its group.
  The last-take reason is shortened to "Earlier take", because the hover now names the kept take.
- `autocut::propose` returns `run` next to `cuts` and `notes`: model, rules hash, custom rules, the lines exactly as
  sent, the groups, and Claude's raw answer.
- **Tests:** the model is read from the init line. `source` and `instead` are right for Claude's drops, the rule's
  swaps and drops outside a group. The run record carries the lines, groups and raw answer.

### Phase 2: the trace, pure JS (`src/ui/trace.js`)
- `newRun(result, before, meta)` builds the record. `withRun(trace, run, cuts)` freezes the previous run's outcomes
  and appends the new run.
- `outcome(proposal, cuts, before)`, `outcomes(run, cuts, parts)` and `missed(run, cuts)` give what the user did.
- `renameTracePart` mirrors `renamePart` for a part that is put back.
- **Tests:** kept, touched (an edge dragged back to where it was), adjusted (ds/de), restored (⌫ and undo of the whole
  step), agreed (you'd cut it before Magic), gone (part removed), a hole inside a cut, a cut split in two, and
  missed cuts. A re-run freezes the old outcomes.

### Phase 3: wire it into the app
- `main.js` keeps `magic = { runs }` beside the history (outside undo). Each Magic result adds a run. A part put
  back renames its id in the trace too.
- The dropped take's reason gets "· kept “…”" (the kept line, at most 70 characters). It shows in the existing
  hover and the screen-reader label.
- **Tests:** `withMagicRun` gives the kept-take reason. The trace survives an undo of the Magic Cut step.

### Phase 4: learning logs
- `learningLog(run, cuts, parts)` (pure) builds `{ run, outcomes, cases }`. Each case holds the nearby lines, the
  proposal, the outcome and the user's final cuts there. It is null when the user agreed with everything.
- Rust `save_learning_log(id, log)` writes `learning/<id>.json` atomically. The id is checked so it can't leave
  the folder.
- Logs are written when a run is frozen and when the window closes.
- **Tests:** JS: which outcomes become cases, null on full agreement. Rust: the file is written, a bad id is
  refused, a rewrite overwrites.

### Phase 5: verify and ship
- `npm test`, `cargo test`, a release build, and one real Magic run on a sample to confirm a log lands in
  `learning/`. Commit, push, record the status here.

## Status
- Phase 1: done. `auto_cut` returns `run` (app build, model, rules hash, custom rules, lines, groups, raw answer);
  each cut has `line`, `source` and `instead`.
- Phase 2: done. `src/ui/trace.js`, tested in `test/trace.test.mjs` (every outcome, holes, splits, missed,
  freezing, renaming). `outcome` takes `present` (the part ids) to tell "gone".
- Phase 3: done. `main.js` keeps `trace` beside the history. The runner hands on `run`. `keptReason` in
  `magic.js` adds "· kept “…”".
- Phase 4: done. `src/ui/learning.js` (tested in `test/learning.test.mjs`), Rust `learning.rs` +
  `save_learning_log`, the shared `atomic.rs`. A log is written when a run is replaced and when the window closes.
- Phase 5: `npm test` passes (235 UI, 110 Rust, after rebasing on main), and so does a release build. Not done yet: one real Magic run in
  the app to see a log land in `learning/`. That needs someone at the window.
- **Installed (Uncle Bob, 2026-11-23).** `npm ci && npm run install-app` from main at `630509b`:
  `npm run test:ui` 235 green, `/Applications/Magic Cut.app` replaced (frontend id `3c955f682f33fa76`,
  built from `src/` with `trace.js` and `learning.js`), Spotlight finds it, and it was opened and is running.
  **Not yet seen in the window:** the "kept “…”" hover and a log in `learning/` need a real Magic run.

Next: the 6-second clip and the review verdicts go into each case once Cut review mode lands. Video export
becomes a third moment to write logs.
