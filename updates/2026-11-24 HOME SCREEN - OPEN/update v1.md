# Home screen with past projects — update v1

Feature: f-home-screen-with-past-projects.

## Goal
The app opens on a home screen listing every project you've made, newest first, as thumbnails with name, date, a
lock and the days left. Click one to pick up where you left off. Projects you haven't opened in 30 days delete
themselves (only the project, never your videos) unless locked. Right-click: Lock / Unlock, Delete (with a confirm).
Dropping a video, or Choose Video…, starts a new project.

Today nothing is saved: a project lives only while the app is open. So this update is mostly **saving**; the
screen itself is small.

## Design (Jony, 2026-11-24) — done
- `design/home-screen.md` — flow, layout, the card, the menu, the confirm, the way back, every state, a11y, components.
- `design/project-store.md` — the data contract for the backend: folder layout, `project.json` v1, commands, rules.
- `design/main-screen.md` — state 1 points here; the toolbar's ‹ back button. `design/user-model.md` — "Coming back",
  A34–A38.

### Decisions
- **Launch lands on Home, last project first and focused**, so Return is the way back to work. No projects: Home is
  today's empty drop zone, unchanged.
- **A drop is still the way to start.** A wide drop strip with Choose Video… is Home's one primary. The same video
  dropped again opens its project instead of making a twin.
- **The 30-day clock counts from the last open or save**, not from creation: a project you keep working on never
  vanishes.
- **Days left on every unlocked card**, calm grey; brighter (not red) in the last 3 days. Locked cards show a lock and
  no countdown.
- **Delete always asks** (native alert), locked or not; the lock guards only against the automatic delete. No trash.
- **One project open at a time.** Going Home saves and stops the open project's running work.
- **Removed:** search, sort, list view, rename / duplicate / Finder in the menu, a trash, settings for the 30 days.

## Phases
Owners per the orchestrator. Phases 1–3 are backend (contract: `design/project-store.md`), 4 is UI.

1. **Store (Rust).** `src-tauri/src/store/`: the folder layout, `project.json` v1 read/write (atomic), `list`,
   `set_locked`, `delete`, `sweep`; the open project in `Shared` built from a store entry; `new_project` with the
   same-video match; swaps write into the project's `audio/`.
   **Tests:** round-trip keeps an unknown `ui` blob byte-for-byte and reads a file with missing fields; `deletes_at` /
   `expired` (locked never, the open one never, the edge at exactly 30 days); sweep on a temp folder deletes only the
   expired folder and leaves the parts' videos and recordings on disk; a broken `project.json` is skipped by `list`
   and swept by mtime; `delete_project` refuses the open one; `new_project` on the same first video returns
   `existing: true`; part ids keep counting after reopening.
2. **Autosave and reopen (UI).** `src/ui/project-doc.js` (pure): the `ui` blob from the app's state (edit,
   transcripts minus words, review/trace) and back; `length` and `cover` (first kept frame) from the edit. `main.js`:
   debounce 1 s, flush before Home and on quit; open restores parts, swaps, words, cuts, notes, verdicts.
   **Tests:** doc → state → doc is the same; cover is the first kept second (start cut away → after it); an old doc
   without notes still opens; reopening paints the same cuts and words (fake DOM).
3. **Thumbnails (Rust).** Frame at `cover` from `media()`, 480 wide, in the background after a save that changed it.
   **Tests:** a real fixture video makes a JPEG 480 wide; a changed cover remakes it, an unchanged one doesn't; a
   failure leaves `thumb: null`.
4. **Home screen (UI).** `src/ui/home.js` (pure words and menu), `project-card.js`, `home-view.js`; launch → sweep →
   list → Home; the ‹ button in the editor; drop and Choose Video… on Home; lock button; native menu; delete confirm;
   focus and arrow keys.
   **Tests:** `cardMeta` for today / yesterday / weekday / date / other year and 0, 1, 2, 3, 12 days left and locked;
   `lengthText`; `homeMenu` locked and not; `sweptText` 1 and many; `nextFocus` after deleting first, middle, last,
   only; the view: no projects → drop zone, card states, Delete only after confirm, Cancel changes nothing.
5. **Look and install.** A WebKit look at every Home state (empty, a few, many, locked, last 3 days, no thumb, drag
   over, just swept) and the toolbar's ‹; then `npm run install-app`.

## Status
- [x] Design and roadmap (this file; specs above)
- [x] Phase 1 Store (Uncle Bob, 2026-11-24): `src-tauri/src/store/` — `rules.rs` (pure: `deletes_at`, `expired`,
  `same_video`, `new_id`), `doc.rs` (project.json v1, `Summary`, `Opened`), `mod.rs` (`Library`: read/write, list,
  lock, delete, sweep), `session.rs` (the one open project: new/open/save/close), `thumb.rs`. Commands in `main.rs`:
  `list_projects`, `new_project`, `open_project`, `save_project`, `close_project`, `set_locked`, `delete_project`,
  `sweep_projects`. Swaps of an open project write into its `audio/`. 26 tests, all listed in the phase above.
- [x] Phase 2 Autosave and reopen (Jony, 2026-11-24): `src/ui/project-doc.js` (`toDoc`, `fromDoc`, `lengthOfEdit`,
  `coverOf`). `main.js` saves 1 s after any change (every history step and render; an unchanged doc is not
  rewritten), and flushes on ‹ and on window close. A new project saves at once, so its card gets a picture.
- [x] Phase 3 Thumbnails (backend, with phase 1): `save_project` makes `thumb.jpg` in the background when the cover
  moved or there is none; failures are logged only. Tested on a real fixture (480×270 JPEG; past the end → no file).
- [x] Phase 4 Home screen (Jony, 2026-11-24): `src/ui/home.js`, `project-card.js`, `home-view.js`; `#home` in
  `index.html`, the ‹ `#home-button` before the title. Launch: `close_project` → `sweep_projects` → `list_projects`
  → Home, newest card focused. Click / Return reopens; lock button; right-click Open · Lock · Delete…; delete asks
  first; drop or Choose Video… starts a project (the same video reopens its own, with a "reopened" line).
  Tests: `test/home.test.mjs`, `test/home-view.test.mjs`, `test/project-doc.test.mjs`, and `test/boot.test.mjs`
  (the real `main.js` on a fake DOM: launch reaches Home; a card click opens the editor and autosaves).
  Decisions made while building:
  - **Going Home reloads the page** after saving and closing the project in Rust. Every editor state starts fresh,
    so nothing from one project can leak into the next. It costs a short blink.
  - **The delete alert's default button is Delete**: the native `ask` can't make Cancel the default. The alert still
    names the project and says the videos stay.
  - **Not built: Locate… for a moved video.** Rust has no relink command yet; a card whose video is gone still opens
    and the editor shows the missing file the usual way. In issues.txt.
- [ ] Phase 5 Look and install
