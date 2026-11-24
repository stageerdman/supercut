# Magic Cut — home screen (past projects)

Author: Jony · 2026-11-24 · Status: **ready for build**. Checked against `design/user-model.md` ("Coming back").
Data it needs: `design/project-store.md`. Tokens: `design/visual-system.md`. Replaces the "Recent" line sketched
in `design/main-screen.md` state 1.

## User goal
"Get back to the video I was cutting." Nearly always that's the **last one**, and nearly always it's opened again
within a few days. Second: "start a new one". Third, rarely: "keep this one" or "get rid of this one".

## What I removed, and why
| Removed | Why |
|---|---|
| Open / Save / Save As, project files the user handles | Every project autosaves into the app's own folder. The video is the thing people know; the project is just its edit. |
| New Project dialog, naming step | A dropped video *is* a new project, named after the file. Rename in the editor's toolbar, as before. |
| Search, sort menu, filters, folders | Projects expire after 30 days, so the list stays short. Newest first is the only order anyone wants. |
| Grid / list toggle | One layout: a grid of thumbnails. People find a video by its picture. |
| Rename, Duplicate, Show in Finder in the menu | Rename lives in the editor. Duplicate and Finder serve no goal we know of. The menu is only for what can't be done elsewhere: lock and delete. |
| "Recently deleted" / trash, undo of a delete | The confirm guards against mistakes. A trash adds a second list to manage. The video files are never touched, so the worst case is re-cutting. |
| A countdown in red, warning banners before auto-delete | Calm by default: the days left are on every card, and the line turns brighter only in the last 3 days. |
| Settings for the 30 days | One rule. Lock is the exception, one click away. |

## Flow
```
launch ──► Home ──click a card / Return──► Editor (that project, as you left it)
             │                                │
             ├─ drop a video / Choose Video… ─┤  (a new project; the same video again → its project)
             │                                │
             ◄────────── ‹ in the toolbar ─────┘  (saves first)
```
- **Launch always lands on Home**, with the last project first and focused: **Return** goes straight back to work.
  With no projects yet, Home *is* today's empty drop zone (main-screen state 1), with one line under it saying projects will appear here.
- **One project open at a time.** Opening another means going Home first.
- **Dropping a video you already have a project for opens that project** (matched by the path of its first part),
  with the status line "Opened your project from Nov 22" for 4 s. No duplicate is made. (A34)
- Going Home **saves, then stops the open project's work** (transcription, Magic, lining up audio). What was done is
  kept; a part that was still transcribing shows Generate again next time. No dialog. (A35)

## Layout
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ● ● ●                                                                           │ toolbar 52, empty
│                                                                                 │
│    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│        Drop a video to start a new project               [ Choose Video… ]      │ new strip, 88
│    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
│                                                                                 │ 32
│    Projects                                                                     │ heading
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │ 12
│    │              │  │           🔒 │  │              │  │              │       │
│    │    thumb     │  │    thumb     │  │    thumb     │  │    (film)    │       │ 16:9
│    │        14:52 │  │         8:03 │  │        22:10 │  │         3:41 │       │
│    └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘       │
│    my-video          course-intro       podcast-ep-12      Take 3                │ name
│    Today · 30 days…  Monday             Nov 2 · Deletes…   Oct 28 · 2 days left  │ meta
│                                                                                 │
│    Unlocked projects are deleted 30 days after you last open them.              │ rule line
│    Your video files are never touched.                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```
- **Page:** `bg`, scrolls vertically as one page (the strip scrolls away; the whole window takes drops anyway).
  Content column max 1200 wide, centred, side padding 32, top padding 24.
- **New strip** (the one primary): 88 tall, full column width, dashed 1.5 pt `hairline`, radius 16 (the drop zone's
  look, shorter). Left, padding 24: "Drop a video to start a new project" (`body` 13, `text`). Right, padding 24:
  **Choose Video…** (PrimaryButton, the only filled button on Home). Clicking anywhere in the strip opens the picker.
- **Heading** "Projects": `bodyStrong` 13, `textSecondary`, 32 below the strip, 12 above the grid. When the sweep just
  deleted some (see States), the same line continues after a ` · `: "2 old projects were deleted".
- **Grid:** `repeat(auto-fill, minmax(208px, 1fr))`, gap 24 across, 32 down. At the 960 minimum: 4 columns.
- **Rule line:** under the grid, 32 above, `caption` 11, `textSecondary`, two short lines as drawn. It is the only
  place the rule is explained, and it's never in the way.

### The card (`ProjectCard`)
```
┌──────────────────────────┐ ← thumb, 16:9, radius 10, `raised` behind it, image object-fit: cover
│                    (🔒)  │ ← lock button, 24 round, 8 from top/right
│                          │
│                   14:52  │ ← length chip, 8 from bottom/right
└──────────────────────────┘
 my-video                    ← name: bodyStrong 13, `text`, one line, ellipsis. 8 below the thumb
 Yesterday · 29 days left    ← meta: body 13, `textSecondary`, one line. 2 below the name
