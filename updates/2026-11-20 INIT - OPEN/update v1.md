# INIT — v1

Status: **OPEN** · Opened 2026-11-20

## Goal

A Mac app that turns a raw recording into a clean, cut video. It transcribes locally, uses AI to pick the best takes, swaps in better audio, and lets you review every cut before exporting. It looks like CapCut or OpenCut.

## Roadmap

Author: Jony · 2026-11-20 · Built on: stack research (`updates/2026-11-20 TECH STACK RESEARCH - CLOSED/wiki.md`) and interaction research (`user-interactions.md`).

The whole of SuperCut, in phases. Each phase ships something you can use and
ends with tests that lock it in, so later phases can't quietly break it.
Phases marked **(spike)** start with a throwaway test in this update folder
before anything goes into the main code (WORKFLOW.md).

**The one journey every phase serves:** drop a recording → trim the junk →
press Magic → review the cuts → export. One window, one screen that changes
state: `design/main-screen.md`.

**Stack (decided by research):** SwiftUI app, macOS 14+, Apple Silicon only ·
AVFoundation for playback, cutting and export · FluidAudio + Parakeet TDT v3
(CoreML) in-process · the user's own `claude` CLI in print mode via `Process`.
Distribution: **unsigned** `.app` in a DMG (no Apple Developer account, so no
signing or notarization).

**The one model:** a `Project` (JSON) with `sources[]`, `transcript`,
`segments[]` and the **EDL** (kept ranges). Playback, timeline, transcript,
Magic, review and export all read and write the EDL. Claude never sees times,
only segment IDs.

### Phase 0 — Risk spikes (spike)
Prove the three risky parts before building on them. Code lives in this update
folder; findings go to `wiki.md`.
- **A. Parakeet:** FluidAudio on a 5‑min and a 60‑min video. Word times within
  ±50 ms? Speed, memory, the real Swift field names.
- **B. Claude:** a tiny SwiftUI app runs `claude -p --output-format stream-json
  --json-schema …` with `Process`: finds the binary without shell PATH, checks
  `claude auth status`, strips `ANTHROPIC_API_KEY`, reads `structured_output`,
  cancels with SIGINT.
- **C. Playback:** `AVMutableComposition` rebuilt from a 200‑cut EDL; frame-
  accurate seek; no audio clicks with short fades at cuts.
- **Tests:** each spike has a script that passes or fails on a fixed sample
  clip, results written to `wiki.md`.

### Phase 1 — The app opens and plays a video
The foundation the brief asks for.
- Xcode project, one window, one target. Empty state from the screen design:
  one drop zone, one "Choose Video…" button, ⌘O.
- Drop or choose a video → it plays (Space), scrubs, shows on the timeline with
  thumbnails and a waveform.
- A second video drops in **after** the first (two parts of one recording).
  Swap order by dragging. A third file says "SuperCut works with two clips."
- Unsupported file → one plain sentence. An audio-only file → kept for Phase 7
  (for now: "Better audio is coming soon").
- Project autosaves to Application Support; files stored as bookmarks.
- **Tests:** unit — `Project` encode/decode, source loading (valid, broken,
  audio-only, third file). UI smoke — launch → drop sample → plays. Two-clip
  project reopens identical.

### Phase 2 — Manual pre-cuts
- Drag clip edges to trim start and end. Select a range on the timeline,
  ⌫ removes it. Split at playhead (`S`). Removed parts show as gaps you can
  drag back out; originals are never touched.
- ⌘Z / ⇧⌘Z for every edit. Works while transcription runs.
- Each cut is marked as **yours** (Magic must never undo it).
- **Tests:** EDL logic fully unit-tested (trim, split, delete, restore, undo/
  redo, two sources, snap to frames). Playback skips removed ranges.

### Phase 3 — Local transcription
- Starts by itself on drop. First run downloads the model (~465 MB) with size,
  progress and time shown — the video is already playable meanwhile.
- Progress on the transcript panel: "Transcribing… 12 % · about 3 min left".
- Words with times build the transcript panel: click a word → player jumps
  there; the playhead highlights the current word; pre-cut words show struck.
- Cached in the project, runs once; resumes after quit or sleep.
- "We found almost no speech" when that's the case.
- **Tests:** fixed sample → word count and timings within tolerance; token →
  word merge unit-tested; cache hit on reopen; cancel leaves a clean state.

### Phase 4 — Claude bridge
- One module, `Picker`: segments in, `{keep, drop:[{id, reason}]}` out.
- Local take finder first (pure logic): sentences, pauses, retake groups.
- Failure states mapped to three plain messages: "Sign in to Claude" (with the
  Terminal step), "Claude is busy, retrying…", "Something went wrong".
  Missing Claude never blocks loading, trimming or transcription.
