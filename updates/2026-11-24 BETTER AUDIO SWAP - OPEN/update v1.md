# Better audio swap — update v1

Feature: f-better-audio-swap. Replaces INIT Phase 8 ("Better audio").

## Goal
Drop in a better-mic recording: it lines up with the video by sound and replaces the camera audio. Transcription
starts only when the user asks (Generate), and after a swap the app offers Regenerate.

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

## Phases (to build; owners per the orchestrator)
1. **Spike — lining up by sound** (outside main code, in this folder): cross-correlation on real camera + mic pairs,
   one long file over two parts, mic shorter than video, a confidence score that separates "sure", "not sure", "no
   fit". Drift over 60 min measured (fix only if it's real). Findings → `wiki.md`.
2. **Backend:** `replace_audio(path)` → per part `{ fits, offset, confidence, covers: [s, e] }`; playback and the
   waveform use the part's active audio; the transcript records which audio it was made from; nudge per part;
   project saves the swap. **Tests:** offset within one frame on fixtures; no-fit leaves the part untouched.
3. **Manual transcription:** no auto-transcribe on add; Generate / Try again / Magic-queues-transcribe; the panel's
   no-transcript and progress states. **Tests:** adding a part starts nothing; Magic with no transcript queues.
4. **Replace audio UI:** toolbar button and its states, drop anywhere (+ video and audio together, audio with no
   video), status / banners, Audio panel with nudge and Use camera audio, undo steps. **Tests:** each result's
   message; undo restores the previous audio; cuts and notes unchanged after a swap.
5. **Regenerate:** stale detection (transcript audio ≠ active audio), hint row, ↻ icon, regenerate keeping fixed
   words, one undo step. **Tests:** stale on/off through swap, ⌘Z and Use camera audio; fixed words survive.
6. **Look and install:** a WebKit look at every state (panel, button, Audio panel, banners), `npm run install-app`.

## Status
- [x] Design
- [ ] Phase 1 – 6