```
- **Thumb:** the project's first kept frame (made by the backend). None yet / unreadable: `raised` tile with
  the `film` symbol, 24 pt, `textSecondary`, centred.
- **Length chip:** the *edited* length (what you'd post), `caption` 11 medium, monospaced digits, `text` on
  black 60 %, radius 6, padding 2 × 6. `m:ss`, `h:mm:ss` from an hour.
- **Lock button:** 24 × 24 visible, 28 × 28 hit area, black 60 % round, 13 pt symbol.
  - Locked: `lock.fill` in `text`, **always shown**.
  - Unlocked: `lock.open` in `textSecondary`, shown only while the card is hovered or focused.
  - Click toggles, 120 ms cross-fade of the symbol; the meta line updates at once. Tooltip: "Keep forever" /
    "Delete after 30 days unused".
- **Meta line:** `when` · `keep`, words from the pure function `cardMeta(summary, now)`:
  - `when` (from `usedAt`, calendar days): "Today", "Yesterday", the weekday within the last 6 days ("Monday"),
    else "Nov 2", with the year when not this year ("Nov 2, 2025").
  - `keep` (from `deletesAt`, calendar days): locked → nothing (the lock says it, the line is just `when`);
    ≥ 2 → "12 days left"; 1 → "Deletes tomorrow"; 0 or past → "Deletes today".
    In the last 3 days (≤ 3) the `keep` part is `text` instead of `textSecondary`. No red: it's a fact, not an error.
- **Hover:** the thumb gets a white 6 % overlay, 120 ms. Cursor: pointer.
- **Focus:** 2 pt `accent` ring around the thumb, offset 2. The card is one tab stop; the lock button is the next one.
- **Click / Return:** open. **Right-click / Ctrl-click:** the menu. **⌫ / Delete:** Delete… (the confirm).
- **Arrow keys** move focus across the grid (left/right by one, up/down by a row). Home/End: first/last.

### The menu (native, `context-menu.js` `popup`)
```
Open
──────────
Lock                (Unlock when locked)
──────────
Delete…             ⌫
```
"Open" is there so the menu is never only destructive. Nothing else.

### Delete confirm (native alert, `tauri-plugin-dialog` `ask`)
- Title: **Delete “my-video”?**
- Message: "Its cuts, notes and transcript will be removed. Your video files stay where they are."
- Buttons: **Delete** (destructive) · **Cancel** (default, Esc and Return). Same for locked projects; the lock guards
  only against the automatic delete.
- On Delete: the card fades and the grid closes up (180 ms; Reduce Motion: fade only). Focus moves to the next card
  (else the previous; else the strip's button). If it was the last project, Home becomes the empty drop zone.
- Fails (folder can't be removed): the card stays; banner "Couldn't delete my-video. Try again." with no action.

### The way back (editor toolbar)
```
│ ● ● ●  ‹  my-video                    status …      [ Review ] [ ✦ Magic Cut ] │
```
- A 28 × 28 plain icon button, `chevron.left` 15 pt, `textSecondary` → `text` on hover, 8 right of the traffic
  lights, 4 left of the project name. Tooltip and label: "All projects". Not shown on Home.
- During cut review it stays: leaving saves the review's verdicts like everything else.

## States
| State | What shows |
|---|---|
| **No projects** | Main-screen state 1 (big drop zone, Choose Video…), plus one `caption` line 24 below it, `textSecondary`: "Your projects will appear here, saved as you work." No heading, no grid. (Added 2026-11-24: without it a first launch looked exactly like the old app, and Home read as missing.) The line is not shown in a project whose video was removed. |
| **Loading the list** | Nothing extra: it's local and quick. The window paints `bg` until the list arrives; no skeletons. |
| **Projects** | Strip, heading, grid (newest `usedAt` first), rule line. The first card has focus. |
| **Just swept** | Heading reads "Projects · 2 old projects were deleted" (1: "1 old project was deleted") for this visit to Home. |
| **Drag over** | A valid video over the window: the strip's border turns solid `accent`, fill `accent` 8 %, its text "Drop to open". Invalid file: border `textSecondary`, "Only video files open here". Audio only: "Add the video first". No projects: the big zone does the same (main-screen state 2). |
| **Opening** | The editor appears at once (main-screen state 3); the project's saved cuts, words, notes and audio are in place. |
| **Thumb missing** | Film tile (see the card). |
| **Video moved or gone** | The card looks the same and opens; the editor shows today's banner "Can't find my-video.mov." with Locate…. |
| **Can't open** (a broken project file) | Not listed; the backend logs it and the sweep removes it after 30 days. |
| **Window narrow** | The grid drops columns down to the 960 minimum (4). Cards never shrink below 208. |

## Accessibility
- Grid: `role="list"`, label "Projects"; each card `role="listitem"` holding one button.
- Card button label: "my-video, edited yesterday, 14 minutes 52 seconds, 29 days left" / "…, locked".
- Lock button: `aria-pressed`, label "Lock my-video" / "Unlock my-video".
- Contrast: name 15:1, meta 7:1, chip text on black 60 % over any frame ≥ 4.5:1 (the black does the work).
- Everything above works by keyboard; the menu is also reachable as Delete (⌫) and the lock button by Tab.
- Reduce Motion: no closing-up slide, only fades.

## Components (build once, reuse)
- `src/ui/home.js` — pure: `cardMeta(summary, now)`, `lengthText(s)`, `cardLabel(summary, now)`, `homeMenu(summary)`,
  `sweptText(n)`, `nextFocus(ids, removedId)`. Tested without a window.
- `src/ui/home-view.js` — renders strip, heading, grid, rule line from a list; calls back `open`, `lock`, `remove`,
  `choose`. Reuses `dropzone.js` (states) and `context-menu.js` (`popup`).
- `src/ui/project-card.js` — one card, every state (thumb / no thumb, locked / not, hover, focus, ≤ 3 days).
- `PrimaryButton`, `Banner` — as today.
