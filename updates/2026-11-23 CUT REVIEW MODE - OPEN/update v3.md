# Cut review mode: update v3 — the docked bar and ‹ › cut arrows

Builds on `update v2.md` (all of it stays). Design: `design/cut-review.md`, "The bar" (v3, Jony). Build: Jony.

## Why v3
The user's verdict on v2's bar: "it looks like a pop-up window covering a big part of the video — not acceptable."
A floating three-line card over the player hides the very frames being judged. They also asked for arrows to go to
the previous and next cut, with ← →.

## Goal
1. **The video is never covered.** The bar is one slim row (40 pt, like the transport row) docked **under the
   player**, across the player's width. The player gives up those 40 pt; the video scales to fit, whole.
2. **‹ ›** at the bar's left end: previous / next cut (no verdict, no wrap), also **← / →** while reviewing. Each frames
   the timeline on that cut, as every new stop does. ↑ / ↓ keep working.
3. Kept, in one line: the count and reason, the which-cuts menu, ▶ Play (R), Fix later (N), Looks good (Y). Stop
   review stays the toolbar's, the only way out.

## Decisions
- **Docked, not floating.** A row under the video, never over it; same height as the transport row so the screen reads
  as two calm bands. The note card still floats as before (it's not review's).
- **Chevrons, not triangles.** ‹ › for cuts; ▶ means Play only. Dimmed (`aria-disabled`) at the first / last cut;
  ‹ on the end line goes to the last cut.
- **← → are review's while reviewing** (as ↑ ↓). Shift-← → keep growing a selection; ⌥← → keep jumping notes. The
  playhead's ← → nudge waits until Stop review: in review the clip plays itself.
- **One line, shed in order** as the player narrows: first the reason (it stays in the hover and the screen-reader
  text), then the button words (▶, key caps and names stay).
- Order left → right: ‹ › · count · reason … which-cuts · ▶ Play · Fix later · **Looks good** (primary, far right).
  Tab follows it; focus still enters on Looks good.

## Roadmap
### Phase 1: the docked bar (`review-bar.js`, `index.html`, `main.js`)
- A player column wraps `#player-box`; the bar is its last child: `flex h-10 border-t`, hidden when not reviewing.
- One line: arrows, head + reason, menu, actions; end line = "All 38 checked · 3 cuts to fix" (no actions).
- Width from the column (ResizeObserver, so dragging the transcript divider re-lays it out).
- **Tests** (`test/review-bar.test.mjs`): docked in the host's flow (no absolute, no shadow); arrows named
  "Previous cut (←)" / "Next cut (→)" and call back; dimmed at the ends; Tab order; end line one row; narrow drops
  reason then words.

### Phase 2: ‹ › and ← → (`review-session.js`, `review-control.js`)
- `view()` carries `hasPrev` / `hasNext`; `reviewKey` maps ← → (no Shift) to `up` / `down`; the control gets
  `prev()` / `next()` that move and frame.
- **Tests** (`test/review-control.test.mjs`, `test/review-session.test.mjs`): ← → keys; Shift-← → stay the app's;
  prev / next frame the timeline; flags at the first, last and end line.

### Phase 3: verify and ship
- `npm test`; push the branch. In-app check of the docked row comes with v2's Phase 5 pass.

## Status
- Phase 0 (this plan, design v3): done.
