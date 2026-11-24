# Better audio swap: update v1

## Goal
Drop in a recording from a better microphone (same voice, same take): Magic Cut finds where it lines up with the
video by itself (the clap at the start, or the matching sound), mutes the video's own sound and uses the new one
everywhere the part is heard (playback, the preview, Magic Trace clips, and the export once it exists). Longer than
the video: trimmed to it. Shorter: padded with silence. The same path later takes a voice-over on a video with no
voice, or music. Transcription no longer starts on its own when a video loads: it starts when the user asks for it
(or for something that needs it), and it can be run again from the swapped sound.

## Design (engine)
- **One rule for every consumer:** a part has its `path` (the video the user dropped, kept for undo) and, once
  swapped, a `swap` whose `media` is a remux of that video with the new sound (picture copied, not re-encoded).
  `Part::media()` is what every command decodes or renders from, and what the player plays. Nothing else needs to
  know a swap exists.
- **Offset sign:** `offset` = the second of the video where the new recording's first sample lands. Positive: the
  recorder started after the camera (the sound is delayed). Negative: it started before (its head is dropped).
- **Sync:** both sounds are decoded at 8 kHz; each becomes an onset curve (the rise of log loudness every 5 ms), which
  ignores the mics' gain and tone. One FFT cross-correlation over the whole length finds the coarse lag (a clap is a
  very strong onset, so "clap at the start" and "matching sound" are the same search); a sample-level correlation
  of the waveforms around it refines it to 1/8 ms. A weak or ambiguous peak is "no match": the sound starts with the
  video and `matched: false` says so (the voice-over case, or a recording of a different take).
- **A given offset skips the search.** `swap_audio(id, audio, offset?)`: put-back after undo, a manual nudge later,
  and voice-overs all reuse the same call.

## Phases
1. **Roadmap.** This file. *(done)*
2. **Sync (pure, Rust).** `src-tauri/src/swap/sync.rs`: onset curve, FFT cross-correlation, refinement, confidence.
   Tests: speech-like samples with a known offset both ways through a "different mic" (gain, tone, room noise);
   a clap at the start; unrelated sound gives no match; and, when `npm run sample-retakes` has made it, the real
   spoken `models/retakes.wav` through an ffmpeg-made second mic (EQ, echo, noise).
3. **Replace (Rust).** `swap/plan.rs` (pure): what ffmpeg says about the video (length, has sound) and the mux
   arguments (shift, pad, trim to the video's length, copy the picture). `swap/mod.rs`: decode, sync, mux into the
   cache, atomically. `Project` keeps the swap; `media()` feeds playback, preview, waveform, learning clips and
   transcription. Tests: the plan; a real mux where a longer recording is trimmed and a shorter one padded to the
   video's length, picture untouched; a video with no sound takes a voice-over at 0 s.
4. **Transcription on demand.** No transcript starts on load. `transcribe_part` is the command (it reads the part's
   current media, so running it again after a swap regenerates the words from the new sound). The UI asks for it
   when Magic is pressed (Magic waits for it as before) and exposes `transcribe(ids?)` for the controls the design
   adds. Tests: nothing starts on load, a request starts each part once, a swap makes the old transcript stale and a
   new request replaces it.
5. **The surface (UX team, next item).** Dropping an audio file on a part, the "synced at +1.24 s" feedback and its
   nudge, the Transcribe control, voice-over / music. Not in this item; the engine above is shaped for it.

## Status
- Phase 1: done.
- Phase 2–4: in progress (see below as they land).

## Decisions
- Remux rather than playing a second audio element beside the video: one file means picture and sound can never
  drift in WebKit, and preview/export/transcription need no special case.
- The remux keeps the video's container (mov stays mov, mp4/m4v stay mp4): any codec the source holds, the same
  container holds. The new sound is AAC 256k (transparent for speech; export can re-read the original file later).
- Swaps live in the cache folder (`~/Library/Caches/xyz.supercut.editor/swap`), cleared at start like previews:
  a project lives only as long as the app is open today.
