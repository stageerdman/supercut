# Claude setup — from Magic, one press

Author: Jony · 2026-11-26 · Status: **designed**. Feature: Token usage, one-click debug report, easy Claude setup.
Replaces the "Copy command" sign-in banner (`design/main-screen.md` state 9, `claudeBanner` in `src/ui/magic.js`).
Checked against `design/user-model.md` (drop-off risk "technical Claude error"; goal 1 "clean video tonight").

## User goal
"I pressed Magic. Make it work." They don't know what Claude Code is and shouldn't have to. The only thing only they
can do is **sign in**. Everything else is ours.

## What I removed, and why
| Removed | Why |
|---|---|
| "Copy command" + "open Terminal yourself" | Three steps the app can do: open Terminal, paste, Return. |
| A setup wizard / dialog / Settings section | Setup is needed once, at Magic. The banner already lives there. |
| An Automation prompt ("Magic Cut wants to control Terminal") | We open a `.command` file instead of scripting Terminal: macOS runs it in Terminal with no permission dialog. |
| "I'm done" / "Check again" buttons | The app watches by itself and checks when the window comes back to the front. |
| Pressing Magic again after signing in | They already pressed it. Magic waits and starts by itself. |
| "Close this window and go back to Magic Cut" | An instruction to read and two steps to do. The script brings Magic Cut back to the front itself (`open -b xyz.supercut.editor`). |

## The two cases
| Claude on this Mac | Banner | Button | Terminal runs |
|---|---|---|---|
| **Not installed** (`missing`) | "Magic Cut uses Claude to pick your best takes. It isn't on this Mac yet." | **Install Claude** | the official installer, then sign-in |
| **Installed, signed out** (`signed-out`) | "Sign in to Claude to use Magic Cut." | **Sign in** | sign-in only |

One button each. The button is the banner's one action (`design/main-screen.md`, Banners). ✕ dismisses as today.

## Flow — not installed
1. Press **✦ Magic**. The check says `missing`. Banner: "…It isn't on this Mac yet." **[Install Claude]**.
   The Magic button turns into the pill **"Magic waits for Claude ✕"** (same pill as Queued).
2. Press **Install Claude**. Terminal opens in front and runs, visibly:
   ```
   Magic Cut is installing Claude Code…
   curl -fsSL https://claude.ai/install.sh | bash
   Now sign in to Claude in your browser.
   ~/.local/bin/claude auth login
   All set. Taking you back to Magic Cut…
   open -b xyz.supercut.editor
   ```
   Banner (no button but **Open again**): "Installing Claude in Terminal…"
3. Once `claude` exists, the banner says: "Claude is installed. Sign in in your browser." Browser shows Claude's own
   sign-in; they sign in. **← the only thing they do.**
4. `claude auth login` returns; the script brings Magic Cut to the front by itself. The window becoming active
   triggers the check → `ready`: banner goes away, Magic starts (status line: "Choosing the best takes…"). If a
   transcript is still running, Magic stays queued exactly as today. The Terminal window stays behind; nobody has
   to close it.

5 steps (was 7: "close this window" and "go back to Magic Cut" are gone). Of the 5, the person does three: press
Magic, press Install Claude, sign in.

## Flow — signed out
1. Press **✦ Magic** → `signed-out`. Banner "Sign in to Claude to use Magic Cut." **[Sign in]**. Pill "Magic waits for Claude ✕".
2. Press **Sign in**. Terminal opens and runs `<found claude> auth login` (same lines, minus install), then
   `open -b xyz.supercut.editor`.
   Banner: "Sign in in your browser. Magic starts when you're done." **[Open again]**.
3. They sign in. Magic Cut comes to the front by itself and Magic starts. (Was 5 steps; now 3.)

Total either way: **press Magic, press one button, sign in.** No coming back by hand.

## Waiting (what the app shows and does)
| | Shows | Does |
|---|---|---|
| Banner | the waiting sentence + **Open again** (re-runs the same script, for a closed window) | — |
| Magic button | pill "Magic waits for Claude ✕"; ✕ or ⌘↩ stops waiting (banner back to its first state) | — |
| Checking | nothing extra (no spinner: the sentence says what is happening) | `claude_status` every 3 s, and at once when the window becomes active. The front end must not cache the answer while waiting (today `main.js` caches it). |
| Gives up | after 15 min without `ready`: back to the first state of that case, pill back to ✦ Magic. Nothing is lost. | stops polling |
| Missing → signed out | banner swaps to "Claude is installed. Sign in in your browser." | keeps polling |
| Ready | banner closes; a 4 s status line "Claude is ready." only if Magic is still queued behind a transcript | starts Magic (or leaves it queued) |

- An install that fails (no internet) shows its error in Terminal, where they are looking. The app keeps waiting;
  Open again retries.
- The early check when a video loads (`design/main-screen.md`) shows the same banner and button, but there is no
  pill and nothing starts by itself until Magic is pressed.

## Keyboard & accessibility
- The banner button is a real `<button>`; banner `role="status"`. Focus moves to it when the banner appears after a
  Magic press (they're about to press it), not on the load-time banner (don't steal focus mid-edit).
- Waiting sentences are announced politely when they change.

## Contract (Rust)
- `invoke('claude_status')` unchanged: `{ state: "missing" | "signed-out" | "ready", message }`.
- **`invoke('claude_setup')`** → `()` or a plain-sentence error. Reads the status itself, writes
  `$TMPDIR/magic-cut-claude-setup.command` (mode 0755, `#!/bin/zsh`), the lines above with `echo` before each step,
  `|| exit 1` after the installer and after `auth login`, and last `open -b xyz.supercut.editor` (only reached when
sign-in succeeded, so a failed sign-in stays in Terminal where its error is); then `open -a Terminal <file>`.
`script()` tests: both cases end with the `open -b` line, after `auth login`. Signed out: uses the `claude` that
  `claude::locate()` found, not `~/.local/bin`.
- Error copy (`error.rs`): `ClaudeMissing` → "Claude isn't on this Mac yet."; `ClaudeSignedOut` → "Sign in to Claude
  to use Magic Cut." (Rust no longer tells people to open Terminal; the button does.)

## Built in (proposed)
`src/ui/claude-setup.js`: `setupBanner(status, phase)` (pure: case × phase → `[text, action]`; tested for all
rows above) and `createClaudeWait({ check, onReady, now })` (poll, focus check, 15 min give-up; tested with a fake
clock). `magic.js` gets one state, `waiting-claude`, beside `queued`. Rust: `claude/setup.rs` gains `script(status,
bin)` (pure, tested) and `open_setup()`.

## Assumptions
- C1: `claude auth login` opens the browser sign-in without the interactive first-run screens. Check: run it on a
  clean macOS user before building; if not, fall back to plain `claude` (it offers sign-in on first start).
- C2: `curl -fsSL https://claude.ai/install.sh | bash` stays the official installer and puts `claude` in
  `~/.local/bin` (first of `claude::candidates()`). Check: on the same clean user.
- C3: Starting Magic by itself after sign-in is what people want (they pressed it). Check: watch 2 first-time users;
  note any surprise.
