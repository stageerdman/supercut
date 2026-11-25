# Export — update v1

Goal (Pixel): an Export button. This update's Rust part (Uncle Bob): the **export engine** — the edit's kept spans
(all cuts applied, swapped-in mic audio where a part has it) rendered into one clean video at source quality, with
frame-accurate cuts, no pops at the joins, progress and cancel, behind a small command contract for the UI.

## Design in one paragraph
Same shape as the preview (`src-tauri/src/preview/`), at full quality: every kept span becomes its own segment,
rendered in parallel, picture only, **exactly N source frames** starting on the span's first frame; then one join
copies the segments' picture (no second encode) and cuts the sound fresh from each part's media, sample-exact to the
segment length, with a few-ms fade at each side of every join. A part with swapped audio plays `Part::media()` (the
remux with the mic sound), so the swap needs nothing extra. Pure planning lives in `export/plan.rs`; running ffmpeg,
progress and cancel in `export/mod.rs`.

## Quality
| Format | Picture | Sound | File |
|---|---|---|---|
| `mp4` (default) | H.264 High, x264 `-preset slow -crf 14`, source size and frame rate | AAC 320 kb/s, 48 kHz | .mp4 |
| `prores` | ProRes 422 HQ (`prores_ks -profile:v 3`), 10-bit 4:2:2 | PCM 24-bit, 48 kHz | .mov |

CRF 14 is visually lossless for camera footage; ProRes is the "hand it to an editor" option.

## Frames
- The export runs at the **first part's frame rate and size**; another part of a different size is fitted in
  (scaled, padded), the same rule the preview uses.
- A span's edges snap to that frame grid: first frame `k = round(s·fps)`, length `n = max(1, round((e−s)·fps))`.
- Each segment seeks to a quarter frame before frame `k` (accurate seek keeps frames from there on, so frame `k` is
  the first and `k−1` is not, whatever the float rounding) and stops after `n` frames.
- The sound of each span is cut to exactly `n/fps` s from the same start, so picture and sound never drift.

## Contract for the UI
- `export_video({ spans: [{part, s, e}], out: "/path/file.mp4", format: "mp4" | "prores" })` →
  `{ file, seconds, frames }`. `spans` is `keptSpans()` from `src/ui/playback.js` (the list the preview already
  sends). The UI picks `out` (save dialog; the extension must fit the format). Paths of the parts come from the open
  project, never from the web side.
- Event `export://progress` `{ done, total }` in frames (the join is the last few percent: `done == total` while it
  runs).
- `export_cancel()` stops it: the running ffmpegs are killed, nothing is left at `out`, and `export_video` rejects
  with the cancelled message (the UI shows nothing for it).
- One export at a time: a second `export_video` while one runs is refused.
- The file appears at `out` only when complete (written beside it as a temp, then renamed).

## Phases
1. **Roadmap** (this file). ✅
2. **Plan, pure** — `export/plan.rs`: frame grid snapping, segment args per format, join args, sound graph with
   fades (generalised from the preview's), reading fps/size from ffmpeg's report, progress line parsing.
   *Tests:* snapping, args per format, fade graph, report parsing.
3. **Engine** — `export/mod.rs`: parallel segments with progress, join, temp-then-rename, cancel kills ffmpeg.
   *Tests (real ffmpeg):* output length = kept duration (picture and sound); every frame is the right source frame
   (a source whose frame *i* has brightness *2i*); no pop at a join (sound near each join is faded); cancel leaves
   nothing behind; ProRes renders a .mov.
4. **Commands** — `export_video`, `export_cancel`, `export://progress` in `main.rs`; errors in `error.rs`.
   *Test:* build passes; the contract above is the doc.
5. **UI** (Export button, save dialog, progress, cancel) — owned by the UI item of this goal, on this contract.

## Status
- Phase 1 done 2026-11-25.
