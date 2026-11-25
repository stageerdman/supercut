# Export: the button and its popover

Author: Jony · 2026-11-25 · Status: **ready for build**
Checked against: `design/user-model.md` (goal 1: "a clean, postable video tonight"; "Ignore: settings, export
options"). Tokens: `design/visual-system.md`. Patterns reused: the Replace audio popup (`design/audio-swap.md`), the
update pill (`design/update-prompt.md`), the banner (`design/main-screen.md` §9).

## The goal
**"Get the finished video into a file I can post, at full quality, and find it."** This is the last step of the
straight line (drop → Magic → export), done once or twice per video, tired, at the end of the evening. The best
export is one they don't have to think about: **⌘E, Return**, and the file appears next to the recording.

## What I removed, and why
| Removed | Why |
|---|---|
| **Format picker** (MOV, GIF, audio-only, ProRes…) | Every place they post takes MP4. One format, so nothing to choose. The brief asked for format; nobody on the straight line needs a second one. Add one back only when a real user asks for it. |
| Resolution, frame rate, bitrate, codec lists | Two plain choices cover it: **Best** (the default) and **Smaller**. The facts (size, fps, file size) are shown, not asked. |
| A file name field | The name is made for them (`my-video – cut.mp4`). Renaming is one Return away in Finder, which the done state opens. |
| The full macOS save sheet every time | Two extra steps per export. A "Save to" row shows where it goes, and **Change…** opens the folder picker only when wanted. |
| A "you haven't reviewed all cuts" warning | People in a hurry skip review on purpose (user model). No nagging; exporting is never blocked by review or notes. |
| A confirm on Cancel | Cancel is an explicit button and the export can simply be started again. |
| Progress in the status line too | Progress lives on the Export button itself (like the update pill), so it's in one place: where they clicked. |
| "Open in QuickTime", "Share…", upload targets | Not a goal. Show in Finder hands them the file; the Mac does the rest. |

## Flow
```
⌘E or click Export ─▶ popover (Best · Save to: next to the recording) ─▶ Return / Export
   ─▶ exporting: the button shows "Exporting 42 %"   (popover may stay open or be closed; editing goes on)
   ─▶ done: "✓ Exported" ─▶ Show in Finder (the file selected)
                  └─▶ Cancel at any time: back to the start, the half-made file is removed
```
Fastest path: **⌘E, Return**. Two keys, no decisions.

## The button
In the toolbar's right group, **left of ✦ Magic Cut** (Magic, then Review, stay far right where they are):
```
│ ‹  my-video       Status…     [∿ Replace audio]  ⚙  [↑ Export]  [✦ Magic Cut]  Review cuts │
```
- Glyph `square.and.arrow.up` 15 pt + "Export", 32 tall, radius 10, `body`. Shown once a video is loaded (Home and the
  empty editor have no Export). Shortcut **⌘E**. It stays while reviewing: exporting mid-review is fine.
- Plain (no fill) in every state except **All reviewed**, where it is the one filled primary (`main-screen.md`, "The
  primary action, by state"). The fill never changes because of export itself.

| State | Button shows | Click |
|---|---|---|
| idle | **↑ Export** | opens the popover |
| nothing to export (every second is cut) | **↑ Export**, disabled. Tooltip: "Everything is cut. Bring something back to export." | — |
| popover open | **↑ Export**, pressed look (`raised` fill) | closes the popover |
| exporting | **Exporting 42 %** + a 48 pt bar (the update pill's bar: `raised` track, `accent` fill) | opens the popover (progress + Cancel) |
| done | **✓ Exported** (✓ in `ok`) for 6 s, then back to idle | opens the popover in its done state |

The pill keeps a fixed minimum width (the width of "Exporting 100 %") so the toolbar doesn't shift as the number
changes. Digits are monospaced.

## The popover
Floats under the button like the Replace audio popup: 320 wide, `surface`, 1 pt hairline, radius 10, padding 16,
right edge aligned to the button's right edge. Click away or Esc closes it (focus back to the button). Closing it never
stops an export.

### 1. Ready (what ⌘E opens)
```
┌──────────────────────────────────────────┐
│ Quality       [  Best  │ Smaller ]       │
│               3840 × 2160 · 30 fps · 14:52 │
│               about 2.1 GB               │
│                                          │
│ Save to       ▭ Videos          Change…  │
│ ──────────────────────────────────────── │
│                           [  Export  ]   │
└──────────────────────────────────────────┘
```
- Two rows, labels left in `textSecondary` (`body`, 72 pt column), values right. Row gap 16. A hairline, then the
  button row (12 above).
- **Quality**: a two-segment control, **Best** selected by default. Under it one quiet line (`caption`,
  `textSecondary`, monospaced digits): output size · fps · edited length, and on the next line the estimated file
  size. The line updates when the choice changes (no motion). The last choice is remembered for the next export.
  - **Best**: the recording's own size and frame rate, visually lossless. The default, because the goal is "full
    quality" and they're posting it once.
  - **Smaller**: at most 1080p, same frame rate, about a quarter of the size. For a quick send or a slow upload. If the
    recording is already ≤ 1080p, Smaller keeps the size and only lowers the bitrate.
- **Save to**: a folder glyph 13 pt + the folder's name (`text`; full path in the tooltip), and a plain text button
  **Change…** that opens the macOS folder picker (sheet on the window). The default is **the folder the recording is in**
  (that's where they'll look); once they Change it, the new folder is remembered for every project. If the default isn't
  writable or is gone: `~/Movies`.
- The file name is made, never asked: `<first part's name> – cut.mp4`; if that exists, `… – cut 2.mp4`, `3`… The
  original is **never** overwritten, and neither is an earlier export.
- **Export** is the popover's one filled button (accent, `onAccent` label, `bodyStrong`, 32 tall, radius 10) and has
  focus when the popover opens, so **Return exports**. Tab order: Best/Smaller (one stop, ← → switch), Change…, Export.
- **Not enough space**: if the estimate is larger than the folder's free space, the estimate line turns into "Not
  enough space in Videos: needs about 2.1 GB, 800 MB free" (`text`, not red: it's information, not an error) and
  Export is disabled. Changing the quality or the folder re-checks.

### 2. Exporting
```
┌──────────────────────────────────────────┐
│ Exporting my-video – cut.mp4             │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬──────────────────────── │
│ 42 % · about 1 min left                  │
│ ──────────────────────────────────────── │
│                            [  Cancel  ]  │
└──────────────────────────────────────────┘
```
- The same box, contents cross-faded (120 ms). The popover stays open after Export is pressed: they just asked for it
  and want to see it start. Click away to get back to the video; the button carries the progress.
- Title in `bodyStrong` (name cut off in the middle with … if long). The bar is full width, 4 tall, radius full,
  `raised` track, `accent` fill. Under it, `caption` `textSecondary`: "42 % · about 1 min left" (the time appears once
  it's known, after a few seconds; until then "Starting…").
- **Cancel** is plain (no fill) and **not** focused when this view appears, so a second Return right after Export
  never cancels it. It takes a click, or Tab then Return/Space. **Esc only closes** the popover.
- Cancel stops at once, deletes the half-made file, and returns the popover to *Ready*. No confirm.
- **Everything else keeps working**: play, cut, Magic, review. The export is a snapshot of the edit at the moment
  Export was pressed; later edits are kept in the project and go into the next export. (No message about this: it's
  what any editor does.)
- The Mac is kept awake while exporting (as for transcription).
- ⌘E while exporting opens this view.

### 3. Done
```
┌──────────────────────────────────────────┐
│ ✓ Exported                               │
│ my-video – cut.mp4 · 14:52 · 2.0 GB      │
│ ──────────────────────────────────────── │
│                      [ Show in Finder ]  │
└──────────────────────────────────────────┘
```
- ✓ in `ok` + "Exported" (`bodyStrong`). The file line in `caption` `textSecondary`.
- **Show in Finder** is filled and focused (Return): opens Finder with the file selected, then closes the popover.
- If the popover was closed when it finished, the button shows **✓ Exported** for 6 s; clicking it opens this view.
  After that the button is idle again and the popover opens on *Ready* (the done result has been seen or doesn't
  matter any more).
- App in the background: a Mac notification "Exported · my-video – cut.mp4". Clicking it shows the file in Finder.
- The next ⌘E after done opens *Ready*, so a second export is ⌘E, Return again (it gets `… – cut 2.mp4`).

### 4. Failed
One pattern for errors (`main-screen.md` §9): the **banner**, with the plain reason and **Try again** (same quality,
same folder). The half-made file is removed. The button goes back to idle; if the popover was open it returns to
*Ready*.
| Situation | Banner |
|---|---|
| Disk filled up mid-way | "Export stopped: Videos is full. Free some space or choose another folder." · **Try again** |
| Folder gone or not writable | "Can't save to Videos." · **Choose folder…** (opens the picker, then exports) |
| Source moved | "Can't find my-video.mov." · **Locate…** (as today) |
| Anything else | "Export stopped: ‹Rust's plain message›." · **Try again** |

## What the file is
What they heard in the player is what they get: the kept parts in order, the same joins as playback, with the mic audio
if it was replaced.
- **Container** MP4, `faststart` (web-ready). Picture: H.264 High for Best (plays and uploads everywhere, no surprises),
  hardware encoder, quality high enough that it is visually the same as the recording; HEVC (`hvc1`) for Smaller.
  Uncle Bob picks exact rates, with this rule: Best must look identical to the source at 100 % on a Retina screen.
- **Size / frame rate**: part 1's. A part 2 with a different size is fitted inside, letterboxed in black.
- **Audio**: AAC 48 kHz stereo, 256 kb/s (Best) / 160 kb/s (Smaller).
- Notes, cut colours and review marks never go into the file.

## Leaving while exporting
- **‹ All projects**: allowed. The export keeps running in Rust; coming back to the editor rejoins it (the update
  pill's pattern: a second listener joins the running job), so the button shows progress again. Done → the Mac
  notification.
- **Quit (⌘Q)**: the standard Mac alert, the one dialog here because quitting would throw the work away:
  "An export is still running." · **Keep Exporting** (default) · **Quit**. Quit cancels and removes the half-made file.

## Accessibility
- Button: accessible name is its text ("Export", "Exporting 42 %", "Exported"); state changes announced via
  `aria-live="polite"` on the label, at most every 10 %.
- Popover: `role="dialog"`, `aria-label="Export"`, focus trapped while open, back to the button on close.
- Quality: `role="radiogroup"` with two radios, ← → to switch. The estimate line is linked as its description.
- Bar: `role="progressbar"` with `aria-valuenow`.
- Hit areas ≥ 28 × 28; segment height 28. Contrast as the visual system (all ≥ 4.5 : 1; ✓ is never colour alone).
- Reduce Motion: cross-fades are already fades; unchanged.

## Build notes
- Component: `src/ui/export.js` (button + popover + its four views, logic testable without a window in
  `npm run test:ui`: name making, view per state, estimate line text, the space check).
- Contract for Rust (Uncle Bob):
  - `export_plan({ quality, folder? })` → `{ width, height, fps, seconds, bytes, folder, folderName, free, name }`
    (`folder` defaults to the remembered one, else the recording's, else `~/Movies`; `name` is already made unique).
  - `export_start({ quality, folder, name })` → resolves `{ path, bytes, seconds }` when done, rejects with a plain
    message; joins a running export if one is going. Event `export://progress` `{ done, total }` in seconds of output.
  - `export_cancel()` → stops, removes the partial file.
  - `export_reveal(path)` → Finder with the file selected.
  - Choose folder: the dialog plugin's folder picker; the choice is stored app-wide.

## As built (2026-11-25)
Built in `src/ui/export.js`, wired in `src/main.js` and `src/index.html`; tests in `test/export.test.mjs`. Where it
differs from the spec above, and why:
- **Format, not quality**: the segment control is **MP4 | ProRes** (the engine's two formats: H.264 CRF 14 + AAC 320
  kb/s, or ProRes 422 HQ in a .mov). There is no "Smaller": MP4 already is the small, everywhere-playable file, and
  ProRes covers "hand it to an editor". MP4 is the default; the last choice is remembered. (A41 now reads: nobody
  misses a third format.)
- **Rust contract** is Uncle Bob's: `export_target({ folder, format })` → folder, folder name, unique name, free space,
  picture size/fps; `export_video({ spans, out, format })`; `export_cancel`; `export_reveal(path)`; events
  `export://progress` `{ done, total }` (frames) and `export://done` (rejoin after leaving the editor). The Mac is kept
  awake while `export_video` runs.
- **Done line** is `name · length` (no file size: the engine doesn't report it, and Finder is one click away).
- **Not built yet**: the Mac notification when the app is in the background, and the Quit alert while exporting.
  Leaving to ‹ All projects is fine (the export runs on and the button rejoins it).
- **Magic goes plain** once every cut is reviewed and Export becomes the filled button, so the toolbar keeps one
  primary action.

## Assumptions
| # | Assumption | Quick check |
|---|---|---|
| A41 | Nobody misses a format choice: MP4 is enough | Count requests for another format after 20 exports |
| A42 | Most exports are ⌘E/Export + Return with Best and the default folder | Log quality and folder changes per export |
| A43 | The recording's folder is where they look for the result | Count Change… on first export, and Show in Finder use |
| A44 | People keep editing (or walk away) while it exports, rather than watching the bar | Log popover closes during export and edits made meanwhile |
