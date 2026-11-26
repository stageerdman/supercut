# Usage — AI tokens per exported video

Author: Jony · 2026-11-26 · Status: **built** (2026-11-26). Part of `design/settings.md`.
Checked against `design/user-model.md` (new job "How much AI did that take?": rare, a glance, never mid-edit).

## User goal
"How many Claude tokens did my videos use?" One glance: a total, and which video took what. Nothing to do with it.

## Who asked, and why
The user (via Pixel): count only videos that were **exported**, because an unexported project is a try-out, not a
video. Every call is still written down, so any other count can be pulled out later from the file.

## What I removed, and why
| Removed | Why |
|---|---|
| Money / cost column | They use their own Claude subscription; a dollar figure would be wrong for them. The file keeps `cost_usd` for us. |
| Input / output / cache split | A breakdown nobody acts on. One number per video; the file keeps the four parts. |
| Dates, charts, per-run rows, a period picker | No goal needs them. Newest export first is all the order it needs. |
| Reset / clear button | Nothing to reset: it's a record, not a budget. |
| Clicking a row to open the project | Not why they came; and swept projects can't open. |

## What counts
- **Tokens** of a call = input + output + cache creation + cache read, from the `usage` object on the `result` line of
  `claude -p --output-format stream-json`. (Assumption U1.)
- Every Claude call made **for a project** (each Magic run, any retry) counts toward it. The self-test isn't for a
  project: it's written to the file but shown nowhere.
- A project appears once it has **at least one successful export**, with **all** its tokens (also those from before
  the export and after it). Never exported → not shown, not in the total.
- Projects removed by the 30-day sweep or by Delete **stay** in the list: they were exported, the tokens were spent.

## Layout (one `section`, see `design/settings.md`)
```
Usage                                   1.2 M tokens     title + aside (the total)
talk-final                                    412 k      body, name in text, number textSecondary
podcast-ep3                                   860 k
```
- No hint line when there are rows: the title and numbers say it.
- Row: 24 pt tall, name left (video file name without extension, the first part's; middle-truncated with …),
  number right, tabular figures. Newest export first.
- Up to 5 rows show; more → the list scrolls inside a 120 pt box (no "show all" button).
- Numbers: under 1 000 as is ("860"), then "412 k", then "1.2 M" (one decimal under 10 M). Tooltip and screen reader
  get the exact figure: "talk-final, 412,318 tokens".

## States
| State | What shows |
|---|---|
| Loading | Title only, for the instant the file takes. |
| Nothing exported yet | Title, no aside; hint: "Videos count here once you export them." |
| Rows | Total as aside, rows below. |
| File can't be read | Hint: "Usage can't be read right now." No banner: it isn't worth interrupting anyone. |

## Keyboard & accessibility
- The list is a `<table>` with a visually hidden header (Video, Tokens), so VoiceOver reads it as pairs.
- When it scrolls, the box is focusable (`tabindex=0`, `aria-label="Usage by video"`) and arrow keys scroll.
- Contrast: names 15:1, numbers 7:1 on `surface`.

## Contract (Rust)
**The record:** one file, `~/Library/Application Support/xyz.supercut.editor/usage.jsonl`, append-only, one JSON
object per line. Kept outside `projects/` so sweeps never touch it. This is the "pull it out later" file.
```
{"at":"2026-11-26T20:14:03Z","kind":"claude","project":"p_8f2…","name":"talk-final","trace":"magic","model":"claude-…",
 "input":1200,"output":3400,"cache_creation":0,"cache_read":180000,"cost_usd":0.41}
{"at":"2026-11-26T21:02:40Z","kind":"export","project":"p_8f2…","name":"talk-final"}
```
- `claude/ask.rs` appends a `claude` line after every call that returned a `result` line (also failed ones that
  report usage). It needs the project id and name: pass them with the trace. `project` is `null` for the self-test.
- Export appends an `export` line when an export **finishes** (not on cancel or failure).
- A write failure is logged, never shown, and never fails the call or the export.

**`invoke('usage_list')`** →
`{ total: number, videos: [{ name: string, tokens: number }] }`, newest export first; only projects with an
`export` line; `name` from the latest line for that project. Bad lines are skipped.

## Built in (proposed)
`src/ui/usage.js`: `formatTokens(n)` (pure, tested: 0, 999, 1 000, 412 318, 9 950 000, 12 400 000) and
`mountUsage(invoke)` → one `section`. Rust: `src-tauri/src/usage.rs` (`record`, `list`; tested on a temp file with
an unexported project, a swept project, a bad line).

## Assumptions
- U1: People read "tokens" as all the tokens, cache reads included (they dominate). Check: ask 3 users whether
  412 k "feels right" next to Claude's own usage screen.
- U2: The first part's file name is how they know the video. Same as Home (`design/home-screen.md`).