- Startup self-test so a future CLI change shows "Update SuperCut", not chaos.
- **Tests:** take-finder unit tests on fixture transcripts; contract tests on
  recorded CLI output (success, not signed in, rate limit, bad JSON, timeout);
  a live smoke test behind a flag.

### Phase 5 — Magic
- The one primary button on the screen. One press, no setup: removes retakes
  (keeps the last good take), false starts, long pauses, filler.
- Stages while it works: "Reading… Choosing the best takes… Placing cuts".
- Result in two seconds: "38 cuts · 24:10 → 14:52". Cuts show on the timeline
  and struck through in the transcript. One ⌘Z undoes the whole pass.
- All or nothing: a failure leaves the project exactly as before.
- Your cuts always win; pressing Magic again keeps them.
- First press says once what leaves the Mac: "Only the text of your transcript
  is sent to Claude. Your video stays here."
- **Tests:** fixture transcripts with known retakes → expected ranges removed;
  user cuts survive a re-run; bad replies never touch the EDL.

### Phase 6 — Review every cut
- "Review" plays ~3 s before and after each AI cut, then waits: `Y` keep the
  cut, `N` bring it back, `R` replay, `←` back. "7 of 38". Moves on by itself.
- Nudge an almost-right cut a little earlier/later (`[` `]`) without leaving
  review. Cuts within a few seconds of each other are grouped.
- Peek at what was removed (the struck words, and `P` to play them).
- Resumes where you stopped. Ends with "All 38 checked · 4 restored — Export".
- **Tests:** keep/restore/nudge update the EDL; grouping logic; review progress
  survives reopen.

### Phase 7 — Editing rules and transcript editing
- Rules: one plain-text box, remembered across projects, with three example
  rules. Re-run Magic to apply.
- Transcript: select words + ⌫ cuts them; select struck words + ⌫ (or click
  "Restore") brings them back. Selection snaps to whole words.
- **Tests:** rules reach the prompt; text cut/restore and timeline cut give the
  same EDL.

### Phase 8 — Better audio (spike first)
- Spike: cross-correlation sync on a real camera + lav pair, with drift.
- Drop any audio file → auto-synced, camera audio muted, A/B toggle to compare.
  Low confidence → a nudge slider. Mic shorter than video → camera audio fills
  the gaps (said once).
- **Tests:** offset within one frame on fixture pairs; drift corrected over
  60 min; cuts line up after the swap.

### Phase 9 — Export
- One "Export" button: same size and frame rate as the source, HEVC MP4,
  saved next to the original as "name – SuperCut.mp4" (never overwrites).
- Disk space checked before starting. Progress and time left; a Mac
  notification when done; "Show in Finder".
- Gentle note if cuts weren't reviewed: "12 cuts not checked yet" — never a block.
- **Tests:** exported duration = sum of kept ranges; A/V in sync at every cut;
  better audio present; two-clip export.

### Phase 10 — Polish and ship (unsigned)
- Recent projects on the empty screen, missing-file relink, accessibility pass
  (VoiceOver labels, full keyboard use, contrast), keyboard shortcut sheet.
- Build an **unsigned** `.app` packed in a DMG with a short "First launch"
  note inside it and in the README:
  1. Drag SuperCut to Applications.
  2. Right-click SuperCut → **Open** → **Open** (only the first time).
  3. Or: System Settings → Privacy & Security → "SuperCut was blocked" → **Open Anyway**.
- No signing, no notarization, no auto-updates (Sparkle needs signing): new
  versions are a new DMG.
- **Tests:** end-to-end on a sample recording (load → pre-cut → transcribe →
  Magic with recorded Claude reply → review → export); a clean-Mac check that
  the DMG opens with the first-launch steps.

### Later (not planned yet)
Captions, multi-cam angle switching, FCPXML export, vertical exports, a
"tighter / looser" one-off instruction to Magic.

## Decisions
- One window, one screen that changes state; no pages, no settings window in v1. (Jony)
- The EDL is the single edit model for manual cuts, Magic, review, transcript and export. (Elon, Jony)
- Two videos = two parts of one recording, played one after the other. (Pixel)
- Stack: SwiftUI + AVFoundation + FluidAudio Parakeet + `claude -p`. (Elon)
- **Unsigned build only** — no Apple Developer account. DMG + first-launch steps; no notarization, no Sparkle. (User, via Pixel)
- User cuts outrank AI cuts; review covers AI cuts only. (Columbo's assumption, adopted)

## Status
- ✅ Project set up by the Project Setter (AI Studio).
- ✅ User interaction research written: `user-interactions.md` (journey step by step, behavior scores, deep dives, edge cases, open questions). Basis for Jony's design.
- ✅ Roadmap written (Jony).
- ✅ First screen designed: `design/main-screen.md`, user model in `design/user-model.md` (Jony).
- ⏭ Next: Phase 0 spikes, then Phase 1 build from `design/main-screen.md`.
