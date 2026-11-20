# First screen UI — v1

Goal: the one screen from `design/main-screen.md` on the Tauri + Tailwind app shell, with a clear spot for the AI.

## Phases
1. **Components** — done. `src/main.js` was one 300-line file. It is now state + Tauri wiring only, and each region has its own module in `src/ui/`
   (dropzone, player, status, timeline, transcript, banner, magic, magic-button).
2. **Spec gaps closed** — done. Status line gives time left ("about 3 min") once the speed is known. ← → step one frame (⇧ = 1 s), J K L work.
   Focus goes to the player on load so Space plays at once. Drag over the add-slot says "Add as part 2". The file picker refuses a third part with the banner.
   Remove buttons are 28 pt and keyboard-reachable.
3. **AI spot** — done. ✦ Magic is the one primary button, far right of the toolbar, with queued/running pills, ⌘↩, the one-time privacy note, sign-in banner + Copy command,
   and results drawn in the transcript (cut words struck through). It's hidden until `src/ai.js` exports a runner. Contract: `design/ai-slot.md`.
4. **Tests** — done. `npm run test:ui`: 13/13 (status text, time left, cut words, drop check, every Magic state incl. queue, cancel, failure, signed out).
   `npm run dev` builds and opens the window.
5. **Fixes from the user's first real test** — done (2026-11-20). The user loaded a real recording in SuperCut.app: it played and the transcript showed. Four problems:
   1. *The transcription bar looked like the video's progress.* → It's gone from the transport row. The status now sits in the **toolbar**, left of Magic:
      a label ("Transcribing… 42 % · about 3 min") with its own small bar on a track. It disappears when done ("Transcript ready" for 3 s, then nothing). `src/ui/status.js`.
   2. *J/K/L felt random.* → Deleted, and ⇧-arrows too. **Space** plays/pauses, **← →** step one "bit". A bit = the smallest step at the cutting timeline's zoom;
      until that timeline exists it's one frame (1/30 s). It lives in one place, `src/ui/bit.js` (`bit()` / `setBit(s)`), for the timeline zoom to drive.
   3. *Magic was invisible.* → Cause: `src/ai.js` exports no runner yet, and Magic was hidden until it did. Now Magic shows as soon as a video is loaded;
      pressing it opens a one-line banner: "Magic isn't connected yet. Soon it will pick your best takes; for now, cut words in the transcript."
   4. *Couldn't cut words.* → Click a word (seeks there and selects it), ⇧-click or drag for more, **Backspace/Delete** cuts them: struck through in accent.
      Select cut words + Backspace again brings them back (a word inside a longer cut splits it). **⌘Z / ⇧⌘Z** undo / redo every cut, Magic's too.
      Pure logic in `src/ui/cuts.js` (`isCut`, `toggleCut`, `createHistory`); the panel repaints cuts in place so the selection stays.
6. **Tests, all three suites** — done, all green on this Mac (2026-11-20):
   - `npm run test:ui` — **19/19** (new: toolbar status shows then goes away, cut / restore / split, undo / redo, the bit step, Magic placeholder).
   - Rust, via `npm test` — **45/45**, including the live ones (real Parakeet transcription of a short clip and a 230 s stitched recording, real Claude round trip).
     The first run skipped 2 live tests because `models/en.wav` was missing in this checkout; `npm run fetch-model` fetched it and the rerun ran them.
   - `npm run smoke` on the built SuperCut.app — **ok** (codesign verified, Claude answered in 5.7 s, 153.8 s .mov transcribed in 9.6 s, 680 words, seam clean).
   - `npm run app` rebuilt SuperCut.app and opened it.

## Decisions
- No Export button yet: it would do nothing. It arrives with export.
- The Claude sign-in banner only shows once Magic is connected. Before that it would point at a button that does nothing.
- Magic shows even before it works: a missing primary button reads as "the app can't do this". The placeholder press says so honestly, in one line.
- Status went to the toolbar, not a new strip under it: no layout jump when it comes and goes, and it sits next to Magic, which waits on it.
- Backspace toggles (cut ↔ restore) instead of a second "restore" gesture: one key, one rule. ⌘Z is the safety net.
- Click on a word both seeks and selects: the two things you want when you point at a word.
- Magic's result still replaces the cut list (as one undo step), as before.
- Cut words still play. Skipping them in playback comes with the timeline / preview work.
- The two fixed video slots stay as they are until the "Two videos" / timeline update (agreed with the user).

## Next
- Uncle Bob: wire the Claude bridge (`620839c`) into `src/ai.js` → Magic runs for real.
- Timeline update: real zoom → call `setBit()`; playback skips cut ranges; CapCut-like clips replace the two slots.
- The user tries cutting words in the rebuilt app (agents can't see the screen).
