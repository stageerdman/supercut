# Token usage, debug report, Claude setup — update v1

Goal (Pixel): token usage per exported project, a one-click debug report, and a super-easy Claude Code setup.
Feature: f-token-usage-one-click-debug-report-easy.

## Part A — Token usage per exported project (Uncle Bob)

### Design in one paragraph
Every `claude -p` call ends with a `result` line that carries `usage` (`input_tokens`, `output_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens`) and `total_cost_usd`. `claude/stream.rs` reads them into a
`Usage` that travels on `Reply`. The command that made the call (Magic on the open project, the self-test with no
project) appends one line to a **ledger**: a plain, append-only JSON-lines file at
`~/Library/Application Support/xyz.supercut.editor/usage/ledger.jsonl`, outside `projects/`, so the 30-day sweep
and Delete never touch it. A finished export appends an `export` line for the open project. The ledger is the one
truth: per-project figures and the total are computed from it. The project's own `project.json` also keeps a
running tally (`usage`) and `exportedAt`, so a project's data describes itself. **Only exported projects count
toward the total**; all their calls count, before and after the export. Calls with no project (self-test, CLI)
are kept in the ledger but never count.

### Ledger lines
```
{"at":1764000000000,"kind":"call","project":"k3m9q2x7a1bz","trace":"magic","model":"claude-sonnet-5-5","input":1200,"output":340,"cacheRead":0,"cacheWrite":5000,"costUsd":0.021}
{"at":1764000100000,"kind":"export","project":"k3m9q2x7a1bz","name":"my-video"}
```
A line that doesn't parse is skipped (logged), never fatal. `costUsd` is the CLI's estimate: kept, not shown
(a subscription isn't billed per call).

### Contract for the UI
- `token_usage()` → `{ projects: [{ id, name, calls, input, output, cacheRead, cacheWrite, tokens, exported }],
  total: { calls, input, output, cacheRead, cacheWrite, tokens, projects } }`. `tokens` = all four token counts
  summed. `total` sums only projects with `exported: true`. Newest activity first.
- `token_usage_notes()` → the ledger's path and its raw lines (pull them out any time; also for the debug report).
- CLI: `supercut --token-usage` prints the same report as JSON.

### Phases
1. **Roadmap** (this file). ✅
2. **Read usage from the stream** — `Usage` in `claude/stream.rs`, on `Reply`.
   *Tests:* usage read from a result line; missing usage = zeros, never a failure.
3. **Ledger** — `usage/` module: append a line, read all lines back (bad line skipped), pure `report(entries)`
   with the export rule. *Tests:* counting, unexported projects don't count, calls after export count,
   no-project calls never count, notes read back after the project's folder is swept.
4. **Wire it** — `auto_cut` records for the open project, `claude_self_test` with no project, `export_video` marks
   the export; `project.json` gets `usage` + `exportedAt`; commands `token_usage`, `token_usage_notes`, CLI
   `--token-usage`. *Tests:* a fake claude's usage lands in the ledger and the project's tally; old project files
   without the fields still open.

## Part B — One-click debug report (next item)
One button (Home's menu and the error banner) that gathers what's needed to debug a problem into one plain folder
or zip the user can send: app version and build id, macOS version, Claude Code status (path, version, signed in),
the last app log lines, the token-usage notes, the open project's `project.json` (paths kept, no media), and the
latest Magic Trace logs. Nothing leaves the Mac unless the user sends it.

1. **Research + UX** — what a report must hold to answer "why did it fail"; where the button lives (UX expert).
2. **Collector, pure** — `debug_report` gathers the pieces into one file; each missing piece is noted, never fatal.
   *Tests:* report contents from a fake data folder; a missing log or project is reported, not an error.
3. **App log to file** — `log.rs` also appends to a rotating file in the data folder (stderr is lost in a
   bundled app). *Tests:* rotation keeps the newest lines.
4. **Button + Show in Finder** — UI. *Tests:* button calls the command, shows the file.

## Part C — Super-easy Claude Code setup (next item)
Today Magic fails with "Install Claude Code" or "Open Terminal and run `claude`". Instead the app detects the state
and takes the user straight to the fix:
- **Not installed** → open Terminal with the official install command typed in; once it finishes, go straight on
  to the login step.
- **Installed but signed out** → open Terminal straight to `claude` (login).
- **Ready** → nothing shown; the self-test confirms it.

1. **Detection** — extend `claude/setup.rs` `status` to `missing | signed-out | ready` reliably (a cheap check,
   no tokens). *Tests:* each state from fake binaries.
2. **Terminal launch** — open Terminal.app with the install command, or with `claude` for login (AppleScript via
   `osascript`); the app polls `claude_status` and moves on by itself. *Tests:* the script text per state; polling
   moves from missing → signed-out → ready.
3. **Setup card UI** (UX expert) — one card, one button per state, live status. *Tests:* each state renders its
   one action; ready hides the card.

## Status
- 2026-11-26: Phase A1 (roadmap) done.
