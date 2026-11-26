# Overload: leftover ffmpeg renders pile up — update v1

## Goal
No ffmpeg of Magic Cut outlives the app or the edit it was rendering. One job per output file at a time, every
child killed when the app quits, crashes (reaped on next start) or the result is no longer wanted, and a failing
preview retries a few times with backoff, then stops.

## What we found (root cause)
- At check time (21:21) no ffmpeg and no Magic Cut process was left, and no launch agent exists (`launchctl list`).
- The copies converting `IMG_8456.MOV` are preview clip renders (`preview/mod.rs` → `run` → `Command::output()`):
  the project keeps 0–9.5 s and 11.3–245 s, so one clip is a 234 s 4K → 720p transcode that takes minutes.
- **Children never die.** `Command::output()` waits for ffmpeg; nothing kills it. A newer edit makes the old render
  "stale", but staleness is only checked *between* clips, so the running ffmpeg goes on to the end. Quitting or the
  updater's relaunch orphans it (reparented to launchd) and it keeps running with no reader.
- **Duplicates.** Each edit (400 ms after the last change), each project open and each relaunch starts a new
  render of the same big clip while the old one still runs: same output name, same `.tmp.mp4` path. With the user
  editing, that is a new ffmpeg every minute or two; 19 in parallel starve the CPU so none finishes.
- `todo.dedup_by` only drops *adjacent* repeats.
- **Retry forever.** `src/ui/preview.js`: a failed render clears `asked`, so the next `current()` (every play)
  asks again at once, with no cap.

## Roadmap
1. **Kill now** — stop every leftover Magic Cut ffmpeg; watch 5 min that none returns. ✅ (none were left)
2. **Supervised children** (`src-tauri/src/jobs/`): one `run` that spawns ffmpeg, registers it, polls it, kills it
   the moment `live()` says no; a registry `kill_all()` on app exit and panic; on start, reap orphaned bundled
   ffmpegs (parent launchd) left by a crash. Preview, export and thumb use it. Tests: a stale job's child dies at
   once; `kill_all` leaves no child; reaper picks only our orphans.
3. **One job per file** — previews render one at a time (a newer render kills the older one's children before it
   starts); clip todo de-duplicated by name. Test: two renders of one span never run two ffmpegs at once.
4. **Capped retries** — preview.js: a failed key retries after 2 s, 4 s, 8 s, then stops until the edit changes.
   Test with a fake clock.
5. **Verify** — npm test, install the app, open/quit, process list clean. Push.

## Status
- Phase 1 done: process list clean at 21:21, no launch agents.
