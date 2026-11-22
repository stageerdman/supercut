# Magic Cut — the one screen

App-name rule: user-facing copy doesn't name the app. "Magic Cut" on screen always means the button, so errors about files and parts say what happened without a name.

Author: Jony · 2026-11-20 · Status: **ready for build (Phase 1–2)**, later phases sketched so the layout won't have to move.
Checked against: `design/user-model.md`. Visual tokens: `design/visual-system.md`.

## User goal
"Get my recording in, throw away the obvious junk, and hand it to the AI." — in one window, with no setup and no decisions they don't need.

## What I removed, and why
| Removed | Why |
|---|---|
| Welcome / onboarding screens | The empty screen *is* the onboarding: one drop target. |
| New Project dialog, project naming | The project is named after the first video and autosaved. |
| Media library / bin panel | At most two parts. The timeline is the library. |
| Tool palette (razor, select, hand…) | One mode. Drag edges to trim, drag across to select, `S` to split. |
| Inspector panel, effects, text, music, stickers | Not a goal. CapCut's look, not its toolbox. |
| Separate "add second video" screen | A slot at the end of the timeline, and drop-anywhere. |
| Settings window | Every choice has a default (export, model). The only setting, your rules, is one text box under a gear in the toolbar: `design/rules.md`. |
| Save button | Autosave. |
| Export options dialog | One default (same size, HEVC MP4, next to the original). |
| Magic options before running | Magic works with no setup; rules come later, after the first result. |

## Layout

