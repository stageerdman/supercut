# Debug report — one click, honest

Author: Jony · 2026-11-26 · Status: **designed**. Part of `design/settings.md`.
Checked against `design/user-model.md` (hesitation "What leaves my Mac?"; new job "Something went wrong, tell them").

## User goal
"Something broke. Let them see what happened, without me explaining logs." One click. Know what was sent.

## What I removed, and why
| Removed | Why |
|---|---|
| A description field, an email field | Typing is the step that stops people sending. They tell us in the chat they already use; the reference ties the two. |
| A "Review what's sent" preview or a confirm dialog | The honest line sits right above the button, before the click. A dialog after it asks the same thing twice. |
| Checkboxes for what to include | One fixed, small bundle. No choices to get wrong. |
| A "Send report" button on every error banner | A second action on every banner. One home, one button. (Revisit if A46 is wrong.) |
| Remote pulling triggered by us | "We can pull it" = every sent report is kept on our side, findable by its reference. Nothing is fetched from the Mac without a click. |

## Layout (one `section`, see `design/settings.md`)
```
Help
Sends the app's log, token counts per video and           hint, body textSecondary
Mac details to the Magic Cut team. Video file names are
included; your videos, sound and transcripts never are.
[ Send debug report ]                                       secondary button, left-aligned
```
- Button: the standard secondary button (`raised`, `text`, 28 pt tall, radius 6), never accent: it's not the panel's
  main action. Status text appears to its right, same line, body `textSecondary`.

## Flow
1. Click **Send debug report**. That's all.

## States
| State | Button | Beside it |
|---|---|---|
| Ready | Send debug report | — |
| Sending | Sending… (disabled) | — |
| Sent | Send debug report (enabled again) | "Sent · ref 7F3K" (stays until the panel closes) |
| Failed | Send debug report | "Couldn't send. Check your connection and try again." |

- "ref" is the first 4 characters of the report id, upper case. Selectable text, so they can paste it to us.
- Focus stays on the button throughout; the status is `role="status"` (polite) so VoiceOver reads it.

## What is sent (fixed)
- The app log: the last 2 MB of `logs/magic-cut.log` (+ the previous file if the current one is short).
- `usage.jsonl` (`design/usage.md`).
- App version and build id, macOS version, Mac model, free disk space.
- Claude status: `missing` / `signed-out` / `ready` only. No account, no email.
- An install id: a random UUID made once and kept in app data (lets us group reports from one Mac). Nothing else
  identifies the person.
- **Home folder hidden:** before sending, every occurrence of the home folder path (`$HOME`, e.g. `/Users/<account>`)
  in the log and `usage.jsonl` is replaced with `~`. So the Mac's account name isn't sent; paths still read
  `~/Movies/talk.mov`. Tested in `report.rs`.
- **Never:** videos, audio, transcripts, rules, project files, the learning logs, the account name.
The hint must stay true: it names the three things sent (log, token counts, Mac details) and says file names go
too. If anything is added to this list, re-read the hint.

## Contract (Rust)
- **Log to a file:** `log.rs` writes every line to stderr **and** to
  `~/Library/Application Support/xyz.supercut.editor/logs/magic-cut.log`; at 2 MB it moves to `magic-cut.1.log`
  (one old file kept). Today the log is stderr only, so there is nothing to send without this.
- **`invoke('send_debug_report')`** → `{ id: string }`, or a plain-sentence error. Gzipped JSON
  `{ install, app, build, macos, model, disk, claude, log, usage }` POSTed to
  `https://magiccut.erdman.xyz/api/debug-report` (15 s limit).
- **Server:** a Cloudflare Worker stores each report in R2 as `reports/<install>/<at>-<id>.json.gz` and answers
  `{ id }`. Reports are read by us with the Cloudflare tools; no public read.
- Max 1 report per 30 s per Mac (button disabled while sending covers the UI; the Worker rejects bursts).

## Built in (proposed)
`src/ui/debug-report.js`: `mountDebugReport(invoke)` → one `section` (tested with a fake `invoke`: ready → sending
→ sent ref, and → failed). Rust: `src-tauri/src/report.rs` (bundle building tested: includes the log, excludes
project files, no `$HOME` path left anywhere in it). Worker deployed on the release site's domain, next to `scripts/release/cloudflare.js`.

## Assumptions
- A45: People will press it when asked by us, rarely on their own. Check: count reports with and without a chat
  message around them.
- A46: One button in Settings is easy enough to find when we say "press Send debug report in the gear". Check: the
  first 3 times we ask, time how long it takes.
