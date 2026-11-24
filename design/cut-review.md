# Cut review (v4)

Author: Jony · 2026-11-23 · Status: **ready to build.** Feature: `f-cut-review-mode` (and `f-magic-cut-button`: Magic
hides while reviewing).
Plan: `updates/2026-11-23 CUT REVIEW MODE - OPEN/update v4.md` (v4: the bar, below), `update v2.md` (v1 and its build: `update v1.md`). Research:
`research-cut-review.md` in the same folder.
Builds on: `design/notes.md` (a No is a note), `design/magic-trace.md` (verdicts and learning), `design/timeline.md`
(playback over cuts, zoom), `design/main-screen.md` (toolbar, primary action), `design/visual-system.md` (tokens).
Checked against `design/user-model.md`: goal 2 (trust every cut without watching the whole video again), goal 1
(finish tonight), and what the user said after the first real try (2026-11-23, "Observed").

## User goal
"Let me trust every cut without watching the whole video again." A **rhythm, like sorting photos**: see the cut,
hear the join, press a key, the next one comes. Most answers come about 2 s in.

The loop: **Review cuts → the timeline flies to the cut, the clip plays → ✓ or › (▶ to hear it again) → …
→ "All done · All 38 cuts approved" → Stop review.**

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
loop, no auto-advance); ⌘Z right after a verdict undoes it; close cuts form one stop.

