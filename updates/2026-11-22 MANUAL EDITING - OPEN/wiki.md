# Manual editing — wiki

Lessons and principles this update relies on. Status lives in `update v1.md`.

## Principles (from the design)
- **Two views, one model.** Timeline and transcript never keep their own cut state; both repaint from `edit`.
- **Source time everywhere**, edited time only in the readout and playback (`playback.js`).
- **⌫ is one toggle** in every place: cut it, or bring it back if it's all cut.
- **One gesture, one undo step.** A whole drag, a run of nudges, a fix, a Magic run.
- **Cuts from words take half the pause on each side**, so a join keeps one natural pause, not two.

## Findings
- (Phase 0) Playback skip: approach and measured numbers go here.
