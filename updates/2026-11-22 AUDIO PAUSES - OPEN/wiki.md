# Audio pauses — what the spike taught us

Spike: `spike/` (Node + onnxruntime-node, outside the app). Real pipeline for words: the app's own
`supercut --transcribe` (bundled ffmpeg + Parakeet TDT v3 int8). Recordings and models live in git-ignored `models/`.

## Principles
- **A transcript is text, not timing.** Parakeet's word times are 80 ms-coarse, start up to 0.3 s early, and a word's
  end (with its punctuation token) runs into the silence after it, often right up to the next word. On a clip with
  ten clear 0.4–1.2 s silences, word gaps showed **one** pause. Pauses must come from the audio.
- **Loud is not talking.** On a real 21-min two-person take, an energy detector called room sound, movement and
  the other person "voice": 42 pauses vs ~130 by Silero, and 3 min of the end (non-speech sound at −25 dBFS) was
  all "voice". A speech model is needed to tell talking from sound.
- **Missed words are mostly a chunking problem, not a model problem.** Parakeet fed 120 s chunks dropped whole
  sentences. The same audio cut into ≤ 30 s pieces at silences: missed speech fell from 33 stretches / 44 s to
  8 stretches / 3.6 s (left: short "mm-hmm"/"yeah" from the other person), words 2344 → 2693, and it ran faster.
- **A stretch heard alone is heard better.** Re-recognizing a missed stretch on its own (0.3 s padding) recovered the
  sentence every time it was real speech. That is the cheap "fix missed words" helper.
- **One model, two jobs.** Silero gives the pieces for transcription and the speech runs for pauses. Same samples,
  same ONNX Runtime the app already has.

## Numbers

Generated clips (`spike/make-audio.js`: macOS `say`, fillers, a −28 dB mumble, a quiet "yeah", known silences;
truth from the clean signal). "False pauses" = pauses lying over real speech. "Found" = share of true pause time shown.

| clip | words today (false / found) | energy RMS hysteresis | Silero |
|---|---|---|---|
| clean | 0 / 6 % | 0 / 95 % | 1 (0.11 s, the mumble) / 92 % |
| room noise −50 dBFS | 1 / 6 % | 1 (0.24 s) / 100 % | 1 (1.5 s, mumble missed) / 97 % |
| fan noise −35 dBFS | 2 / 11 % | 4 / 100 % | 4 / 97 % |

The fan clip puts the mumbles under the noise: nobody (Parakeet, energy, Silero) hears them. Not a fair test; kept as
the limit. On generated audio energy looks best — because TTS has no breaths, room sound or second person.

Real take (`2026-11-20 21-41-18.mov`, 21.4 min, Czech, two people):

| | app today (120 s chunks) | ≤ 30 s silence-split pieces |
|---|---|---|
| words | 2344 | 2693 |
| transcription time (debug build) | 219 s | 113 s (incl. 43 model reloads) |
| speech with no word on it | 33 stretches, 44.4 s | 8 stretches, 3.6 s |
| word-gap pauses with speech in them | 157 of 177 (136 s of speech) | 135 of 171 (59 s) |
| …short pauses inside running speech (word-time error) | 73 | 70 |
| …hiding ≥ 1 s of speech (missed words) | 26 (86 s) | 10 (16 s) |

So even with a better transcript, word gaps still put ~135 pauses over talking (time errors), which is why pauses
must come from Silero's speech runs, not only from fixing the transcript.

Silero speed in Node: 21 min in 10–30 s (per-call overhead). Expect faster from Rust.

## What didn't work
- **Word gap AND audio silence.** Words veto real pauses (their ends are stretched): 4–6 % of true pause time found.
- **Waveform peaks (u8 per 10 ms) as a detector.** Can't represent anything under −48 dBFS; a quiet recording's
  floor is invisible. Fine for drawing, not for deciding.
- **Fixed energy thresholds.** Any floor-relative threshold is either deaf to quiet speech or fooled by room sound.

## Known limits of Silero
- Very quiet speech (−28 dB under normal speech) can be called silence: on the clean clip a 0.3 s piece of the
  mumble was under a pause. Lowering thresholds (0.3 / 0.15) halves that but adds others. Pauses are suggestions
  the user reviews, so 0.5 / 0.35 (Silero's defaults) stays.
- Breaths, laughs, coughs and clicks are not speech: they show up inside pauses. That's usually what you want to cut.