## Which cuts are reviewed
- **Items** are every cut in the edit, in play order:
  - **Magic's**: each proposal of the latest Magic run that is still cut (`kept`, `touched`, `adjusted`), plus those
    put back (`restored`), which stay in the count, checked. Keyed by proposal index (outlives a re-normalize).
  - **Yours**: every cut no Magic item overlaps, **head and tail trims included** (they're cuts; the window at the
    start or end of the video plays what the viewer hears first or last). A cut Magic `agreed` with is yours.
    Keyed `you:<part>:<s>`. A cut of yours put back during this session stays in the count, checked, until review
    stops (so "Cut 7 of 38" doesn't jump).
- **The filter** (v4: a segmented control in the bar, below) narrows the set; a new choice starts at its first cut:
  | Choice | The set | Live? |
  |---|---|---|
  | **All** (every start) | Magic's + yours | Live: a cut made during review joins it |
  | **Magic** | Magic's only | Live |
  | **Unapproved** | Cuts with no *Looks good* | **Taken once, when chosen.** A Y doesn't make the cut vanish under you; "Cut 3 of 12" holds. Choosing it again takes it again |
  A choice with no cuts in it is dimmed and can't be picked ("Magic" before any Magic run).
- **Close cuts form one stop** within the chosen set: the next join within 3 s of edited time, at most 3 cuts. The
  window always plays what the viewer hears (every cut skipped, chosen or not).
- **Numbering is within the set:** "7 of 38" under All, "2 of 12" under Unapproved.

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
- **When:** on every new stop: start, Y / ⌫ moving on, ← / →, clicking a stop, changing the which-cuts choice,
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
**v4: icons, fewer words, a clear approved mark** (plan: `update v4.md`). Still v3's slim row **docked under the
player, never over the video**: 40 pt tall, the player's full width, `surface`, a hairline on top, padding 0 12. It is
the player column's last child, so the video scales to fit, whole. Hidden (and taking no space) when not reviewing.

The user found v3 busy and *Fix later* confusing. What went, and why:

| Removed in v4 | Why |
|---|---|
| **Fix later** (and N / M) | A cut is approved or skipped. "Fix it" is ⌫ (put back) or a drag, right now; a third verdict made people stop and think |
| Every word on the buttons, the key caps | Four familiar glyphs say it; the names and keys live in the tooltips and for the screen reader |
| "Cut" before the count, "· 1.2 s cut", "· Start of video" | The timeline frames the cut: its size and place are visible. "7 of 38" is all the bar needs |
| The reason line ("Magic: Earlier take · kept …") | Busy, and rarely read mid-rhythm. It stays one hover away (the counter's tooltip, the cut's own tooltip) and in the announcement |
| The ⌄ which-cuts menu | Three choices fit on screen: a segmented control is one click, shows the state, and needs no popup |
| "Nearest unchecked at or after now" on a new choice | Surprising. A new list starts at its first cut, always |
| "Last cut" at the end | › past the last cut opens the end, so going through every cut always ends somewhere clear |

```
│                           video (never covered)                           │
├───────────────────────────────────────────────────────────────────────────┤
│ [All|Magic|Unapproved]            ‹  ▶  (✓)  ›                  ✓ 7 of 38 │
├───────────────────────────────────────────────────────────────────────────┤
│ transport row …                                                           │
```
Three zones. The left and right share the free space equally, so the centre group is truly centred and the primary
(✓) sits in the middle of the row, under the video, where the eye already is.

- **Left: the filter**, a segmented control `All · Magic · Unapproved` (`role="group"`, "Which cuts"). 28 pt tall,
  `raised` track, 2 pt inset; segments `caption` 11, `textSecondary`; the one on is a `surface` pill, `text`, medium
  weight, `aria-pressed="true"`. Tooltips: "Every cut", "Only Magic's cuts", "Cuts not approved yet". A choice with no
  cuts is dimmed (`aria-disabled`, 40 %) and does nothing ("Magic" before any Magic run, "Unapproved" once every cut
  is approved). Picking one:
  - the set changes, numbering restarts within it, and review goes to **its first cut**, always (checked or not);
  - picking the segment already on does nothing;
  - **Unapproved** is taken once, when picked: approving there doesn't shrink the list under you ("3 of 12" holds).
- **Centre: `‹ ▶ ✓ ›`**, 4 pt apart, 28 pt targets, SVG icons 14 pt, 2.5 stroke, rounded.
  - **‹ ›** Previous / next cut (← / →): quiet (`textSecondary`, hover `raised` fill and `text`). No verdict, no
    wrap. ‹ is dimmed on the first cut. **› on the last cut opens the end.** Chevrons, not triangles: ▶ means Play.
  - **▶** Play (R): quiet. The clip from its start, every press. Never a verdict.
  - **✓** Looks good (Y): **the one primary**, a 36 × 28 pill, filled `accent`, `onAccent` glyph. Then the next
    unchecked cut, or the end.
  - Names, in the tooltip and `aria-label`: "Previous cut (←)", "Play (R)", "Looks good (Y)", "Next cut (→)".
- **Right: the counter**, `caption` 11, `textSecondary`, tabular, never truncated: "7 of 38", or "7–8 of 38" for a
  stop of close cuts. Its tooltip is the reason ("Magic: Earlier take · +1 more" / "Your cut").
- **Motion:** none of its own; the bar doesn't move. The timeline frames each cut (above).

### Approved
A cut with a *Looks good* is **approved**, marked in green: the `ok` token (#34C759, the note card's Done green, `visual-system.md`). Colour
is never alone: the check glyph is always there, and the words say "approved".
- **In the bar** (on an approved cut, e.g. going back with ‹, or a second pass): ✓ turns solid **green**
  (`aria-pressed="true"`, tooltip "Approved · Y for the next cut"), and a 14 pt **green check badge** sits before
  the counter: `✓ 7 of 38`. The announcement ends "Approved".
- **On the timeline**, on or off review: a **1.5 pt green outline** instead of the owner's
  hairline, and the 14 pt green check badge in the cut's **top-right corner** (3 pt in). On a cut too thin for it
  (under 24 pt, no edge handles) the badge hangs centred over the cut's top edge. The cut's length label gives way to
  the badge when both don't fit. Its label ends ", approved"; its tooltip starts "Approved · ".
- A cut put back (⌫) is checked, not approved: it's no longer a cut, so it has no mark.

### The end
When no unchecked cut is left after a verdict, or › is pressed on the last cut, the clip stops and the centre shows
the end (the filter stays, the counter goes):
```
│ [All|Magic|Unapproved]        ‹  (✓) All done  All 38 cuts approved                │
│ [All|Magic|Unapproved]        ‹  End of cuts  30 of 38 approved                     │
```
- **All done** (`body` 13, semibold, `text`) with the green badge, when every cut in the set has been gone through.
  The line after it (`caption`, `textSecondary`): "All 38 cuts approved", "The cut is approved", or "36 of 38
  approved" (two were put back).
- **End of cuts**, no badge, when some were skipped with ›: "30 of 38 approved". The **Unapproved** segment is right
  there to go on.
- **No cuts left** when the set emptied under you (every cut put back with ⌘Z).
- **Review stays on.** The toolbar's **Stop review becomes the filled primary**: it's the one thing left to do. Focus
  rests on the bar (nothing to press by accident).
- ‹ / ← goes back to the last cut. Y, ⌫, R, Space do nothing here.

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
| **Y** or **Return** | Looks good → the next unchecked stop after this one (or the end) |
| **N** / **M** | Nothing (v4: there is no Fix later) |
| **⌫** | Put it back now, checked, then next |
| **R** | ▶ Play: the clip from its start. Never a verdict, never leaves |
| **Space** | Pause / play; after the clip ended: play it again. Even on a focused bar button |
| **→ / ←** or **↓ / ↑** | Next / previous stop (the bar's › ‹), no verdict, no wrap. → on the last stop opens the end; ← / ↑ there: the last stop |
| **⌘Z** | Right after a verdict: undo it and go back. Otherwise the usual undo (review stays on) |
| **Esc** | Its app meaning only (close a card, clear a selection). **Never leaves review** |
| **⌘Return** | Finishes an open note card as usual; never starts Magic while reviewing |

Clicks, edge drags, Shift-←/→ (grow a selection) and ⌥←/→ (notes) keep their meaning; plain ←/→ are review's
(the playhead nudge comes back after Stop review). Clicking a cut that is a stop in the set makes it the current stop
(frames, plays). Clicking any other cut just selects it; review stays on.

## Old "No"s
v4 has no Fix later. A "No" already in the trace (from v2–v3) reads as not approved: the cut is in Unapproved and
has no green mark. Its red note stays a normal note.

## States
| State | Bar | Player | Timeline | Toolbar |
|---|---|---|---|---|
| Reviewing, playing | Filter · ‹ ▶ ✓ › · "7 of 38" | Plays the clip | Framed on the stop | Stop review |
| Clip ended, no verdict | Same | Paused at its end | Same | Same |
| Paused by Space | Same | Paused | Same | Same |
| User zoomed / scrolled away | Same | — | Left alone; ▶ re-frames | Same |
| First cut | ‹ dimmed | Plays | Framed | Same |
| Back on an approved cut | ✓ green and pressed, "✓ 7 of 38" | Plays | Framed; green outline and badge | Same |
| A stop of 2–3 cuts | "7–8 of 38" | One clip | Framed over all of them | Same |
| Filter changed | New count, from 1 | Its first cut plays | Framed | Same |
| A filter with no cuts | That segment dimmed | — | — | — |
| End, every cut gone through | ✓ **All done** · "All 38 cuts approved" | Stopped | Stays | **Stop review** primary |
| End, some skipped | **End of cuts** · "30 of 38 approved" | Stopped | Stays | **Stop review** primary |
| No cuts left | "No cuts left" | Stopped | Stays | **Stop review** primary |
| Magic step undone mid-review | Count updates; Magic's cuts read as put back | — | — | Stop review |
| Not reviewing | Hidden, no space | — | Approved cuts keep their green mark | Review cuts |
| Increase Contrast | Hairlines 100 % | — | — | — |
| Reduce Motion | — | — | Frames by jumping | — |

## Accessibility
- The bar is `role="region"`, "Cut review". On start the live region says "Reviewing 38 cuts. Stop review is in the
  toolbar." Then on each stop: "Cut 7 of 38. Magic: Earlier take." ("… Approved." on an approved cut); at the end
  "All done. All 38 cuts approved."
- Every icon button is named (tooltip and `aria-label`): "Previous cut (←)", "Play (R)", "Looks good (Y)", "Next cut
  (→)". ✓ has `aria-pressed` (true once approved). The filter is a group, "Which cuts", of three `aria-pressed`
  buttons; an empty one is `aria-disabled`. Targets ≥ 28 pt; thin timeline cuts keep their 12 pt hit area.
- Focus enters the bar on ✓ (Return = Yes). Tab: All → Magic → Unapproved → ‹ → ▶ → ✓ → › → out. At the end focus
  rests on the bar. A click on a bar button never takes focus, so the keys keep working. Keyboard-only works end to end.
- Approved is never colour alone: the check glyph, the pressed state, and "approved" in every label.
- The frame motion is not needed to understand anything (the ring, the transcript and the bar say the same).

## Components (each its own file, tested on its own)
- `src/ui/review.js` (pure): `reviewCuts(trace, cuts, parts)` → Magic's + yours (trims in), `inSet(items, only,
  verdicts, taken)` for the three choices, `setCounts` (which choices are empty), `stops`, `reviewWindow`,
  `stretchOf(window)` (the source extent to frame), `step`, `progress`.
- `src/ui/review-session.js`: the chosen set (`only`, All on start; Unapproved taken on choosing), `choose(only)` → its
  first cut, `move(1)` past the last → the end, your put-back cuts kept as checked items, `view()` (`first`, `last`,
  `approved`, `chosen`), `approved()` (the Looks-good ranges the timeline marks). No Fix later.
- `src/ui/cut-view.js`: `cutView(c, { approved })`: green outline, badge, label; `timeline.js` asks `approved()` once
  per cut paint.
- `src/ui/timeline-geometry.js` (pure): `zoomFor(seconds, width, fit)` → the level that shows `seconds` in 80 % of
  `width`, clamped.
- `src/ui/timeline.js`: `frame({ i0, t0, i1, t1 }, { animate })` (zoom + scroll together, rAF, 200 ms, Reduce Motion
  jumps) and `inView(range)`.
- `src/ui/review-bar.js`: the segmented filter, `‹ ▶ ✓ ›` (`ICON`), the counter and its badge, the end (`barCount`,
  `barEnd`, `barReason`, `barAnnouncement`, `badge`).
- `src/ui/review-control.js`: `reviewKey` without Esc / leave / N, R = play; the end repaints the cuts; framing on each new stop and on Play when
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
