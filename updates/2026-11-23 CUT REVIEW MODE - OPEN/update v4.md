# Cut review mode: update v4 — icons, fewer words, a clear approved mark

Builds on `update v3.md` (the docked bar stays: the video is never covered). Design: `design/cut-review.md`, "The bar"
(v4, Jony). Build: Jony.

## Why v4
The user: Cut Review is too busy and some buttons are confusing. They asked for:
1. No **Fix later**. A cut is either approved or skipped.
2. **Icons, not words**: ▶ Play, ✓ Looks good, ‹ › previous / next. Tooltips stay.
3. The **"2 of 10"** counter, with nothing around it.
4. The **All cuts** filter kept, redesigned to fit the icons (a neat segmented control).
5. Switching the filter always starts at the **first cut** of the new list.
6. Approved cuts are **clearly marked**, green check, on the timeline and in the bar.
7. A clear, friendly **All done** when every cut has been gone through.

## Decisions
- **One row, three zones.** Left: the filter, a segmented control `All · Magic · Unapproved`. Centre: `‹ ▶ ✓ ›`, the
  transport of review. Right: `2 of 10`. Symmetric and calm; the primary (✓) sits in the middle of the row, where the
  eye already is.
- **Deleted from the bar:** Fix later, every word on the buttons, the key caps, "· 1.2 s cut", "· Start of video",
  the reason line and the ⌄ menu. The reason stays one hover away (the counter's tooltip, the cut's own tooltip on
  the timeline) and in the screen-reader announcement.
- **N / M do nothing in review now.** No key for a verdict that no longer exists. Old "No"s in the trace stay
  harmless (that cut just reads as not approved).
- **Approved = green.** The token `ok` (#34C759, the note card's Done green: the app keeps one green). On the
  timeline an approved cut gets a 14 pt green check badge in its top-right corner and a green outline. In the bar the
  ✓ button turns solid green and the counter gets a small green ✓ before it. Colour is never alone: the check glyph
  and the word "approved".
- **Filter switch → first cut** of the new list, every time (not "nearest unchecked"). Picking the segment already
  on does nothing. Unapproved is taken once when picked (approving there doesn't shrink the list under you).
- **› past the last cut opens the end.** Going through every cut, by ✓ or by ›, always lands on the end state.
- **The end state:** a green check circle, **All done**, and "All 10 cuts approved" — or, when some were skipped,
  **End of cuts** and "8 of 10 approved" (the Unapproved segment is right there to go on). Stop review becomes the
  primary, as before.

## Roadmap
### Phase 1: the session (`review-session.js`, `review-control.js`)
- `choose()` goes to stop 0 of the new list; no-op on the current choice.
- `move(1)` on the last stop goes to the end line; `view()` gives `hasNext` there; `approved` (count of Yes),
  `chosen`, and `approvedRanges()` for the timeline.
- `reviewKey`: N / M gone.
- **Tests:** choose resets to first; › from the last cut opens the end; N no longer a key; approved ranges.

### Phase 2: the bar (`review-bar.js`, `input.css`)
- Segmented filter, `‹ ▶ ✓ ›` icon buttons (SVG, 28 pt targets, tooltips), counter, end state.
- **Tests** (`test/review-bar.test.mjs`): no Fix later, icon-only buttons with names, Tab order, segmented control
  (pressed / dimmed / pick calls back), approved state in the controls, the two end states.

### Phase 3: the timeline mark (`cut-view.js`, `timeline.js`, `main.js`)
- `cutView(c, { approved })` adds the badge and outline; the timeline asks `approved()` once per paint.
- **Tests** (`test/timeline.test.mjs`): an approved cut has the badge and says "approved" to VoiceOver.

### Phase 4: verify and ship
- `npm test`, build, install, look at it in the app; push.

## Status
- Phase 0 (this plan): done.
- Phase 1 (session, keys): done. `approved()` (not `approvedRanges()`); `nearestUnchecked` deleted, unused.
- Phase 2 (the bar): done.
- Phase 3 (timeline mark): done; tested in `test/cut-blocks.test.mjs`.
- Phase 4: done. `npm test` green (360 UI + Rust); built and installed to /Applications/Magic Cut.app; pushed.
