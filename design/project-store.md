# Project store — the data contract (for the backend)

Author: Jony · 2026-11-24 · For: Uncle Bob (Backend). Serves `design/home-screen.md`.
Names below are a proposal: rename freely to match the code, but keep the shapes and the rules.

## The rules (what must stay true)
1. **Every project saves itself.** No Save, no file the user handles. One folder per project in the app's data folder.
2. **The user's files are never touched.** Deleting a project (by hand or by the 30-day sweep) removes its folder
   only: never a part's `path`, never a swap's `recording`.
3. **30 days unused, then gone, unless locked.** "Used" = opened or saved. `deletesAt = usedAt + 30 days`; locked →
   no `deletesAt`. The open project is never deleted.
4. **The UI owns the edit; the backend owns the files.** The edit, transcripts and review state are JSON the UI
   writes and reads back unchanged (keep them as `serde_json::Value`). The backend owns ids, times, lock, parts'
   paths and swaps, and the thumbnail.
5. **Times are milliseconds since the epoch** (what JS `Date` takes). Lengths are seconds (f64).

## On disk
```
~/Library/Application Support/xyz.supercut.editor/projects/<id>/
  project.json      the project (below), written atomically (atomic.rs)
  thumb.jpg         480 px wide, from the cover frame
  audio/            swapped-audio media (moved here from Caches, which is cleared at start)
```
`<id>`: any short unique string that sorts nowhere (e.g. 12 random base32 chars). Never reused.

### project.json, v1
```jsonc
{
  "v": 1,
  "id": "k3m9q2x7a1bz",
  "name": "my-video",               // first video's file name without extension; the UI may rename
  "createdAt": 1764000000000,
  "usedAt": 1764003600000,          // set on open and on every save
  "locked": false,
  "length": 892.4,                  // edited length (s), as the UI last said; for the card's chip
  "cover": { "part": 1, "t": 3.2 }, // where the thumbnail comes from (the first kept frame), as the UI last said
  "nextPartId": 3,                  // Project.next_id, so ids are never reused after reopening
  "parts": [
    { "id": 1, "path": "/Users/…/my-video.mov", "name": "my-video.mov",
      "swap": { "recording": "/Users/…/shure.wav", "offset": -1.2, "synced": true,
                "media": "<project>/audio/swap-1.mov" } }   // or null
  ],
  "ui": { … }                       // opaque: written by save_project, returned by open_project, never read here
}
```
What the UI puts in `ui` (for reference, not the backend's business): `edit` (`{ cuts, words, notes, dismissed }`,
`src/ui/edit.js`), each part's transcript minus words (`speech`, `seconds`, `heard`…) by part id, and the review /
trace state. Undo history is **not** saved: a reopened project starts with an empty history.

## Commands
| Command | Does | Returns |
|---|---|---|
| `list_projects()` | Reads every `project.json`; skips (and logs) ones that don't parse. Newest `usedAt` first. | `Summary[]` |
| `new_project(paths: PathBuf[])` | If a project's **first part path equals `paths[0]`**, opens that one instead (no duplicate). Else makes a folder, adds the videos with today's `add` rules (video only, ≤ 2 parts), writes `project.json`, makes it the open project. | `Opened` |
| `open_project(id)` | Loads it as the open project (parts, swaps, `next_id`), sets `usedAt = now`, saves. A part whose `path` is gone is still loaded (the UI shows "Can't find…" with Locate). | `Opened` |
| `save_project(id, name, length, cover, ui)` | Writes the file atomically with `usedAt = now`. Parts and swaps come from the backend's own state (add/remove/swap already change it). If `cover` changed or there's no `thumb.jpg`: remake the thumbnail in the background. | `()` |
| `close_project()` | Stops the open project's running work (transcription, lining up audio), forgets it. The UI saves first. | `()` |
| `set_locked(id, locked)` | Sets the flag (does **not** change `usedAt`). | `Summary` |
| `delete_project(id)` | Removes the folder. Refuses the open project (`AppError`, "Close it first."). | `()` |
| `sweep_projects()` | Called once at start (before the first `list_projects`): deletes every unlocked project with `deletesAt <= now`, never the open one. A folder whose `project.json` won't parse uses the file's mtime as `usedAt`. | `u32` (how many) |

```ts
type Summary = {
  id: string, name: string, usedAt: number, locked: boolean,
  deletesAt: number | null,   // null when locked
  length: number,             // seconds, edited
  thumb: string | null,       // absolute path to thumb.jpg (the UI loads it with convertFileSrc), null until made
}
type Opened = {
  summary: Summary,
  parts: Part[],              // the same Part as add_video returns today (id, path, name, swap)
  ui: object | null,          // null for a new project
  existing: boolean,          // new_project found a project for this video and opened it
}
```

**As built** (Uncle Bob): `src-tauri/src/store/`. Names as above. Errors: `NoSuchProject` ("This project isn't here
any more."), `ProjectOpen` ("This project is open. Close it first."), `NotOpen` (a save, or a swap that lands, for a
project that isn't the open one). `save_project` takes `cover: { part, t } | null` and `ui` (any JSON). With no
project open, the part commands work on an unsaved scratch project as before. `close_project` stops previews; a
transcription still running finishes and its result is ignored by the UI.

## Notes for the build
- **The open project** replaces today's single in-memory `Project` in `Shared`: `add_video`, `remove_part`,
  `swap_audio`, `use_camera_audio` keep working on it unchanged. There is never more than one open.
- **Swaps must survive a restart:** new swaps write their media to `<project>/audio/`, not the Caches folder (closes
  the "swap isn't saved with the project" gap in the BETTER AUDIO SWAP update). Previews and learning clips stay in Caches.
- **Thumbnail:** one frame of the part's `media()` at `cover.t`, scaled to 480 wide, JPEG ~80 %. Same ffmpeg path as
  previews. A failure leaves `thumb: null` (the card shows the film tile) and is logged, never surfaced.
- **The UI debounces** `save_project` (1 s after the last change) and flushes it before going Home and on quit;
  the backend can treat every call as a full write.
- **Pure, tested rules** (no I/O): `deletes_at(used_at, locked)`, `expired(summary, now, open_id)`,
  `same_video(project, path)`, `project.json` round-trip with an unknown `ui` blob and an old file missing fields.
