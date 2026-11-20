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

## Decisions
- No Export button yet: it would do nothing. It arrives with export.
- The Claude sign-in banner only shows once Magic is connected. Before that it would point at a button that isn't there.
- The summary doesn't say "⌘Z to undo" until undo exists.

## Next
- Uncle Bob: wire the Claude bridge (`620839c`) into `src/ai.js` → Magic appears.
- Someone opens the window and drops a real recording (agents can't see the screen).
