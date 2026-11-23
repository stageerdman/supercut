# Notes — wiki

What this update taught us. It holds durable principles, not status. Status is in `update v1.md`.

## Principles
- **A note is a to-do pinned to time, for yourself.** Optimise for "drop it fast, find it again, tick it off".
  Colour and formatting come last.
- **The way back is the feature.** A note you can't find again is clutter. "Next open note" and an open count matter
  more than how a note looks.
- **Making one must not interrupt.** While playing, `M` adds a note and nothing else happens. Text is optional.
- **Done ≠ delete.** Done hides the note and keeps it, delete removes it, and both undo. Done is the loud action and
  delete the quiet one.
- **Notes belong to time, not to cuts.** Then cutting, restoring and dragging never have to know about notes.
- **Their own lane under the track.** It's simpler than making notes clickable through a cut block, and it reads as
  "not part of the video".
- **What you touch is yours.** The rule that protects your cuts from a Magic re-run protects your notes too.
- **AI notes must be rare.** A flood teaches people to ignore every note, their own included. Zero is a normal answer.
  Never use a note to repeat a cut's reason.
- **One key, one meaning.** ⌫ stays cut/restore. `M` stays note, even in the transcript, where it's the one letter
  that doesn't start a fix.

## Magic's notes (Phase 6)
- **The app enforces the caps, the prompt only asks.** Rust keeps known lines, one note per line, the first 5 in time
  order, text cut to 70 characters; `withMagicNotes` then applies the speech cap and your notes. A chatty Claude can't
  flood the lane.
- **The done line counts the notes that landed**, not the ones Claude sent (a deleted spot or one of your notes can
  block one), so it never promises a note you can't find.
- **Q3, first live run (2026-11-23):** on the 42 s retakes sample Claude cut the 3 bad takes and flagged nothing.
  That is the intended answer for a clean talk. Still open: what it flags on a long, messy real recording.

## Open questions carried forward
- Q1 / A16 most notes are empty and made while playing · Q2 should Magic read notes (Pixel) · Q3 what Magic should
  flag, and how many · Q4 / A17 colour use · Q5 / A19 do CapCut users find ⚑ · Q6 pass-by popups · Q7 is "Show done"
  used · Q8 / A18 how early a note should be · Q9 forgetting to tick after a review fix.
