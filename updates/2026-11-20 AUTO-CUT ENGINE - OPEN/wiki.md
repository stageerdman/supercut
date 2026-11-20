# Auto-cut engine — what we learned

- **Let code find candidates, let Claude judge, let code enforce the rule.** Word-overlap grouping finds retakes
  reliably and cheaply; Claude is good at "is this a false start or a different sentence"; the "keep the last take"
  rule is too important to leave to a prompt, so it's applied after Claude answers.
- **LCS ÷ shorter line** catches both a full retake and a false start (a prefix of the retake) with one measure.
  Require at least two shared words: one shared "the" or "okay" is noise.
- **A pause is a line break.** Parakeet punctuates a false start oddly ("how to um."), and sometimes not at all
  ("And it keeps the uh the"); splitting at a 1 s pause gives the abandoned take its own line anyway.
- **Claude only sees numbers.** It answers with line ids; times come from the words. Its answer is checked: every
  line decided once, no unknown ids — otherwise the run fails with a plain error and nothing changes.
- **Anything Claude writes that the user reads needs a rule.** Without one it wrote "redone in 3": a line number
  the user never sees.
- **macOS `say` makes a usable test recording.** `[[slnc 1500]]` inserts pauses; `--data-format=LEI16@16000` writes
  the 16 kHz WAV Parakeet wants. Repeatable, no recording to commit.
