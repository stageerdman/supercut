# Cut review mode: wiki

Durable lessons from designing review. Status lives in `update v1.md`.

- **Design for the 2-second answer.** A verdict mid-window is the main path; the 6 s window is a ceiling. Anything
  that waits for the clip to end (auto-advance, a "next" that appears late) breaks the rhythm.
- **A mode, not a screen.** When the normal screen already shows what a decision needs, a mode adds one bar and
  borrows the rest (selection ring, transcript scroll, timeline centring). Nothing to learn, nothing to keep in sync.
- **Reuse the to-do system for "later".** A "No" is an ordinary note (red, `about` the cut). The notes loop already
  does next / fix / done, so review needs no list of its own.
- **Record what the user says, work out what they do.** Verdicts are the one thing stored; the fix is read from the
  cuts by `outcome()`. A tick on a note is a hint, never proof.
- **Review keys beat type-to-fix.** Letters edit selected words everywhere else; inside review Y/N/R must never reach a
  word, so review drops the selection on entry and takes those keys first.
- **The window is what the viewer hears.** Close cuts share one stop; ends shift the window instead of shrinking it.
