# Better audio swap — update v1

Feature: f-better-audio-swap. Replaces INIT Phase 8 ("Better audio").

## Goal
Drop in a better-mic recording: it lines up with the video by sound and replaces the camera audio (playback, the
preview, Magic Trace clips, and the export once it exists). Longer than the video: trimmed to it. Shorter: padded
with silence. The same path later takes a voice-over on a video with no voice, or music. Transcription starts only
when the user asks (Generate), and after a swap the app offers Regenerate.

## Design (Jony, 2026-11-24) — done
- `design/audio-swap.md` — Replace audio button + drop anywhere, lining up, the four results (lined up / mic shorter /
  not sure / doesn't fit), the Audio panel (per part, one-frame nudge, Replace…, Use camera audio), undo, a11y, and
  the hook for voice-over and music later.
- `design/transcript-panel.md` §6 — the panel is always there once a video is loaded: Generate transcript (names the
  audio it will use), progress in place, Try again; after new audio: a one-time hint row and a ↻ icon by search;
  Regenerate keeps cuts, notes and fixed words, one undo step.
- `design/main-screen.md` — panel rule, state 7, the audio-only banner, updated. `design/user-model.md` — "Better
  audio" section, A29–A33.

### Decisions
- **The drop is the command.** Any audio file = Replace audio. No sync dialog, no clap step, no part picker: each part
  is matched on its own; a part the file doesn't fit keeps what it had.
- **Trust = hearing it, plus honest words.** The waveform redraws from the new audio; the status line says what fit;
  a "not sure" match is applied but says so in a banner with **Adjust**; a file that fits nowhere changes nothing.
- **No A/B toggle** (was in the INIT plan): lips are the check; the way back is Use camera audio or ⌘Z.
- **Generate is raised, not accent**: ✦ Magic Cut stays the one primary, and pressing it without a transcript still
  transcribes first (queued), so the straight line stays drop → Magic.
- **Transcription progress moves into the panel** (where you asked, where the words come); the toolbar status line
  keeps lining up, Magic and other work.
- **"Replace" means the part's own voice.** Voice-over / music later = audio that *doesn't fit*; it gets its own lane.

## Design (engine) — built
- **One rule for every consumer:** a part has its `path` (the video the user dropped, kept for undo) and, once
  swapped, a `swap` whose `media` is a remux of that video with the new sound (picture copied, not re-encoded).
  `Part::media()` (Rust) / `mediaOf(part)` (JS) is what every command decodes or renders from, and what the player
  plays. Nothing else needs to know a swap exists.
- **Offset sign:** `offset` = the second of the video where the new recording's first sample lands. Positive: the
  recorder started after the camera (the sound is delayed). Negative: it started before (its head is dropped).
- **Sync:** both sounds are decoded at 8 kHz; each becomes an onset curve (the rise of log loudness every 5 ms), which
  ignores the mics' gain and tone. One FFT cross-correlation over the whole length finds the coarse lag (a clap is a
  very strong onset, so "clap at the start" and "matching sound" are the same search); a sample-level correlation
  of the waveforms around it refines it to 1/8 ms. A weak or ambiguous peak is "no match": the sound starts with the
  video and `synced: false` says so (the voice-over case, or a recording of a different take).
- **A given offset skips the search.** `swap_audio(id, recording, offset?)`: put-back after undo, the nudge, and
  voice-overs all reuse the same call.
- Remux rather than a second audio element beside the video: one file means picture and sound can never drift in
  WebKit, and preview/export/transcription need no special case. The remux keeps the video's container; the new
  sound is AAC 256k. Swaps live in `~/Library/Caches/xyz.supercut.editor/swap`, cleared at start like previews.

## Engine phases (item "Roadmap + audio sync & replace engine") — done
1. **Roadmap.** This file.
2. **Sync (pure, Rust).** `src-tauri/src/swap/sync.rs`. Tests: speech-like samples with a known offset both ways
   through a "different mic" (gain, tone, room noise); a clap at the start; unrelated sound gives no match; the real
   spoken `models/retakes.wav` through an ffmpeg-made second mic when it exists.
3. **Replace (Rust).** `swap/plan.rs` (pure mux plan), `swap/mod.rs` (decode, sync, mux into the cache). `Project`
   keeps the swap; `media()` feeds playback, preview, waveform, learning clips and transcription. Tests: the plan; a
   real mux trims a longer recording and pads a shorter one to the video's length, picture untouched; a video with
   no sound takes a voice-over at 0 s.
