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
Since then a 20 pt transcript strip sits between the ruler and the track (words, selectable pauses): 152 pt.
Spec: `design/timeline-strip.md`.
**Notes lane** (`design/notes.md`): a 20 pt row 4 pt under the track (timeline 176 pt). It's always there once a part
is loaded, and no cut block reaches it.
- **Parts** sit in order, 8 pt apart, each as wide as its source length at the current zoom. Badge "1"/"2" top-left,
  remove ✕ on hover and the add-slot stay as built today (`src/ui/timeline.js`).
- **Waveform** fills the track: mirrored bars, `textSecondary` at 60 %; inside a cut at 25 %. Drawn on one canvas per
  part, only the visible range.
- **Cuts** over the waveform: hatch 45° 6 pt — yours `textSecondary` 35 %, Magic `accent` 45 % (visual system) — with a
  1 pt solid line at each edge in the same colour. **Now**: each cut is a block over strip + track, above words and
  pauses, with a border all round and its length: `design/timeline-words-by-zoom.md`.
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
| ⌘+ / ⌘− / pinch / ⌘-scroll / slider | Zoom, anchored on the playhead (pinch, ⌘-scroll: on the pointer). Fit is the start; ⌘0 back to fit. See "Zoom" |
| Two-finger swipe, ⇧-wheel | Scroll sideways |
| Esc | Clear the selection |

### Zoom
- **Proportional**: a pinch scales the view by the fingers' scale **squared** (a full spread, ×2.5, zooms ×6; pinching
  back returns exactly). The same at any recording length: a pinch is a feel, not a share of the slider.
  WebKit sends `gesturechange` (`scale`); Chromium sends ⌃-wheel (`deltaY` ≈ −100·ln scale); both map to the same
  factor. ⌘-scroll zooms the same way; one mouse-wheel notch is capped at ×1.65.
- **On the pointer**: the moment under it stays under it. Applied once per frame (many events arrive per frame).
- **The same everywhere on the timeline**: a zoom moves and resizes the existing parts, cuts and pauses in place
  (`relayout`); it never replaces them. WebKit sends the rest of a gesture (and of a wheel run) to the element it began
  on, and a removed element passes nothing on: that's why zoom over the tracks used to stall after one step while the
  ruler (whose element never changes) was smooth. Edge handles and pause labels, which depend on width, catch up
  250 ms after the zoom settles.
- Code: `zoomScaled`, `pinchFactor`, `wheelFactor` in `src/ui/timeline-geometry.js`.

### Playback over cuts
- **The preview (first choice)**: a few moments after each edit, Rust renders the kept spans back to back into one
  small video (`src-tauri/src/preview`: one cached clip per kept span, joined without re-encoding, sound cut to the
  same frame-exact lengths). When it matches the cuts you have, Play plays that file in a video laid over the source:
  no cut ever seeks or starts anything, so short kept stretches play as smoothly as long ones. Its time is edit time;
  the edit map (`src/ui/edit-map.js`) turns it back into part and time for the playhead. It shows from its first
  played frame (until then the source's paused frame stays). Pause shows the source at the same spot. An edit while
  it plays hands back to the source at the same spot, which plays on (with the twin) until the next Play.
- **The source with a twin (fallback)**: before the preview is ready, or when you play from inside a cut (you asked
  to hear it).
- **No hitch at a cut** (twin, measured: ≤ 1 frame): seeking a playing `<video>` holds its picture while it decodes, and a
  paused audible one takes ~0.3 s to start. So a hidden twin `<video>` (out of the tab order) **plays along** at an
  inaudible volume, in step on the far side of the next cut (or the next part's first kept moment), from up to 3 s
  ahead. A paused twin is seeked there paused, then started; a playing one gets in step by seeking while it plays.
  Either way it aims ahead by its learned seek lag (~0.47 s). At the cut the two swap volume and visibility: nothing
  seeks, starts or pauses. The old one plays on hidden and seeks on for the cut after. A part's start (nothing before
  it to play along) waits paused, and the cut starts it.
- **Limits**: a seek needs ~0.8 s to settle, so no correcting seek is made under 0.85 s before a cut (`FIX_BEFORE`).
  After a kept stretch shorter than that, the cut seeks as before (~0.4 s hold); around 0.9 s it is a toss-up. So does
  a cut right after you seek. Two twins would cover short stretches, but measured in WebKit three playing videos
  starve the decoders, so it stays one.
- Code: `src/ui/preview.js` (keeps the preview in step), `src/ui/preview-play.js` (plays it),
  `src/ui/player.js` (`play`, `leave`; twin: `prepare`, `jump`, `swap`), `src/ui/jumps.js` (where each jump leaves and
  lands), `src/ui/twin-sync.js` (what to do with the twin each frame). Facts: `updates/2026-11-23 SEAMLESS CUTS - OPEN/wiki.md`.

### Playhead
- **Glides while playing**: moved every display frame (requestAnimationFrame) on a smooth clock (`src/ui/play-clock.js`),
  not on `timeupdate`'s 4×/s steps. Between coarse `currentTime` readings it runs on at the playback rate. While
  playing it **never steps back**: a reading behind the line (a twin that settles, a swap) is held until the video
  catches up; a skipped cut (> 0.25 s ahead) goes straight there; a stall runs on at most 0.15 s. Only a seek you
  make (or a new part) moves it back. Playing the preview, it follows the preview's edit time. Paused: exactly
  the video's time. Drawn with a sub-pixel transform, so nothing re-lays out.

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
