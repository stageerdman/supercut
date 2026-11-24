# Better audio swap: what we learned

## Where it lives
- **Sync:** `src-tauri/src/swap/sync.rs` (pure). **Mux plan:** `swap/plan.rs` (pure). **Make it:** `swap/mod.rs`
  (decode, sync, mux into `~/Library/Caches/xyz.supercut.editor/swap`). **Command:** `swap_audio(id, recording,
  offset?)` in `main.rs`, returns the part with its `swap: { recording, offset, synced, media }`.
- `Part::media()` (Rust) and `mediaOf(part)` (`src/ui/media.js`) are the one rule: every consumer (player, preview,
  waveform, learning clips, transcription) reads the swapped file when there is one.
- **Transcription on demand:** `src/ui/transcripts.js`. Nothing starts on load. `window.magicCut.transcribe(ids?)`
  asks for words, `window.magicCut.swapAudio(id, path, offset?)` swaps the sound (for the phase 5 controls).
  Magic asks for every part's words when pressed and waits for them. ⇧⌘T asks too, until the Transcribe control.

## Sync: numbers worth keeping
- The onset curve (rise of log loudness every 5 ms) beats raw waveform correlation across mics: gain, EQ and room
  tone change the waveform a lot and the onsets very little.
- Margins seen in the tests: the same speech through a "different mic" peaks at a normalised correlation of
  **≥ 0.52** with the peak **≥ 4×** the next best lag. Unrelated sound: **0.06**, lead **1.19**. A match needs both
  likeness ≥ 0.2 and lead ≥ 1.3 (`sync.rs`): the likeness test carries the margin; the lead alone is close (1.19 vs
  1.3), so don't loosen it without a new unrelated-sound sample.
- A clap at the start needs no special code: it is the strongest onset there is.

## Mux: what surprised us
- AAC packs sound in 1024-sample frames: the muxed sound can be about **0.06 s** longer than asked. Tests allow
  that slop; the picture is copied, so the video's own length is exact.
- Keeping the source container (mov stays mov, mp4/m4v stay mp4) means any codec the video held still fits.

## Known limits
- Clock drift between camera and recorder is not corrected: one offset for the whole take. Over a long take two
  devices can drift tens of ms (see issues.txt).
- A swap while that part is being transcribed: the running job may finish from the old sound and clear "stale".
  Ask again to regenerate.
