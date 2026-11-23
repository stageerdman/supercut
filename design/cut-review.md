# Cut review

Author: Jony · 2026-11-23 · Status: **ready to build.** Feature: `f-cut-review-mode`.
Plan: `updates/2026-11-23 CUT REVIEW MODE - OPEN/update v1.md`. Research:
`updates/2026-11-23 CUT REVIEW MODE - OPEN/research-cut-review.md` (Columbo, reasoned, not observed).
Builds on: `design/notes.md` (a No is a note), `design/magic-trace.md` (verdicts and learning), `design/timeline.md`
(playback over cuts), `design/main-screen.md` (toolbar, primary action), `design/visual-system.md` (tokens).
Checked against `design/user-model.md`: goal 2 (trust every cut without watching the whole video again), goal 1
(finish tonight: review must take minutes, not a second viewing), and the habits people bring (Y/N, ↑/↓ from
Premiere / Final Cut / Resolve, Space, ⌫, M, Esc).

## User goal
"Let me trust Magic's cuts without watching the whole video again."
The job is a **rhythm, like sorting photos**: hear the join, press a key, hear the next one. Most answers come about
2 s in. The 6 s window is the most that plays, not the least.

The loop: **Review → hear a join → Y (next) or N (fix later) → … → "3 to fix" → ⌥→ through the notes.**

