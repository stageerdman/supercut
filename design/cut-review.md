# Cut review (v2)

Author: Jony · 2026-11-23 · Status: **ready to build.** Feature: `f-cut-review-mode` (and `f-magic-cut-button`: Magic
hides while reviewing).
Plan: `updates/2026-11-23 CUT REVIEW MODE - OPEN/update v2.md` (v1 and its build: `update v1.md`). Research:
`research-cut-review.md` in the same folder.
Builds on: `design/notes.md` (a No is a note), `design/magic-trace.md` (verdicts and learning), `design/timeline.md`
(playback over cuts, zoom), `design/main-screen.md` (toolbar, primary action), `design/visual-system.md` (tokens).
Checked against `design/user-model.md`: goal 2 (trust every cut without watching the whole video again), goal 1
(finish tonight), and what the user said after the first real try (2026-11-23, "Observed").

## User goal
"Let me trust every cut without watching the whole video again." A **rhythm, like sorting photos**: see the cut,
hear the join, press a key, the next one comes. Most answers come about 2 s in.

The loop: **Review cuts → the timeline flies to the cut, the clip plays → Y or N (▶ Play to hear it again) → …
→ "All 38 checked · 3 to fix" → Stop review → ⌥→ through the notes.**

## What changed from v1, and why
The user tried v1. What they asked for, in their words, and what it became:

| They asked | v2 |
|---|---|
| "Zoom in on the cut under review" | Every new stop **frames its clip on the timeline**: zoom and scroll together, 200 ms, the clip filling 80 % of the width |
| "Controls I can't close by accident" | **Stop review is the only way out.** The toolbar's *Review cuts* button reads *Stop review* while reviewing: same button, same place, new text. Esc, ✕, clicks, the last verdict and R no longer leave |
| "A visible Play button that replays the clip, as often as I want" | **▶ Play** in the bar, left end. Always plays the clip from its start. Key R, as before |
| "The Magic Cut button disappears while reviewing" | ✦ Magic Cut is **gone** while reviewing, and ⌘Return does nothing then. A Magic run can't start mid-review, so review never has to end because of one |
| "Review all cuts by default, with a choice like only AI cuts, only unapproved" | Review covers **all cuts**: Magic's and yours, head and tail trims too. A small **which-cuts menu** in the bar: *All cuts · Magic's cuts · Not approved yet*. Every start begins at *All cuts* |

## What I removed, and why
| Removed | Why |
|---|---|
| The bar's ✕ | A second way out, and the accidental one. One way out, in one place |
| Esc leaves review | The stray exit the user hit. Esc keeps its app-wide meaning (close a card, clear a selection) and nothing more |
| Review closing itself after the last verdict | Leaving is the user's act. The end line waits; Stop review turns into the primary |
| The "Fix the first" button and ⌥→ on the end line | They also left review. After Stop review, the status line offers ⌥→, which already works app-wide |
| R starting *and* stopping review | R plays the clip while reviewing. A key that sometimes exits is the trap the user asked us to remove |
| "Your cuts only when Magic hasn't run" (v1) | One set, all cuts, is easier to trust: nothing is silently left out. The menu narrows it on purpose |
| Counts in the which-cuts menu | "Cut 3 of 12" says the size the moment you pick. An empty set is shown dimmed instead |
| A fourth filter ("Your cuts", "To fix") | Not asked for, and two axes (who × state) in one menu confuse. "To fix" is the notes loop's job (⌥→). Back if the trace shows a need (Q-R7) |
| A progress fill on ▶ Play | The playhead on the zoomed timeline already shows where the clip is and when it ended |
| Re-framing after the user edits or zooms | Never move the view under the pointer. Only a new stop (or ▶ Play with the clip out of view) frames it |

Unchanged from v1 and still right: a mode of the same screen, one bar; time order; the window waits at its end (no
loop, no auto-advance); N makes an empty red note; ⌘Z right after a verdict undoes it; close cuts form one stop.

