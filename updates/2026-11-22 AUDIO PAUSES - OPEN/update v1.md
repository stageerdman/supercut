# Audio pauses — update v1

## Goal
Pauses come from the audio, not from gaps between transcript words, so the timeline never shows a pause
where the person is still talking. And the transcript misses fewer words in the first place.

## Status
- [x] Phase 0 — research spike (this folder, `spike/`). Done 2026-11-22. Findings in `wiki.md`.
- [ ] Phase 1 — `vad.rs`: Silero VAD v5 in Rust
- [ ] Phase 2 — transcribe in silence-split pieces (root cause of missed words)
- [ ] Phase 3 — pauses from speech runs, not words
- [ ] Phase 4 — what's still unheard: mark it, re-recognize it on request

## Decision
**Silero VAD v5 (MIT, 2.3 MB ONNX), run on the same 16 kHz samples we already decode for Parakeet, through the
ONNX Runtime we already ship (`parakeet_rs::ort`).** It does two jobs:
1. splits the recording into ≤ 30 s pieces at silences before Parakeet hears it (fixes most missed words), and
2. gives the speech runs that pauses are made from.

Rejected: energy/RMS thresholds (on the real take, room sound and the other person's noise count as "voice":
42 pauses in 21 min instead of ~130, and no way to tell talking from sound); the 100/s waveform peaks (same,
plus u8 can't go below −48 dBFS); "word gap AND silent audio" (Parakeet's word ends run into the silence after
them, so words veto real pauses: 6 % of true pause time found on the test clips).

## Phases (for the builder)

### Phase 1 — `src-tauri/src/vad.rs`
- Commit `silero_vad.onnx` v5.1.2 at `src-tauri/models/silero_vad.onnx` (MIT; note the licence in the file
  header) and load it with `include_bytes!` — no download, no resource path.
- Session from `parakeet_rs::ort` (same crate version, same process-wide environment as `parakeet.rs`; ONNX
  Runtime allows one environment per process — init it once and share it). Don't add a second `ort` or a VAD
  crate that brings its own.
- `pub fn speech(samples: &[f32]) -> Vec<Span>` (`Span { s, e }` seconds), 16 kHz only:
  - windows of 512 samples, each input = previous 64 samples (context) + 512 → tensor `[1, 576]`;
    `state` `[2, 1, 128]` f32 zeros, carried from `stateN`; `sr` = int64 scalar 16000. Output `[1, 1]` = p(speech).
  - hysteresis: speech starts at p ≥ 0.5, ends below 0.35.
  - holes under 0.15 s stay speech.
- Tests: silence → no runs; `models/en.wav` → one or more runs covering its words; a tone/noise-only clip → no runs;
  a run never starts before 0 or ends after the length.

### Phase 2 — silence-split transcription (`transcribe.rs`)
- Replace the fixed 120 s / 15 s overlap chunks with pieces built from the speech runs: join runs while the piece
  stays ≤ 30 s, cut in the silence between runs, pad 0.25 s each side. Pieces don't overlap, so the seam/keep-window
  logic goes away.
- One run longer than 30 s with no gap: fall back to today's fixed split for that run only.
- Progress = pieces done / pieces.
- Live test (skips without the model): words don't go backwards; every speech run ≥ 0.5 s has a word on it on
  `models/en.wav` looped; compare word count with the old chunking on the same file (expect ≥).

### Phase 3 — pauses from speech (`Transcript.speech`, `src/ui/pauses.js`)
- `Transcript` gets `speech: [{ s, e }]` (computed once in Phase 1/2, sent with the words).
- `pauses(part.speech ?? words, length)`: the function stays the same (it already takes any `{s,e}` runs:
  BREATH 0.1 s each side, MIN_PAUSE 0.2 s). Words only as a fallback for a transcript without `speech`.
- Tests: a pause is never shown over a speech run; a missed word (speech run with no word) leaves no pause.

### Phase 4 — what's still unheard (feeds "fix words the transcript missed")
**Moved** to `updates/2026-11-22 MISSED WORDS - OPEN/update v1.md` (Phases 1, 2 and 5 there); spec
`design/missed-words.md`. Kept below for its numbers.
- Speech runs with no word on them (≥ 0.3 s) are the transcript's holes. After Phase 2 there are few (8 in a 21-min
  take, mostly "mm-hmm" from the other person). Show them as an unlabelled bit in the transcript/timeline.
- On request, re-recognize just that stretch (0.3 s either side): in the spike this recovered whole sentences.
  Offer the text in the fix field; the user accepts or edits; the words get the run's times.

### Later (not now)
- Snap word edges to speech runs (Parakeet starts words up to 0.3 s early and ends them late, into the silence):
  would make word-exact cuts cleaner. Only if cuts are heard clipping or dragging.