## What I removed, and why
| Removed | Why |
|---|---|
| A separate review screen or list of cuts | The screen already shows everything a verdict needs: the player, the struck words, the cut on the timeline. Review is a mode of the same screen, with one small bar |
| A progress bar | "Cut 7 of 38" says it. A bar is a second way to say the same thing |
| Auto-advance when a clip ends, and looping | Moving on without a verdict feels like a missed one; a loop nags. The clip stops and waits |
| A text box after No | It kills the rhythm. No makes an empty red note and moves on. Words can be added later, in the note's card |
| A "No" dialog asking *what* was wrong | `outcome()` learns what was wrong from what the user changes later. Asking is slower and less true |
| Least-sure cuts first | Jumping around the story costs a moment to re-orient at every stop, and ↑/↓ means time order in every editor. The doubt signal goes into the reason line instead (Magic's check note there) |
| Playing the removed audio ("peek") | Text first: the struck words are lit in the transcript and the reason line says why. A peek key is a second thing to learn. Back only if review shows people need it (Q-R3) |
| Edge-nudge keys in review | Dragging an edge with the mouse works in review as it does anywhere, then R replays. Keys for it wait for evidence (Q-R4) |
| Bulk "approve the rest" | It hides exactly the cut that matters. Leaving with Esc already says "enough"; unchecked cuts never block anything |
| A confidence score, a badge, stats | Magic has no honest confidence (`design/magic-trace.md`). The count and the reason line are enough |
| A separate "M" meaning in review | M does what N does here. Two keys that both make a note about this cut should not differ |

## Which cuts are reviewed
- **Magic's cuts**, from the latest Magic run: every proposal that is still cut, in time (play) order. Proposals that
  were `agreed` (you had cut it first) or `gone` (part removed) are not stops.
- **No Magic run yet? Your own cuts**, the same way, except head and tail trims (a cut touching a part's start or end):
  those are deliberate and have no join to judge. This settles research Q8: the feature says "AI or user", the old
  decision said "Magic's only". Both hold: Magic first, yours when there is nothing else. A user who has cut by hand and
  presses Review should never get "Nothing to review".
- A cut you put back (⌫), here or earlier, counts as **checked** and is skipped by ↑/↓. It no longer has a join.
- **Close cuts form one stop.** If the next cut's join is within 3 s of edited time after this one's, they join one
  stop, at most 3 cuts. The window plays what the viewer will hear (every cut skipped, yours too), so hearing the same
  seconds twice ("am I on 7 or 8?") can't happen. The bar says "Cuts 7–8 of 38". A verdict applies to every cut in
  the stop; `outcome()` later tells which one the user really changed.

## Starting
- **Toolbar button "Review cuts"**. After a Magic run it is the **primary** (filled) action and ✦ Magic becomes plain,
  as `design/main-screen.md` planned. It exists whenever there is at least one stop. Tooltip "Review cuts (R)".
- **R** starts it (not in a text field, and not with words selected, where letters fix words as today). That
  exception is only for starting: **once review is on, the review keys (Y, N, M, R, Return, Space) win even with
  words selected** (see Keys); only a focused text field takes them.
- **The Magic done line** adds the way in: "38 cuts · 24:10 → 14:52 · R to review · ⌘Z to undo".
- Review opens at the **first unchecked stop** in time order. If every stop is checked, it opens at the first one and
  shows its verdict, so a second pass is possible.
- On entering: any word or time selection is dropped (so Y and N can never type into a word), an open note card
  closes, and the first window plays at once.

## The window
A window is a stretch of **edited time** (what the viewer hears) around the join J.
- **Normal:** J − 3 s to J + 3 s. A stop of several cuts: first J − 3 s to last J + 3 s.
- **Start of video:** fewer than 3 s before J → the window starts at 0:00 and still plays 6 s. The bar says "Start of
  video" so the missing lead-in isn't read as a broken player.
- **End of video:** fewer than 3 s after J → the window ends at the end and starts 6 s before it. "End of video".
- **Two parts:** the window plays across the join of the parts in play order, as the viewer will hear it.
- **Long cuts** (a whole retake): the window is the same, because the join is what's heard. The bar adds the size,
  "42 s cut", and the transcript shows what went.
- **Tiny cuts:** the same. An early Y covers them.
- **Playback:** starts within ~150 ms of the key. The next stop's start is pre-loaded while the current one plays (the
  timeline already pre-loads at cuts). The playhead moves through the window as usual.
- **The window ends with no verdict:** playback stops at the window's end and waits. Nothing moves on its own.

## While a stop plays, the screen shows
- **The bar** (below), with the count and the reason.
- **The transcript** scrolls the stop's struck words into view (centred) and selects the cut, the same ring a selected
  cut gets. Text first: this is what most people judge by.
- **The timeline** centres the stop and rings its cut (the normal selected-cut ring). Nothing new is drawn.

## The bar
One small floating bar, the only new element. It sits where a note card sits: over the bottom of the player, 8 pt above
the transport row, centred on the player, 480 pt wide (at most the player's width − 32), `raised`, radius 10, hairline
border, padding 12. It never covers the timeline or the transcript.

```
┌─────────────────────────────────────────────────────────────┐
│ Cut 7 of 38 · 1.2 s cut                               ✕     │  caption, textSecondary · close (Esc)
│ Magic: Earlier take · kept “so today we want to…”           │  body 13, text, one line, ends in …
│                                                             │
│ R Replay            N  Fix later          [ Y  Looks good ] │  quiet · secondary · primary
└─────────────────────────────────────────────────────────────┘
```
- **Line 1** (`caption` 11, `textSecondary`, tabular): "Cut 7 of 38" or "Cuts 7–8 of 38", then " · 1.2 s cut"
  (the stop's removed length, one decimal under 10 s, whole seconds above), then " · Start of video" / " · End of
  video" when it applies. Right: ✕, quiet, 28 pt target, "Stop reviewing (Esc)".
- **Line 2** (`body` 13, `text`): the cut's reason, the same `reason` string the hover uses (with `keptReason`'s
  "· kept “…”"). If Magic left a check note on this stretch, its text follows: "· Two good takes…". Your own cuts
  read "Your cut". One line, whole words then "…"; the full text is in the hover and the screen-reader label. For a
  stop of several cuts, the first cut's reason, then " · +1 more".
- **Line 3**, the actions, each showing its key as a small key cap (`caption`, 1 pt hairline, radius 4) so nobody has
  to remember them:
  - **Y Looks good**: the one primary, filled `accent` with `onAccent` text. Right end, where the eye ends.
  - **N Fix later**: secondary, plain with hairline border.
  - **R Replay**: quiet text button, left end.
- **The verdict already given** (going back with ↑, or a second pass): the button for it shows as chosen (Yes: a
  check ✓ before "Looks good"; No: "Noted" in `noteRed` instead of "Fix later"). Pressing the other one changes it.
- **Motion:** the bar's text crossfades between stops (120 ms); the bar itself doesn't move. Reduce Motion: no fade.

## Keys
Review keys work whenever review is on and no text field has focus, **even with words selected**. To fix a word in
review, double-click it.

| Key | Action |
|---|---|
| **Y** or **Return** | Looks good → the next unchecked stop **after this one**, playing at once. Any time, mid-window too. No unchecked stop after it → the end line, even if earlier stops were skipped with ↓ (the end line counts them; starting review again with Review cuts or R opens at the first of them). The same goes for N and ⌫ |
| **N** (or **M**) | Fix later → an empty red note about the cut, then next stop. No typing, no dialog |
| **⌫** | Put it back now (the app-wide restore). Counts as checked, then next stop |
| **R** | Replay this window from its start. Never changes the verdict |
| **Space** | Pause / play. After the window has ended: replay. Review owns Space even when a bar button has focus: it never presses the button |
| **↓ / ↑** | Next / previous stop, no verdict. ↑ shows the verdict given and plays it. No wrap: ↓ on the last stop and ↑ on the first do nothing but replay the current window, and the status line says "Last cut" / "First cut" for 2 s |
| **⌘Z** | Right after a verdict: undo that verdict (and its note or restore) and go back to that stop. Otherwise the usual undo |
| **⌥→** | (On the end line) leave review and go to the first note to fix |
| **Esc** | Leave review. Progress stays |

- ←/→ keep their app-wide meaning (one bit), and so do edge drags, clicks and everything else: review is a mode of
  the normal screen, not a cage. After an edit, R replays the window with the change.
- **Clicking a cut that is a stop** (timeline or transcript) makes it the current stop and plays its window.
- **What every verdict says**, in the status line's live region and nowhere else: Y says nothing (the next clip
  starting is the feedback); N says "Noted, fix later"; ⌫ says "Put back". Each for 2 s.

## A "No"
- Adds an ordinary note (`design/notes.md`), one undo step "Review: fix later":
  `{ part, s, e, text: '', color: 'red', by: 'you', about: { s, e, by } }`, over the stop's cuts (source time, the
  first cut's start to the last cut's end in that part). A stop across two parts gets one note per part.
