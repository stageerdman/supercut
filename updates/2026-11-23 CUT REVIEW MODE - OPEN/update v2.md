# Cut review mode: update v2

Feature: `f-cut-review-mode`, and `f-magic-cut-button` (Magic hides while reviewing). Design: `design/cut-review.md`
(v2, Jony). v1's plan and build record: `update v1.md` (all six phases built, installed, then tried by the user).
Build: Uncle Bob. Design checks: Jony, after Phases 3 and 4 (screenshots or a run in the app).

## Why v2
The user tried v1 in the app and asked for five things: the timeline zooms to the cut under review; controls that
can't close by accident (Review cuts becomes Stop review, the only way out); a visible Play button that replays the
clip as often as wanted; the Magic Cut button gone while reviewing; all cuts by default, with a choice like "only AI
cuts" or "only unapproved". They stressed it must be really neat.

## Goal
1. **Start** with Review cuts (far right of the toolbar) or R. It reads **Stop review** while on; ✦ Magic Cut is gone.
2. **Every cut** is in it by default (Magic's and yours, trims too); a which-cuts menu in the bar narrows it to
   *Magic's cuts* or *Not approved yet*.
3. **Each stop frames itself on the timeline** (the clip at 80 % of the width, 200 ms) and its ~6 s clip plays.
4. **▶ Play** (R) plays the clip again, any number of times. Y / N / ⌫ / ↑ / ↓ / ⌘Z as v1.
5. **Only Stop review leaves.** Esc, clicks, R, the last verdict and edits never do. The end line waits, and Stop
   review becomes the primary.

## Decisions
- **One way out, in one place, that doesn't move.** Review cuts moves to the far right (after ✦ Magic Cut) with a
  fixed width, so hiding Magic and swapping the label never shift it under the pointer.
- **R plays, never exits.** R starts review when it's off; while on it is ▶ Play. The toolbar button is the toggle.
- **The end line waits.** No auto-close; Stop review turns filled. "Fix the first" and ⌥→ on the end line are gone
  (they left review); after Stop review the status line offers ⌥→, which works app-wide.
- **All cuts, every start.** The menu choice lasts for that review only; each start opens on *All cuts* at the first
  unchecked stop.
- **"Not approved yet" is taken once** when chosen, so a Y doesn't pull the cut out from under the count.
- **Three choices, no counts in the menu.** Empty choices are dimmed. "Your cuts" and "To fix" wait for evidence.
- **Frame on a new stop only.** Not on edits, hand zooms or scrolls; ▶ Play re-frames only if the clip is out of view.
  Stop review leaves the zoom where it is.
- **Key caps on the right of each button**, like shortcuts in a Mac menu.
- **No Magic mid-review.** The button is hidden and ⌘Return is ignored, so review never has to end for a re-run.
  An undo of the Magic step mid-review just updates the count (its cuts read as put back, checked).
- Known limit kept from v1: verdicts on your own cuts last for the app session only (Q-R8).

## Roadmap

### Phase 1: all cuts and the which-cuts choice (model and session, no DOM)
- `review.js`: `reviewCuts` returns Magic's items (as v1) **plus** every cut of yours no Magic item overlaps, head and
  tail trims included; trims' reason "Your cut · start / end of the video". `inSet(items, only, verdicts, taken)` for
  `'all' | 'magic' | 'unapproved'`; `setCounts(items, verdicts)` → which choices are empty; `stops` and numbering
  run within the set; `nearestUnchecked(list, verdicts, fromTime)` (first unchecked at or after a time, else from
  the start, else -1).
- `review-session.js`: `only` (reset to `'all'` on every `start()`); `choose(only)` (Not approved taken as a key set
  at that moment; moves to `nearestUnchecked` from the current stop's join, plays it); your cuts put back in this
  session stay as checked items until `leave()`; `next()` never turns review off (the end line waits, with or
  without Nos); `move(-1)` on the end line goes to the last stop; an empty set gives a view with `empty: true`;
  `view()` carries `only` and the dimmed choices.
- **Tests** (`test/review.test.mjs`, `test/review-session.test.mjs`): mixed Magic + your cuts in play order, no
  overlap counted twice, an `agreed` cut counted once as yours; a head trim and a tail trim are stops with the
  start / end window; each choice's set; "Magic's cuts" empty before a run; Not approved keeps a cut you just said Y
  to, and taking it again drops it; choosing moves to the next unchecked at or after now, else wraps, else the end
  line; numbering restarts in the set; the last verdict with no Nos keeps review on, on the end line; ↑ from the end
  line; your cut put back stays "Cut 7 of 38"; start always resets to All cuts; undoing the Magic step keeps review
  on with the Magic cuts checked.

### Phase 2: one way out (keys, toolbar, Magic hidden)
- `review-control.js`: `reviewKey` drops Esc → leave (Esc returns null, so the app's Esc runs) and maps R to
  `replay` (as now) with no path to leaving; `start()` no longer toggles off (the button calls `leave()` itself);
  `changed()` never leaves: on a stale run or an emptied set it repaints (count, "No cuts left"), nothing else;
  `fixFirst` and the end line's ⌥→ are removed; `reviewButton(p, { on, busy })` → `{ visible, label, primary }`
  (label "Review cuts" / "Stop review"; primary after a Magic run until all checked, and while on at the end line or
  with no cuts left).
- `index.html` + `magic-button.js`: order ✦ Magic Cut then Review cuts; Review gets one fixed width (fits "Review
  cuts" and "Stop review"), text centred, no `aria-pressed`, name = label; `paintMagic` hides the button while
  reviewing.
- `main.js`: the button toggles start / leave; ⌘Return does nothing while reviewing unless a note card is open (it
  finishes the card); R while reviewing never reaches `start()`; after Stop review the status line says "12 of 38
  checked · R to go on", or with Nos "3 cuts to fix · ⌥→ for the first" (3 s); the start announcement "Reviewing 38
  cuts. Stop review is in the toolbar."
- **Tests** (`test/review-control.test.mjs`, `test/ui.test.mjs`): Esc in review leaves it on (and still clears a
  selection / closes a card); R in review replays and never leaves; the last verdict keeps review on; a click on a
  non-stop cut keeps review on; a Magic re-run signal or an emptied set keeps review on; `reviewButton` labels and
  primary in every row of the design's toolbar table; ✦ Magic hidden while on and back after; ⌘Return ignored while
  reviewing, still finishes an open card; the status line after Stop review with and without Nos.

### Phase 3: the bar v2
- `review-bar.js`: remove ✕ and Fix the first; **▶ Play** (secondary, left end, key cap R, `onPlay`) always plays
  from the start; key caps at the right end of each button; the **which-cuts menu button** on line 1's right (quiet,
  "All cuts ⌄", `aria-haspopup="menu"`, name "Which cuts: All cuts"), which opens the native popup from
  `context-menu.js` with ✓ on the current choice and dimmed empty ones, and calls `onChoose(only)`; the two-line end
  line ("All 38 checked" / "35 of 38 checked", "3 cuts to fix" / "Nothing to fix"); "No cuts left"; trims' reason;
  narrow layout (buttons keep ▶ and caps, the menu keeps its words); Tab order Play → Fix later → Looks good →
  which-cuts.
- The menu owns the keys while open: review's keys don't fire (the native popup is modal; check it in the app).
- **Tests** (`test/review-bar.test.mjs`, fake DOM): no ✕ and no Fix the first anywhere; Play is there, named
  "Play (R)", calls `onPlay` each press; caps after words; the menu button names the current choice and passes the
  dimmed ones; the end line's two lines with and without Nos and with skipped stops; "No cuts left"; narrow keeps ▶,
  caps and the menu's words; focus enters on Looks good. **Design check (Jony):** the bar in the app, normal and
  narrow, end line, menu open.

### Phase 4: the timeline frames each stop
- `timeline-geometry.js` (pure): `zoomFor(seconds, width, fit)` → the zoom level (0 … 1, the timeline's log scale)
  that shows `seconds` in 80 % of `width`, clamped to fit and `MAX_PPS`; the part gap counts when a stretch crosses
  parts.
- `timeline.js`: `frame({ i0, t0, i1, t1 }, { animate })`: zoom and scroll together so the stretch is centred at
  80 %, one rAF animation of 200 ms ease-in-out from wherever the view is (a new frame mid-motion restarts from
  there), a jump under Reduce Motion, `onZoom` at the end so the zoom slider follows; `inView(range)`.
- `review.js`: `stretchOf(window)`: the first played span's start to the last one's end, in (part index, source t).
- `review-control.js`: frame on each new stop (start, verdict → next, ↓ / ↑, a click on a stop, a choice, ⌘Z back);
  on ▶ Play / R / Space-replay only when `!inView(stretch)`; never on `changed()`; nothing on leave. Playback starts
  at once, not after the motion.
- **Tests:** pure: `zoomFor` for a 6 s stretch in 1000 pt, a 48 s stretch, a stretch longer than fit (→ 0), one past
  `MAX_PPS` (clamped), across two parts with the gap; `stretchOf` for a middle cut, a head trim, a two-part window.
  `test/timeline.test.mjs`: `frame` without animation lands centred at 80 %; `inView`. `test/review-control.test.mjs`
  (fake timeline): frame called on each new-stop event, not on an edit or on Play while in view, called on Play when
  out of view, not on leave. **Manual:** the motion on a real 20-minute talk (smooth, no jump at the end, the
  playhead stays in view); Reduce Motion jumps. **Design check (Jony).**

### Phase 5: verify and ship
- `npm test`, `cargo test`, a release build; `npm run install-app` from up-to-date main (frontend id checked).
- In the app, on a real Magic run plus a few hand cuts and a head trim: start with R; every cut is there; frame on
  each stop; ▶ Play three times on one cut; Y, N, ⌫, ↑, ↓, ⌘Z; Esc and clicks don't leave; Magic's button is gone and
  ⌘Return does nothing; switch to Magic's cuts and to Not approved yet mid-review; reach the end line (with and
  without Nos); Stop review, then ⌥→ to the first note; start again (All cuts, first unchecked). A keyboard-only pass
  including Stop review, and a VoiceOver pass of one stop.
- Record status here; anything found goes to `issues.txt`. Set `f-cut-review-mode` to shipped and add the line to
  `f-magic-cut-button`.

## Status
- Phase 0 (design and roadmap): done. `design/cut-review.md` rewritten as v2 (Jony); the user's first-try feedback
  added to `design/user-model.md`; the toolbar order recorded in `design/main-screen.md` and `design/ai-slot.md`.
- Phase 1 (engine): done, plus the pure parts of Phase 4. `review.js`: every cut (Magic's + yours, trims named
  "Your cut · start / end of the video"), `inSet` / `setCounts` / `CHOICES`, `nearestUnchecked`, `stretchOf(window,
  parts)` → `{ i0, t0, i1, t1, seconds, gaps }`. `timeline-geometry.js`: `zoomFor(seconds, width, fit, gaps)` and
  `zoomOf(pps, fit)` (the cluster zoom in `timeline.js` now uses it too). `review-session.js`: `only` (All on every
  start), `choose(only)` (false for an empty choice; Not approved taken once), your ⌫'d cuts kept as checked items
  until `leave()`, the end line waits (never turns off), ↑ from the end line, `replay()` plays the clip from its start
  as the edit is now (Space after the end too), `view()` carries `only`, `counts`, `empty` and `stretch`. Stop review
  with Nos says "3 cuts to fix · ⌥→ for the first". 329 UI tests pass.
  - Decision: a Magic step undone **as a whole** drops Magic's items (v1's rule), so the toolbar never offers to
    review cuts that no longer exist; review stays on and the count updates. A single Magic cut put back stays, checked.
  - Not done here (Phase 2–4 UI): `review-control.js` still has Esc → leave and `fixFirst`; the bar still has ✕;
    `timeline.frame()` / `inView()` and calling them from the control.

- Phases 2–4 (screen): built (Jony). 336 UI tests pass; no Rust changed.
  - Phase 2: `reviewKey` has no leave key (Esc and ⌥→ keep their app meaning) and no `fixFirst`; the toolbar button
    toggles Review cuts ↔ Stop review (`reviewButton` → `{ visible, label, primary }`, Stop review is the primary on
    the end line), and it is the only way out; ✦ Magic is hidden while reviewing (its slot keeps its width) and
    ⌘Return does nothing then. An edit, undo or Magic step undone mid-review repaints the count and never leaves.
  - Phase 3: the bar has no ✕ and no Fix the first. Actions ▶ Play (R) · Fix later (N) · Looks good (Y), key caps at
    the right end; the which-cuts menu (native popup, ✓ on the choice, empty choices dimmed) at line 1's right, last in
    Tab order. End line: "All 38 checked / 3 cuts to fix" or "Nothing to fix", "No cuts left" for an emptied set;
    actions hidden, focus rests on the bar. First announcement adds "Stop review is in the toolbar."
  - Phase 4: `timeline.frame(stretch)` (200 ms ease, Reduce Motion jumps, stops on a hand zoom, wheel or pinch;
    playhead paging waits while framing) and `inView(stretch)`. The control frames on every new stop (start, Y, N, ⌫,
    ↑, ↓, ⌘Z back, which-cuts, click on a stop); Play / R / Space-replay frame only if the stop is out of view.
  - Not checked here: the motion and the native menu in the real app; that's Phase 5's manual pass.

- Phase 5 (verify and ship): automated half done (Uncle Bob), from main at `aa06265`.
  - 336/336 UI tests, 114/114 Rust tests (live Claude, Parakeet and VAD tests included).
  - Release build and `npm run install-app`: `/Applications/Magic Cut.app` replaced, frontend id `efdf4e08f976339f`
    matches the built and the installed binary, Spotlight finds it, it opens.
  - `npm run smoke` on the built bundle: codesign ok, Claude answered, a 153.8 s take transcribed in 5.5 s with
    monotonic word times, Magic found the 3 bad takes in `retakes.wav`.
  - Not done: the by-hand pass in the app (open, frame, ▶ Play, which-cuts, only Stop review closes, keyboard and
    VoiceOver). The agent shell can't click, type into or screenshot the app, and the app has no UI test hook, so
    this needs a person (or an agent with screen control) on the installed build.

Next: the by-hand pass of Phase 5 on the installed app, then set `f-cut-review-mode` to shipped.
