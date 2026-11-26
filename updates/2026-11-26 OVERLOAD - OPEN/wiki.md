# How Magic Cut runs ffmpeg (jobs)

**Why:** ffmpeg renders used to run to the end even when nobody wanted the result, and outlived the app. Each
cut started another render of the same big clip, so copies piled up and starved the Mac.

**Rules now**
- Every ffmpeg goes through `src-tauri/src/jobs/` (`jobs::run` / `jobs::output`). Never call `Command::output()`
  on ffmpeg directly.
- A job is registered while it runs. Dropping its `Job` kills it; `finish(live)` checks `live()` every 50 ms and
  kills the child the moment it says no.
- `jobs::kill_all()` runs when the app exits and before an update relaunch. After a crash, the next start reaps
  orphaned bundled ffmpegs (parent pid 1).
- Previews: one render at a time (`RENDERING` lock in `preview/mod.rs`); a newer edit makes the older render's
  `live` false, so its ffmpeg dies within 50 ms. Clips to make are de-duplicated.
- UI (`src/ui/preview.js`): edits are debounced 400 ms; a failed render of one edit retries after 2, 4, 8 s, then
  stops until the edit changes (`createBackoff`).

**Check it:** quit the app, then `ps -axo pid,ppid,command` should show no `ffmpeg` from the app bundle.
