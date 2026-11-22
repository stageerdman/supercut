# The timeline

Author: Jony · 2026-11-22 · Status: ready to build (Phases 4–5). Model: `design/edit-model.md`. Tokens: `design/visual-system.md`.
Checked against `design/user-model.md`: goals 2 (trust every cut) and 3 (throw away junk myself); habits from CapCut / Final Cut.

## User goal
"See what's kept and what's cut, and fix a cut that's a little too long or too short." Most visits: look, drag one
edge, listen to the join. Rarely: cut a range by hand (a phone call, the start and end).

## What I removed, and why
| Removed | Why |
|---|---|
| Collapsed cut slivers (first spec) | You can't drag an edge you can't see. Cuts stay in place, full width, like the transcript shows them. The readout gives the edited length. |
| Clips, razor tool, `S` split | A cut is a range: select + ⌫. Nothing to split. |
| Thumbnails | A talking head looks the same in every frame. The waveform is what you cut by (pauses, ums). |
| Moving / reordering pieces, extra tracks | Not a goal. Parts keep their order. |
| A Restore button on every cut | Click the cut, ⌫ (the chip says so). Same rule as the transcript. |
| Snapping toggle in the UI | Snapping is on; hold ⌥ while dragging for free movement. |
| Zoom presets / zoom-to-selection | Fit is the default; ⌘+ / ⌘− / pinch / the slider cover the rest. |

## Layout
```
│  ▶  01:12 / 23:40                                              − ───◯─── +  │ transport row 40
├──────────────────────────────────────────────────────────────────────────────┤
│ 0:00        0:30        1:00   ▼    1:30        2:00        2:30             │ ruler 20 (caption, textSecondary)
│ ┌──────────────────────────────┼─────────────────────────┐  ┌─────────────┐  │
│ │1 ▁▃▅▃▁▂▆▇▅▂░░░░░░▃▅▆▃▁▁▂▅▇▆▃▁│▁▃▅▆░░░░▃▅▃▁▂▃▅▆▅▃▂▁    │  │2 ▁▃▅▆▅▃▁▂▃ │  │ track 72
│ └──────────────────────────────┼─────────────────────────┘  └─────────────┘  │
│                    ░ cut (grey hatch = yours, coral = Magic)   │ playhead      │
```
Timeline area: 16 pt padding, ruler 20, 4 gap, track 72 → 128 pt tall (today's box is 120; it grows by 8).
- **Parts** sit in order, 8 pt apart, each as wide as its source length at the current zoom. Badge "1"/"2" top-left,
  remove ✕ on hover and the add-slot stay as built today (`src/ui/timeline.js`).
- **Waveform** fills the track: mirrored bars, `textSecondary` at 60 %; inside a cut at 25 %. Drawn on one canvas per
  part, only the visible range.
- **Cuts** over the waveform: hatch 45° 6 pt — yours `textSecondary` 35 %, Magic `accent` 45 % (visual system) — with a
  1 pt solid line at each edge in the same colour.
- **Playhead**: 1 pt `accent` line through ruler and track, 9 pt triangle head on the ruler. Drag the head (or the
  ruler) to scrub.
- **Zoom slider**: far right of the transport row, 96 pt, with − / + (28 pt targets). Its only job is zoom.
- The readout: edited time "01:12 / 23:40"; hover shows "Original 24:10".

## Interactions
| Do | Result |
|---|---|
| Click the ruler or a kept part of the track | Playhead goes there (keeps play/pause) |
| Click a cut | Playhead goes there **and** the cut is selected: 1.5 pt accent outline, chip **Restore ⌫** above it |
| Drag across the track (≥ 4 pt) | Time selection: `accent` 20 % fill, 1 pt accent border, chip **Cut ⌫** (or **Restore ⌫** when it's all cut). Ends snap like edges. Clamped to the part it started in |
| ⌫ / Delete | The one toggle rule on the selection (`design/edit-model.md`) |
| Hover a cut edge, or a part's outer start/end | 4 × 40 pt handle in the cut's colour (accent for a bare part edge), cursor ↔. Hit area 12 pt wide, full track height |
| Drag an edge | See "Dragging an edge" |
| ⇧← / ⇧→ | Grow a time selection from the playhead by one bit (keyboard cutting) |
| ⌘+ / ⌘− / pinch / slider | Zoom, anchored on the playhead (pinch: on the pointer). Fit is the start; ⌘0 back to fit |
| Two-finger swipe, ⇧-wheel | Scroll sideways |
| Esc | Clear the selection |

### Dragging an edge
- **Live**: the cut grows or shrinks as you move; the transcript strikes/unstrikes words as you go; the player shows the
  frame at the edge; a chip above the edge says the cut's length, "2.4 s" (tabular digits).
- **Snaps** within 8 pt to: word starts and ends, the playhead, the part's start and end. Hold ⌥ to move freely
  (snapping comes back when ⌥ is released). No transcript yet → only playhead and ends.
- **Through the other edge**: the cut gets shorter; under a frame it's gone, the hatch fades out (120 ms).
- **Into the next cut**: they join into one.
- **A part's outer edge** with no cut there: dragging inward makes a cut from the start (or to the end). That's a trim.
  Same object, same handles afterwards.
- **A Magic cut** turns grey the moment you move it: it's yours now, the next Magic run keeps it. Hover still says
  Magic's reason.
- Dragging pauses playback. **Release**: one undo step; the playhead waits 1 s before the join, so Space plays it.

### Following the playhead
While playing, when the playhead passes 90 % of the visible width the view pages so it sits at 10 % (no constant
scrolling, which is hard to look at). Paused: the view only moves when you seek from the transcript to something off
screen (it centres it), or on undo/redo (brings the change into view).

### What `bit` is
← → move one bit: the time under 4 pt at the current zoom, never under one frame (`setBit` from the zoom, as `bit.js`
already expects).

## States
| State | Track |
|---|---|
| Part just added | Flat 1 pt line mid-track on `raised`; the waveform draws in when it arrives (fade 120 ms). Everything else works |
| Waveform failed | Flat line stays. No banner (if audio can't be read, transcription says so already) |
| Transcribing | Fully editable; edges snap to playhead and ends only |
| No cuts | Waveform only |
| Magic running | Fully editable. Results fade in (200 ms) as coral hatch |
| A cut under ~6 pt at this zoom | Drawn at least 2 pt wide so it's never invisible; handles appear only when zoomed in enough for both (≥ 24 pt), the hint chip says "Zoom in to drag" on hover |
| The part can't play | Still editable; the player banner says why (today's) |

## Accessibility
- Each cut is a focusable element (Tab, in time order): "Cut, 0:42 to 0:45, 2.4 seconds, by Magic: earlier take.
  Backspace restores."
- Each edge is `role="slider"`, `aria-valuetext` "Start of cut, 0:42.3". ← → move it one bit; nudges in a row are one
  undo step. A focused edge shows its handle.
- Track: group "Part 1, my-video.mov, 12:00, 14 cuts". Playhead: the player's label already reads the time.
- Colour isn't the only signal: yours vs Magic also differ in the label and hover text. Increase Contrast: edge
  lines 2 pt, hatch +20 %.
- Reduce Motion: fades only (none of this slides).

## Components (each its own file, fake-DOM testable)
- `timeline-geometry.js` (pure): time ↔ x, fit, zoom anchor, `snap(t, targets, zoom, free)`, bit.
- `timeline.js`: lays out ruler, parts, playhead; owns pointer/keys; calls the model.
- `waveform-view.js`: one canvas per part, visible range only.
- `cut-view.js`: one cut (hatch, edges, outline when selected, chip, labels).