- Red so the "fix later" notes stand out from the user's own yellow ones. The marker is a section bar in the lane,
  ringed while it is the current stop.
- Records the verdict in the trace (`design/magic-trace.md`, "Verdicts"). Nothing else changes: the cut stays as it was.
- **Changing No → Yes** (going back): the note is removed if it is still empty and not done; otherwise it stays (the user
  has written in it, so it's theirs). **Yes → No** makes the note.

## Leaving and the end
- **Esc / ✕ / Review cuts again:** review stops, playback pauses where it is, the bar goes. The status line says "12 of
  38 checked · R to go on" for 3 s. Next time, it opens at the first unchecked stop.
- **The last stop answered:**
  - No "No"s: review closes itself. Status line: "All 38 cuts checked" for 3 s.
  - Some "No"s: the bar stays with the end line, and playback stops:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │ All 38 checked                                        ✕     │
    │ 3 cuts to fix                                               │
    │                                         [ ⌥→  Fix the first ] │
    └─────────────────────────────────────────────────────────────┘
    ```
    "Fix the first" (primary) or ⌥→ leaves review and goes to the first open red note in play order (the notes loop
    takes over: fix, ⌘Return, ⌥→). Esc just leaves.
  - Some stops skipped with ↓: "35 of 38 checked · 3 to fix". Unchecked cuts never block anything; they are only
    mentioned.
- **The toolbar after review:** "Review cuts" goes back to plain once every stop is checked, and ✦ Magic is the
  primary again (export doesn't exist yet; when it lands, it takes the primary, as `design/main-screen.md` says).

## States
| State | Bar | Player | Toolbar |
|---|---|---|---|
| No cuts at all | — | — | No Review button |
| Magic done, not reviewed | — | — | **Review cuts** primary, ✦ Magic plain |
| Reviewing, playing | Count · reason · actions | Plays the window | Review cuts shown pressed (`aria-pressed`) |
| Window ended, no verdict | Same | Paused at the window's end | Same |
| Paused by Space | Same | Paused | Same |
| Back on a checked stop | The chosen verdict shows | Plays the window | Same |
| Start / end of video | " · Start of video" / " · End of video" | Shifted 6 s window | Same |
| A stop of 2–3 cuts | "Cuts 7–8 of 38", " · +1 more" | One window over all of them | Same |
| User edits during review | Count and reason update | R replays with the change | Same |
| Magic runs again (or its step is undone) | Bar goes | Pauses | Status: "Magic ran again · 12 cuts to review" (or "Nothing left to review") |
| Transcribing / Magic running | Review needs a finished run: the button is hidden while Magic runs | — | — |
| End, with Nos | End line, "Fix the first" | Stopped | — |
| End, no Nos | Closes itself | Stopped | Review cuts plain |
| Window too narrow for 480 pt | The bar shrinks to the player's width − 32; "Looks good" / "Fix later" drop their words, keeping key caps (named buttons all the same) | — | — |
| Increase Contrast | Hairline → 100 % border, key caps 100 % | — | — |
| Reduce Motion | No crossfade | — | — |

## Accessibility
- The bar is `role="region"`, "Cut review". On each stop the status live region reads "Cut 7 of 38. Magic: Earlier
  take, kept so today we want to…" (the full reason, not the truncated line).
- Buttons are named "Looks good (Y)", "Fix later (N)", "Replay (R)", "Stop reviewing (Escape)", "Fix the first (Option
  Right Arrow)"; each target is at least 28 pt. Focus enters the bar on Looks good, so Return is Yes. **Space is
  always review's pause / play**, even on a focused bar button (review takes it first, so Space never presses a
  button and never gives a verdict); a focused button is pressed with Return. Tab moves within the bar and on out to
  the rest of the screen.
- Every key has a button; every button has a key. Keyboard-only works end to end.
- The chosen verdict is shown by a ✓ and the word "Noted", not by colour alone. `noteRed` on `raised` is ≥ 4.5 : 1 for
  that one word.

## Components (each its own file, tested on its own)
- `src/ui/review.js` (pure): `reviewCuts(trace, cuts, parts)` (Magic's still-cut proposals, else your non-trim cuts,
  with index, part, s, e, by, reason); `stops(items, parts, cuts)` (grouping within 3 s, cap 3, numbering);
  `reviewWindow(stop, parts, cuts)` → `{ from, to, edge }` in edited time and the source spans it plays;
  `checked(stop, verdicts, cuts)`; `firstUnchecked`, `step(dir)`; `progress` → `{ checked, total, toFix }`.
- `src/ui/trace.js`: `withVerdict(trace, runId, indices, verdict)` and `withoutVerdict(…)` (outside undo, like the rest
  of the trace).
- `src/ui/learning.js`: verdicts in the log, a case for every "No", the heard spans for the clip.
- `src/ui/review-bar.js`: the bar (both lines, actions, key caps, chosen state, end line, narrow layout).
- `src/ui/review-control.js`: entering and leaving, key routing, playing a window (stop at its end, replay, preload),
  verdicts → notes / trace / history, ⌘Z of the last verdict, clicks on a stop, Magic re-run.
- `src/main.js`: the toolbar button and its primary state, R, the done line, handing keys to review first.
- Rust: `save_learning_clip` (ffmpeg, beside `save_learning_log`).

## Open questions (none block the build)
| # | Question | How to check |
|---|---|---|
| Q-R1 | Is 3 s + 3 s right, or 2 s before + 3 s after? | Each verdict stores `after` (seconds into the window). Look at where answers land |
| Q-R2 | Do people review past cut 5? | Count checked stops per session from the trace |
| Q-R3 | Do people need to hear the removed part? | Watch 3 users on long cuts; count Nos on long cuts that end `restored` |
| Q-R4 | Is a key nudge needed in review, or is "N, fix later" plus mouse drags enough? | Count Nos that end `adjusted` with small `ds`/`de` |
| Q-R5 | Is the 3-cut cap right for filler-heavy talks? | Run it on a real "um"-heavy recording and count stops |
