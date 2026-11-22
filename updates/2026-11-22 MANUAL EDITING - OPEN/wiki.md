# Manual editing — wiki

Lessons and principles this update relies on. Status lives in `update v1.md`.

## Principles (from the design)
- **Two views, one model.** Timeline and transcript never keep their own cut state; both repaint from `edit`.
- **Source time everywhere**, edited time only in the readout and playback (`playback.js`).
- **⌫ is one toggle** in every place: cut it, or bring it back if it's all cut.
- **One gesture, one undo step.** A whole drag, a run of nudges, a fix, a Magic run.
- **Cuts from words take half the pause on each side**, so a join keeps one natural pause, not two.

## Findings
- (Phase 0) Playback skip: no spike run; the player uses approach A (`requestVideoFrameCallback`). Numbers for
  overrun and the join still need measuring in the window.
- **One canvas for the visible viewport**, not one per part: at deep zoom a per-part canvas would exceed WebKit's
  canvas size limits; repainting only what's on screen stays cheap while scrolling.
- **A part's outer edges are trims**: dragging them inward makes a cut from the part's start or to its end, so a
  trim is just another cut, undoable the same way.
- **After releasing an edge, the playhead waits 1 s before the join** so you hear the new join right away.