4. **Transcription on demand.** `src/ui/transcripts.js`: nothing starts on load; Magic asks on press and waits; ⇧⌘T
   for now. A swap marks the words stale; a new request replaces them. Tests: `test/transcripts.test.mjs`.

(The `window.magicCut` hooks and ⇧⌘T were removed once the UI landed; see "UI built".)

## Feature phases (to build; owners per the orchestrator)
1. **Spike — lining up by sound:** cross-correlation on real camera + mic pairs, one long file over two parts, mic
   shorter than video, a confidence score that separates "sure", "not sure", "no fit". Drift over 60 min measured
   (fix only if it's real). Findings → `wiki.md`. *Engine sync done on synthetic + retakes.wav pairs; still open:
   real camera/mic pairs, one file over two parts, a "not sure" band, drift.*
2. **Backend:** `replace_audio(path)` → per part `{ fits, offset, confidence, covers: [s, e] }`; playback and the
   waveform use the part's active audio; the transcript records which audio it was made from; nudge per part;
   project saves the swap. **Tests:** offset within one frame on fixtures; no-fit leaves the part untouched.
   *Per-part `swap_audio` and active audio done; still open: the all-parts `replace_audio` shape, confidence band,
   `covers`, transcript's audio record, saving.*
3. **Manual transcription:** no auto-transcribe on add; Generate / Try again / Magic-queues-transcribe; the panel's
   no-transcript and progress states. **Tests:** adding a part starts nothing; Magic with no transcript queues.
   *Engine and tests done; the panel states are open.*
4. **Replace audio UI:** toolbar button and its states, drop anywhere (+ video and audio together, audio with no
   video), status / banners, Audio panel with nudge and Use camera audio, undo steps. **Tests:** each result's
   message; undo restores the previous audio; cuts and notes unchanged after a swap.
5. **Regenerate:** stale detection (transcript audio ≠ active audio), hint row, ↻ icon, regenerate keeping fixed
   words, one undo step. **Tests:** stale on/off through swap, ⌘Z and Use camera audio; fixed words survive.
6. **Look and install:** a WebKit look at every state (panel, button, Audio panel, banners), `npm run install-app`.

## UI built (Jony, item "Build the audio swap and transcript UI") — 2026-11-24
Phases 3, 4 and 5 are built in the UI; ⇧⌘T and `window.magicCut` are gone.
- **Replace audio:** toolbar button (`src/ui/audio-panel.js`, words in `src/ui/audio.js`). Before any swap it opens the
  picker; after, it reads the mic file and opens the Audio panel: a row per part, a one-frame nudge (‹ › / arrow keys,
  remade 300 ms after you stop), Replace…, Use camera audio. Drop audio anywhere (video + audio together: the video
  opens, then the audio lines up). Each file goes to the first part it fits; a file that fits nowhere changes nothing
  and says so once, with Choose another…. Status: "Lining up shure-take.wav…" → "Mic audio lined up · part 2".
- **Undo:** Replaced audio, Nudged audio (one step per panel visit), Back to camera audio. Each is an `audio:
  { before, after }` history step; cuts, notes and words stay. Undoing a part removal remakes its swap at its offset.
- **Transcript panel:** always there. A part without words shows Generate transcript ("From shure-take.wav · on this
  Mac"), its progress in place, or Couldn't transcribe + Try again (no banner). Nothing transcribes by itself.
- **Regenerate:** a transcript remembers the file it heard (`heard`); words are stale while the part plays other audio,
  fresh again when it goes back. One "New audio…" hint row after a swap, the ↻ by search while stale. A regenerate is
  one undo step ("Regenerated transcript") that keeps words you fixed.
- **Tests:** `test/audio.test.mjs` (words, drop kinds, button, panel, Generate, hint, ↻), `test/transcripts.test.mjs`
  (stale through swap and back, regenerate only stale parts, fixed words kept).
- **Engine gaps still open (design asks, the engine doesn't do yet):** no "not sure" band (a weak match either lines
  up or is refused), no "camera fills" where the mic is shorter than the video (Rust pads with silence), one file over
  two parts is first-fit only, the swap isn't saved with the project.

## Status
- [x] Design
- [x] Engine (sync, replace, on-demand transcription) — see above
- [x] Feature phases 3 – 5 in the UI — see "UI built"
- [ ] Phase 1 open bits (real pairs, "not sure", drift), phase 2 open bits (confidence, covers, saving), phase 6 look
