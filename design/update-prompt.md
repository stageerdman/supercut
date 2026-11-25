# Update available: the toolbar pill

## The goal
**"Get the newest Magic Cut without losing my place or my evening."** It's rare (every few weeks), it's never why
someone opened the app, and it must never get between them and the video (user model goal 1). One click to start, one to
finish, and both at the moment they choose.

## What I removed, and why
- **No dialog, no sheet, no banner.** A modal on launch is the classic interruption, and the banner is for errors
  (`banner.js`), so an update there would read as "something's wrong".
- **No "Later" or ✕.** A quiet pill doesn't need dismissing. Ignoring it *is* "later".
- **No "Skip this version", no settings, no "check for updates" menu.** Nobody on the straight line asks for them
  (user model: "Ignore: settings").
- **No confirm before downloading.** The click is the confirm. The download runs in the background, and editing goes on.
- **No release-notes panel.** The short notes ride along in the pill (one line, cut off with …). The full text is in the tooltip.
- **No forced restart.** The update is installed on disk, so the next normal launch is the new version anyway. Restart
  is offered and never pushed.

## Flow
launch → (3 s later, quietly) check → nothing new: nothing shows (the usual case)
                                     → new version: the pill appears → click → it fills while downloading → "Restart to update" → click → saves the project, relaunches

## Where
In the toolbar on every screen (Home and the editor), the first item of the right-hand group, left of the status line.
It's never over the video or the timeline. It's the same place on both screens, so it's found once and remembered.

## States (one button, `#update`, `src/ui/update.js`)
| State | Pill shows | Click | Notes |
|---|---|---|---|
| none / checking / offline | nothing (hidden) | — | A failed check is silent: it isn't the user's problem. |
| available | **↓ Update to 0.2.0** · *notes in secondary, max 220 pt, truncated* | starts download | Tooltip: "Magic Cut 0.2.0: ‹full notes›". Notes hidden when `""`. |
| downloading | **Updating… 42 %** with a 48 pt bar (size unknown: "Updating… 12 MB", no bar) | nothing (aria-disabled) | The bar is `role=progressbar` with a value. |
| ready | **↻ Restart to update** | saves the project, then relaunches | Tooltip: "Saves your project and opens Magic Cut 0.2.0". |
| restarting | **Restarting…** | nothing | |
| failed | back to *available* + the error banner with **Try again** | Try again = download again | Rust's message is shown as-is. |

## Look
- The pill is a quiet button: h 28, radius full, `raised` fill, `body` 13 text in `text`, notes in `textSecondary`,
  12 pt glyph, padding 4 × 12, gap 8. Hover: brightness 110. Focus: the 2 pt `accent` ring. **No accent fill.** The
  accent stays for Magic, the playhead and cuts (max three at once).
- The bar is the status line's bar at 48 wide (`raised` track, `accent` fill), so "work is running" looks the same
  everywhere.
- Appearing: 180 ms opacity fade. No slide or bounce. Reduce Motion: unchanged (it's already a fade).

## Behaviour details
- Check once per app launch, 3 s after Home shows, so it never competes with launch. Going Home reloads the page:
  the page then checks again, and Rust answers from memory.
- If a download started before a reload, the page joins it (sessionStorage `update.installing`). Rust lets a second
  `update_install` join the running one, or resolve at once if it has finished. So the pill comes back as
  downloading or ready, never as "Update to …" again.
- Restart flushes the autosave and the learning log (`leaveProject`) first, so nothing typed a second ago is lost.
- Screen reader: the pill's accessible name is its text. The state changes are announced through `aria-live="polite"`
  on the label. Keyboard: Tab reaches it, and Return or Space press it.

## Contract (Uncle Bob, `src-tauri`)
- `update_check` → `null | { version, notes, date }`. It never rejects.
- `update_install` → resolves when installed, rejects with a plain message, and joins a running install. Events:
  `update://progress` `{ downloaded, total|null }` (running totals).
- `update_restart` → relaunches.

## Assumptions
| # | Assumption | Quick check |
|---|---|---|
| A39 | A pill in the toolbar is noticed within a session or two, without a dialog | Log time from "available" to the first click |
| A40 | Most people restart soon after the download, rather than waiting for the next launch | Log the gap between ready and restart |
