# Home screen — wiki

- **The project is the edit, not a file.** People know their videos, not project files. So projects save themselves
  into the app's folder, are named after the video, and the same video dropped again opens its project.
- **Expiry needs to be visible but calm.** A rule nobody sees feels like data loss; a red countdown feels like an
  error. Days left on every card in grey, brighter in the last 3 days, one line under the grid explaining the rule.
- **Count from last use, not creation**, or a long project disappears while you're still on it.
- **The UI owns the edit's shape; the backend stores it opaque.** The edit already is plain JSON (`src/ui/edit.js`);
  keeping it a `serde_json::Value` in Rust means a new edit field never needs a backend change.
- **Disk is the truth for a project's metadata; memory only holds its parts.** `save_project` reads project.json,
  applies the UI's edit and the session's parts, writes it back, so a lock set from Home is never overwritten by an
  autosave. Every library write runs under the session lock, so two writes of one file never interleave.
- **No project open = today's scratch project.** The part commands work as before when nothing is open, so the app
  keeps working until the UI calls `new_project`; swaps then go to the cache instead of a project's `audio/`.
- **Long jobs re-check the open project when they land.** Lining up audio takes seconds; if the open project changed
  meanwhile, `swap_audio` returns `NotOpen` instead of putting the swap on another project's part with the same id.
- **Never delete what the user brought.** Project delete and sweep remove the project folder only, never a video or a
  mic recording; the confirm says so in words.