## Which cuts are reviewed
- **Items** are every cut in the edit, in play order:
  - **Magic's**: each proposal of the latest Magic run that is still cut (`kept`, `touched`, `adjusted`), plus those
    put back (`restored`), which stay in the count, checked. Keyed by proposal index (outlives a re-normalize).
  - **Yours**: every cut no Magic item overlaps, **head and tail trims included** (they're cuts; the window at the
    start or end of the video plays what the viewer hears first or last). A cut Magic `agreed` with is yours.
    Keyed `you:<part>:<s>`. A cut of yours put back during this session stays in the count, checked, until review
    stops (so "Cut 7 of 38" doesn't jump).
- **The which-cuts menu** narrows the set:
  | Choice | The set | Live? |
  |---|---|---|
  | **All cuts** (every start) | Magic's + yours | Live: a cut made during review joins it |
  | **Magic's cuts** | Magic's only | Live |
  | **Not approved yet** | Cuts with no *Looks good*: unchecked ones and Nos | **Taken once, when chosen.** A Y doesn't make the cut vanish under you; "Cut 3 of 12" holds. Choosing it again takes it again |
  A choice with no cuts in it is dimmed and can't be picked ("Magic's cuts" before any Magic run).
- **Close cuts form one stop** within the chosen set: the next join within 3 s of edited time, at most 3 cuts. The
  window always plays what the viewer hears (every cut skipped, chosen or not).
- **Numbering is within the set:** "Cut 7 of 38" under All cuts, "Cut 2 of 12" under Not approved yet.

## Starting
- **Toolbar, far right: Review cuts.** Shown whenever there is at least one cut and Magic isn't running. After a Magic
  run, until every cut is checked, it is the **primary** (filled) and ✦ Magic Cut is plain. Tooltip "Review cuts (R)".
- **Toolbar order changes:** `✦ Magic Cut` then `Review cuts`, so Review sits far right (where the primary sits,
  `design/main-screen.md`) and **does not move** when Magic disappears or when its label changes.
- **R** starts review (not in a text field, not with words selected). The Magic done line still says "· R to review".
- Review opens on **All cuts**, at the first unchecked stop. All checked → the first stop, showing its verdict.
- On entering: any selection is dropped, an open note card closes, ✦ Magic Cut hides, the button reads *Stop review*,
  the timeline frames the first stop and its clip plays at once.

## While reviewing, the screen
- **Toolbar:** title, status, gear, **Stop review**. Nothing else on the right.
- **Timeline: framed on the stop** (next section), its cut ringed (the normal selected-cut ring).
- **Transcript:** the stop's struck words scroll into view (centred) and are ringed, as in v1.
- **The bar** docked under the player, never over the video (below).

## The timeline frames each stop
The clip is hard to judge as a 4-pixel mark on a 20-minute timeline. Each stop brings it close.
- **The stretch** is the window's source extent: from the start of its first played span to the end of its last,
  **including the cut(s) inside**, across parts when the window crosses one (the part gap counts in the width).
- **Zoom** so the stretch fills **80 % of the timeline's visible width**, centred (10 % air each side). Clamped: never
  past the deepest zoom (`MAX_PPS`), never out past fit. A stretch longer than the whole view at fit (a long retake
  cut) just fits.
- **When:** on every new stop: start, Y / N / ⌫ moving on, ↓ / ↑, clicking a stop, changing the which-cuts choice,
  ⌘Z going back. **▶ Play / R / Space-replay** frame it again only if the stretch is no longer fully in view (the user
  scrolled away); if it is in view, the zoom is left alone (the user may have zoomed in to drag an edge).
- **Never on:** an edit (dragging an edge, ⌫ on a selection), a hand zoom or scroll. The view doesn't move under the
  pointer.
- **Motion:** zoom and scroll move together, 200 ms ease-in-out (`visual-system.md`, "things that move"), the stretch's
  centre travelling to the view's centre. The clip starts playing at once; it doesn't wait for the motion. A new
  frame mid-motion starts from where the view is. **Reduce Motion:** it jumps.
- **The playhead** runs through the framed clip; at 80 % it never leaves the view, so the timeline doesn't scroll
  while the clip plays.
- The transport row's zoom slider follows (it reads the same zoom level).
- **Stop review leaves the zoom where it is:** the user is at the last cut, which is where they'll want to fix things.

## The bar
**v3: docked, never over the video.** The user rejected v2's floating card ("a pop-up covering a big part of the
video"). The bar is now **one slim row docked under the player**: 40 pt tall (the transport row's height), the
player's full width, `surface`, a hairline on top, padding 0 12. It is the player column's last child, so the player
gives up 40 pt and the video scales to fit, whole. Hidden (and taking no space) when not reviewing.

```
│                         video (never covered)                         │
├───────────────────────────────────────────────────────────────────────┤
│ ‹ ›  Cut 7 of 38 · 1.2 s cut  Magic: Earlier take · kept “…”   All cuts ⌄  [▶ Play R] [Fix later N] [Looks good Y] │
├───────────────────────────────────────────────────────────────────────┤
│ transport row …                                                       │
```
- **‹ ›, left end:** previous / next cut (← / →, as ↑ / ↓): no verdict, no wrap; the timeline frames that cut. Quiet
  icon buttons (28 pt, `textSecondary`, hover `text`). Chevrons, not triangles: ▶ means Play. Dimmed with
  `aria-disabled` at the first / last cut (a press still says "First cut" / "Last cut"); on the end line ‹ goes to
  the last cut and › is dimmed. Names "Previous cut (←)" / "Next cut (→)".
- **The count** (`caption` 11, `textSecondary`, tabular, never truncated): "Cut 7 of 38" / "Cuts 7–8 of 38",
  " · 1.2 s cut", then " · Start of video" / " · End of video" when it applies.
- **The which-cuts menu**, right of the text, before the actions: the choice's name and a small
  chevron ⌄ (`caption` 11, `textSecondary`, hover `text`, 28 pt tall target). Click (or Return when focused) opens the
  native menu, the same popup the right-click menu uses (`context-menu.js`):
  ```
  ✓ All cuts
    Magic's cuts
    Not approved yet
  ```
  The menu owns the keys while open (↑/↓ move in it, Return picks, Esc closes it, nothing else). Picking:
  - the set changes, numbering restarts within it;
  - review moves to the **first unchecked stop of the new set at or after where you are in time**; none after → the
    first unchecked from the start; none at all → that set's end line;
  - the timeline frames it and it plays. The status line says nothing: line 1 changes, and that's the feedback.
- **The reason** (`body` 13, `text`, after the count, takes the free space and ends in …), as v1. Magic's: "Magic: Earlier take · kept “…”" with a check note's text after.
  Yours: "Your cut". Head / tail trims: "Your cut · start of the video" / "· end of the video". Several cuts:
  " · +1 more". One line, then "…"; the full text in the hover and the screen-reader label.
- **The actions, right end.** Key caps move to the **right end of each button**, like shortcuts in a Mac menu (`caption`,
  1 pt hairline, radius 4; on the primary, `onAccent` at 40 %):
  - **▶ Play** `R`: secondary (plain, hairline border), first of the three. Plays the clip from its start, every press, as
    often as wanted. Never gives a verdict. Its label doesn't change while playing (pressing it restarts the clip).
  - **Fix later** `N`: secondary.
  - **Looks good** `Y`: the one primary, filled `accent`, `onAccent` text, right end.
  - All three 28 pt tall, 8 pt apart.
- **Narrow player:** below 720 pt the reason goes (it stays in the hover and the screen-reader text); below 560 pt the
  buttons drop their words and keep ▶, their key caps and their names. The count, the arrows and the menu stay.
- **The verdict already given** (↑ back, a second pass): "✓ Looks good" / "Noted" in `noteRed`, as v1.
- **Motion:** the text crossfades between stops (120 ms); the bar doesn't move. Reduce Motion: no fade.

### The end line
When no unchecked stop is left after the last verdict, the clip stops and the row shows (no actions):
```
│ ‹ ›  All 38 checked  3 cuts to fix                                      All cuts ⌄ │   or "Nothing to fix"
```
- Line 1: "All 38 checked", or "35 of 38 checked" when some were skipped with ↓. The which-cuts menu stays: pick
  another set to go on (e.g. Not approved yet).
- Line 2: "3 cuts to fix" or "Nothing to fix".
- **Review stays on.** The toolbar's **Stop review becomes the filled primary**: it's the one thing left to do.
- ↑ goes back to the last stop. Y, N, ⌫, R, Space do nothing here.

## Leaving: Stop review, and only that
- **Stop review** (the toolbar button: click, or Return when it has focus; Space stays review's pause / play
  everywhere, so a stray Space can't press it). Review stops, the clip pauses where it is, the bar goes, ✦ Magic Cut comes back, the
  button reads *Review cuts* again. The zoom stays.
- **The status line** (3 s): "12 of 38 checked · R to go on"; with Nos: "3 cuts to fix · ⌥→ for the first". The next
  start opens at the first unchecked stop (of All cuts).
- **Nothing else leaves:** not Esc, not a click anywhere, not R, not the last verdict, not ⌘Z, not an edit, not an
  undo of the Magic step (the Magic cuts read as put back, checked; review goes on with the count updated), not
  opening the rules panel. Only closing the project or the window ends it, like any state.
- If the set empties under you (every cut put back with ⌘Z), the bar's line 1 reads "No cuts left", line 2 is empty,
  and Stop review is the primary.

## Toolbar states
| State | Left of Review | Review button |
|---|---|---|
| No cuts | ✦ Magic Cut (primary, far right alone) | hidden |
| Cuts, no Magic run / all checked | ✦ Magic Cut primary | **Review cuts**, plain |
| Magic done, cuts unchecked | ✦ Magic Cut plain | **Review cuts**, primary |
| Magic running | ✦ pill with ✕ | hidden |
| Reviewing | — (hidden) | **Stop review**, plain |
| Reviewing, end line or no cuts left | — | **Stop review**, primary |

The button has **one fixed width** (the wider of its two labels plus padding), text centred, so it never changes size.
Its name is its label ("Review cuts" / "Stop review"); no `aria-pressed` (the text says the state).

## Keys
Review keys work whenever review is on and no text field or open menu has focus, **even with words selected**.

| Key | Action |
|---|---|
| **Y** or **Return** | Looks good → the next unchecked stop after this one (or the end line) |
| **N** (or **M**) | Fix later → an empty red note about the cut, then next |
| **⌫** | Put it back now, checked, then next |
| **R** | ▶ Play: the clip from its start. Never a verdict, never leaves |
| **Space** | Pause / play; after the clip ended: play it again. Even on a focused bar button |
| **→ / ←** or **↓ / ↑** | Next / previous stop (the bar's › ‹), no verdict, no wrap ("Last cut" / "First cut"). ← / ↑ on the end line: the last stop |
| **⌘Z** | Right after a verdict: undo it and go back. Otherwise the usual undo (review stays on) |
| **Esc** | Its app meaning only (close a card, clear a selection). **Never leaves review** |
| **⌘Return** | Finishes an open note card as usual; never starts Magic while reviewing |

Clicks, edge drags, Shift-←/→ (grow a selection) and ⌥←/→ (notes) keep their meaning; plain ←/→ are review's
(the playhead nudge comes back after Stop review). Clicking a cut that is a stop in the set makes it the current stop
(frames, plays). Clicking any other cut just selects it; review stays on.

## A "No"
As v1: an ordinary red note `{ part, s, e, text: '', color: 'red', by: 'you', about: { s, e, by } }` over the stop's
cuts, one per part, one undo step "Review: fix later"; the verdict goes in the trace (Magic's) or the session (yours).
No → Yes removes the note only if it's still empty and not done.

## States
| State | Bar | Player | Timeline | Toolbar |
|---|---|---|---|---|
| Reviewing, playing | Count · menu · reason · actions | Plays the clip | Framed on the stop | Stop review |
| Clip ended, no verdict | Same | Paused at its end | Same | Same |
| Paused by Space | Same | Paused | Same | Same |
| User zoomed / scrolled away | Same | — | Left alone; ▶ Play re-frames | Same |
| Back on a checked stop | Chosen verdict shows | Plays | Framed | Same |
| Start / end of video | " · Start of video" / " · End of video" | 6 s from 0:00 / to the end | Framed | Same |
| A stop of 2–3 cuts | "Cuts 7–8 of 38", " · +1 more" | One clip | Framed over all of them | Same |
| A long cut (42 s) | " · 42 s cut" | 6 s around the join | Fits the stretch, or fit | Same |
| Menu open | Same | Keeps playing | Same | Same |
| Set changed | New count | Next stop in it plays | Framed | Same |
| Set is empty | — (the choice is dimmed) | — | — | — |
| End line | "All 38 checked" · "3 cuts to fix" | Stopped | Stays | **Stop review** primary |
| No cuts left | "No cuts left" | Stopped | Stays | **Stop review** primary |
| Magic step undone mid-review | Count updates; Magic's cuts read as put back | — | — | Stop review |
| Narrow player (< 720 / < 560 pt) | The reason goes, then the buttons' words (▶, key caps, names stay) | — | — | — |
| Increase Contrast | Hairlines and key caps 100 % | — | — | — |
| Reduce Motion | No crossfade | — | Frames by jumping | — |

## Accessibility
- The bar is `role="region"`, "Cut review". On start the live region says "Reviewing 38 cuts. Stop review is in the
  toolbar." Then on each stop: "Cut 7 of 38. Magic: Earlier take, kept so today we want to…".
- Names: "Play (R)", "Fix later (N)", "Looks good (Y)", "Which cuts: All cuts" (`aria-haspopup="menu"`), "Review
  cuts (R)" / "Stop review". Targets ≥ 28 pt.
- Focus enters the bar on Looks good (Return = Yes). Tab: ‹ → › → which-cuts → Play → Fix later → Looks good → out to the
  screen; the toolbar's Stop review is reachable by Tab (and Shift-Tab) like any toolbar button. Keyboard-only works
  end to end, including leaving.
- The frame motion is not needed to understand anything (the ring, the transcript and the bar say the same).
- The chosen verdict is shown by ✓ and the word "Noted", not colour alone.

## Components (each its own file, tested on its own)
- `src/ui/review.js` (pure): `reviewCuts(trace, cuts, parts)` → Magic's + yours (trims in), `inSet(items, only,
  verdicts, taken)` for the three choices, `setCounts` (which choices are empty), `stops`, `reviewWindow`,
  `stretchOf(window)` (the source extent to frame), `nearestUnchecked(list, verdicts, fromTime)`.
- `src/ui/review-session.js`: the chosen set (`only`, reset to All on start; Not approved taken on choosing), your
  put-back cuts kept as checked items, the end line never closing, ↑ from the end line, `choose(only)`.
- `src/ui/timeline-geometry.js` (pure): `zoomFor(seconds, width, fit)` → the level that shows `seconds` in 80 % of
  `width`, clamped.
- `src/ui/timeline.js`: `frame({ i0, t0, i1, t1 }, { animate })` (zoom + scroll together, rAF, 200 ms, Reduce Motion
  jumps) and `inView(range)`.
- `src/ui/review-bar.js`: ▶ Play, key caps on the right, the which-cuts menu button, no ✕, no Fix the first, the
  two-line end line, "No cuts left", narrow layout.
- `src/ui/review-control.js`: `reviewKey` without Esc / leave, R = play; framing on each new stop and on Play when
  out of view; `changed()` never leaves; `reviewButton` → `{ visible, label, primary }`.
- `src/ui/magic-button.js` + `src/index.html` + `src/main.js`: the new order, fixed width, label swap, Magic hidden
  and ⌘Return blocked while reviewing, the status line after Stop review.

## Open questions (none block the build)
| # | Question | How to check |
|---|---|---|
| Q-R1 | Is 3 s + 3 s right? | Verdicts store `after`; look where answers land |
| Q-R2 | Do people review past cut 5? | Checked stops per session from the trace |
| Q-R3 | Do people need to hear the removed part? | Watch 3 users on long cuts |
| Q-R6 | Is 80 % the right frame, or do people want more of the context around the cut? | Watch 3 users; count hand zoom-outs right after a frame |
| Q-R7 | Is a "Your cuts" or "To fix" choice missed? | Ask after a review of a hand-cut video; count Stop review → ⌥→ |
| Q-R8 | Should your own cuts' verdicts outlive closing the app (today: the session only)? | Count reopened projects reviewed again under Not approved yet |
