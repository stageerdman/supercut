# Better audio swap — wiki

## Design principles (2026-11-24)
- **Let the sound decide.** Whether a file is "the same moment, better mic" or something else (voice-over, music) is
  answered by whether it fits the video's sound — not by asking the user. That keeps one drop for everything, now
  and later.
- **Trust comes from the senses first.** People check sync with their eyes on the lips. A number ("+3.217 s") adds
  nothing; a redrawn waveform, a plain sentence and a one-frame nudge do.
- **Expensive work waits for intent when the input may still change.** Transcribing the camera audio is wasted once
  the mic file arrives, so Generate is the user's call — but Magic still does it in one press.