One window, three zones. Nothing else.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ● ● ●   my-video        Transcribing… 42 % ▬▬▬──  [ Export ]  [ ✦ Magic ] │ ← toolbar (52)
├───────────────────────────────────────────────────┬───────────────────────┤
│                                                   │ Transcript (Phase 3)  │
│                                                   │                       │
│                     PLAYER                        │ So today I want to    │
│                  (video, 16:9 fit)                │ show you ~~um~~ how…  │
│                                                   │                       │
│                                                   │                       │
├───────────────────────────────────────────────────┴───────────────────────┤
│  ▶  01:12 / 24:10                                                    ─◯─  │ ← transport row (40)
│ ┌────────────────────────────┐▒▒▒┌───────────────────────┐ ┌ ─ ─ ─ ─ ┐    │
│ │▌ part 1 thumbnails       ▐│▒▒▒│▌ part 2             ▐│   + Add      │
│ │▌ ∿∿∿∿∿ waveform ∿∿∿∿∿∿∿∿ ▐│▒▒▒│▌ ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿ ▐│ │ second  │    │ ← timeline (~160)
│ └────────────────────────────┘▒▒▒└───────────────────────┘ └ ─ ─ ─ ─ ┘    │
│        ▲ playhead                ▒ removed range (hatched)                │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Toolbar** (unified title bar, 52 pt): project name left (click to rename, optional), actions right. The **primary action sits far right**, where the eye ends.
  The **status line** sits left of the actions: a label ("Transcribing… 42 % · about 3 min") and its own 96 pt bar on a track. It's gone when there's nothing to say.
  (It used to be a bare 2 pt bar on the transport row; the user read it as the video's own progress.)
- **Player:** fills the space, video letterboxed on pure black. No controls on the video itself — the transport row is the only one.
- **Transcript panel** (Phase 3 on): 320 pt by default, right of the player; drag its left edge to resize (remembered; `design/transcript-panel.md`). Before Phase 3, or before a video loads, **it does not exist** — the player takes the full width. No empty panels, ever.
- **Transport row:** play/pause, time (current / edited length), zoom slider (far right). Nothing here that isn't about the video's own time.
- **Timeline:** one video track (thumbnails + waveform in the same clip, like CapCut). Clips sit in order with an 8 pt gap. The add-slot sits after the last clip while there are fewer than two.

Window: min 960 × 600. Below 1100 pt wide the transcript panel becomes a toggle (`⌘T`) overlaying the right of the player.

## The primary action, by state
Exactly one filled button at any time.

| State | Primary (filled) | Secondary (plain) |
|---|---|---|
| Empty | **Choose Video…** (in the drop zone) | — (toolbar empty) |
| Video loaded, transcribing | **✦ Magic** (enabled; pressing it queues — see state 8) | Export |
| Magic queued | **Magic queued ✕** (pill; ✕ cancels) | Export |
| Ready | **✦ Magic** | Export |
| Magic done | **Review cuts** (Phase 6) | Export, ✦ Magic (again) |
| All reviewed | **Export** | ✦ Magic |

Before Phase 6 ships, "Magic done" keeps Magic as primary and Export secondary.

## States

### 1. Empty (first thing anyone sees)
```
┌──────────────────────────────────────────────────────────────┐
│ ● ● ●                                                        │
│                                                              │
│              ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐               │
│                                                              │
│              │        Drop a video here        │             │
│                     [ Choose Video… ]                        │
│              │                                 │             │
│                  MP4 · MOV · M4V — up to 2 parts             │
│              └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘               │
│                                                              │
│              Recent   ▢ my-video · Yesterday                 │ ← Phase 10, only if any
└──────────────────────────────────────────────────────────────┘
```
- Drop zone: 520 × 280, centred, dashed 1.5 pt hairline, radius 16.
- Headline (20 pt semibold): "Drop a video here". One button. One quiet hint line (13 pt secondary).
- The **whole window** accepts drops, not only the zone. Also ⌘O and dropping on the Dock icon.
- No logo, no tagline, no feature list.

### 2. Drag over
- Any valid file over the window: the zone border turns solid accent, fill accent at 8 %, headline "Drop to open". 120 ms ease.
- Invalid file over the window: border secondary, headline "Only video files open here". Drop does nothing harmful.
- Over a loaded project: the add-slot (or, with two parts, the whole timeline) highlights; headline in the slot "Add as part 2".

### 3. Opening
- The editor layout appears **at once** (no spinner screen). The player shows the first frame as soon as the video element has it; the clip on the timeline fills in thumbnails left to right as they render (skeleton tiles at surface-raised until then).
- If opening takes > 1 s: status line "Opening my-video.mov…".

### 4. One video loaded
- Player shows frame 0, paused. Focus on the player so **Space plays** immediately.
- Timeline zoomed to fit. Add-slot after the clip: dashed tile 120 pt wide, "+ Add part 2", secondary text. Clicking it opens the file picker; dropping on it adds.
- Status line: "Transcribing…" (Phase 3) — until then empty.

### 5. Two videos loaded
- Clips in order, labelled "1" and "2" in a small badge (11 pt) top-left of each clip; the file name appears on hover.
- Drag a clip left/right to swap order (the other clip slides aside, 180 ms).
- Clip context menu (right-click): "Swap order", "Remove from project", "Show in Finder". Nothing else.
- Add-slot disappears. Dropping a third file: banner "Two parts at most. Remove one to add another."

### 6. Editing by hand
**Replaced (2026-11-22)** by `design/timeline.md` (timeline, cut edges) and `design/transcript-editing.md` (cut and
fix words), on the model in `design/edit-model.md`. In short: the timeline shows the whole recording with cuts
hatched in place (no collapsed slivers, no `S` split); select words or a time range + ⌫ cuts it, ⌫ again brings it
back; drag a cut's edges either way to change how much it removes; playback skips cuts; the readout shows the
edited length. Your cuts are grey, Magic's coral, in both views.

### 7. Transcribing (Phase 3)
- Progress lives **only in the status line** (toolbar): "Transcribing… 12 % · about 3 min" with its own small bar. The transcript panel never shows progress. You can play and cut meanwhile.
- First run: "Downloading speech model · 465 MB · about 2 min" first, same place.
- The transcript panel slides in (200 ms) when the first words arrive and fills as they come.
- Claude self-test runs in parallel when the video loads (Phase 4). If Claude is missing or signed out, the sign-in banner (state 9) appears **now**, while there's time to fix it.
- Done: status line "Transcript ready" for 3 s, then clears. If the app is in the background and Magic is **not** queued: a Mac notification "Transcript ready".

### 8. Magic queued / running / done (Phase 5, sketched)
- **Queued:** pressing Magic during transcription turns the button into a pill "Magic queued ✕"; the status line reads "Transcribing… 12 % · Magic starts when the transcript is ready". ✕ (or ⌘↩ again) cancels the queue. When the transcript is done, Magic starts by itself — no second press, and only **one** notification at the very end ("38 cuts ready").
- **First run ever:** a one-time inline notice in the status line for 8 s — "Only the text of your transcript is sent to Claude. Your video stays here." No dialog, no confirmation, it doesn't delay the run, and it never shows again.
- **Running:** the status line (left of the button) says the stage: "Choosing the best takes…". The button becomes a quiet pill "Magic ✕" that only cancels. The stage is said once, in the one place that says what the app is doing. Everything else stays usable (play, arrows, manual cuts).
- Done: status line "38 cuts · 24:10 → 14:52 · ⌘Z to undo" for 6 s. Magic's cuts are ordinary cuts (struck through, in coral where yours are grey; drag or restore them like yours); hovering one says why ("Magic: earlier take · Backspace brings it back"). Your own cuts stay; running Magic again replaces only its previous cuts. One ⌘Z undoes the whole run.

### 9. Errors (one pattern for all)
A **banner** slides down under the toolbar, full width, 44 pt, surface-raised, one sentence + at most one action + ✕. It never blocks the screen. Examples:
| Situation | Banner | Action |
|---|---|---|
| Unsupported file | ".mkv files don't open yet. Try MP4 or MOV." | — |
| Broken file | "This video can't be read. It may be damaged." | Show in Finder |
| Audio-only file | "That's an audio file. Better audio comes in a later version." (Phase 8 replaces this) | — |
| Third file | "Two parts at most. Remove one to add another." | — |
| Source moved | "Can't find my-video.mov." | Locate… |
| Claude missing or not signed in (checked when a video loads; shown during transcription, shown again if Magic is pressed while still signed out) | "Sign in to Claude to use Magic: open Terminal and run `claude`." | Copy command |

## Keyboard (works from the first second)
| Key | Action |
|---|---|
| Space | Play / pause |
| ← → | One "bit" back / forward: the time under 4 pt at the timeline's zoom, never under a frame (`src/ui/bit.js`). On a focused cut edge: move that edge one bit |
| ⇧← ⇧→ | Grow a time selection from the playhead, one bit at a time |
| ⌫ | The one toggle: cut the selection (words, a time range, a selected cut), or bring it back if it's all cut already |
| Click / ⇧-click / drag a word | Seek there (play/pause unchanged) and select it / extend / select many |
| Type, double-click, Return on words | Fix their text (`design/transcript-editing.md`) |
| ⌥ while dragging an edge | No snapping |
| Esc | Clear the selection (in the fix field: cancel) |
| ⌘Z / ⇧⌘Z | Undo / redo (every edit: cuts, edges, fixes, a Magic run). The status line says what it undid |
| M | Add a note at the playhead or over the selection (`design/notes.md`). Never inside a text field |
| ⌥← ⌥→ | Previous / next open note |
| ⌘O | Choose video |
| ⌘F | Search the transcript (↩ / ⇧↩ step, Esc clears) |
| ⌘ + / ⌘ − / ⌘0 | Zoom timeline / fit |
| ⌘↩ | Magic (⌘M is taken by macOS Minimize) |
| ⌘E | Export |
| ⌘, | Your rules (open / close the panel) |
| ⌘T | Toggle transcript (narrow windows) |

## Accessibility
- Contrast: text primary 15:1, secondary 7:1 on background; accent button uses dark label (see visual system). All ≥ 4.5:1.
- Every control ≥ 28 × 28 pt hit area (macOS standard); toolbar buttons 32 pt tall.
- Full keyboard reach; standard focus rings (accent).
- VoiceOver: player "Video player, 01:12 of 23:40"; each clip "Part 1, my-video.mov, 12 minutes"; cut "Cut, 0:42 to 0:45, 2.4 seconds, by you" (`design/timeline.md`); drop zone "Drop a video, or choose one".
- Respect Reduce Motion (slides become fades) and Increase Contrast (hairlines 2×).

## Components (build once, reuse)
Each in its own file (a small JS module + Tailwind classes from the `@theme` tokens in `src/input.css`), testable in isolation with every state.
- `PrimaryButton`, `SecondaryButton` — toolbar actions.
- `DropZone` — empty, drag-valid, drag-invalid.
- `PlayerView` — `<video>` wrapper.
- `TransportBar` — play, time, `StatusLine`, zoom.
- `StatusLine` — idle, progress (text + %), message (timed).
- `Timeline` → waveform view, cut view (hatch, edges, chip; yours / Magic), `AddSlot`, `Playhead`. Spec: `design/timeline.md`.
- `Banner` — message + optional action.
- `TranscriptPanel` (Phase 3).
- `Magic` — the AI spot: toolbar button + states + results in the transcript. Contract: `design/ai-slot.md`.

Built so far (`src/ui/`): `dropzone.js`, `player.js`, `status.js`, `timeline.js` (tiles + add-slot; thumbnails, waveform and trims later),
`transcript.js` (words seek, current word lit, cut words struck through), `banner.js`, `magic.js` + `magic-button.js`.
`src/main.js` only holds state and the Tauri wiring. Logic is tested without a window: `npm run test:ui`.

## Open questions (none block Phase 1)
- ~~Removed ranges collapsed vs full width hatched?~~ Decided 2026-11-22: **full width, in place**, so edges can be dragged and the timeline matches the transcript (`design/timeline.md`).
- Light mode? Not in v1 — editors are dark; revisit with A5.
