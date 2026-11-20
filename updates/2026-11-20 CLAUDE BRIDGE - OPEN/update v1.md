# Claude bridge — v1

## Goal
The Rust side runs the user's own `claude` CLI on their subscription and reads the answer back as checked JSON. Missing CLI or signed-out user gets one plain sentence.

## Phases
1. **Stream reader (pure)** — `src-tauri/src/claude/stream.rs`: stream-json lines → answer or one of three errors (sign in / busy / failed with details). Tests from text. ✅
2. **Process runner** — `claude/ask.rs`: spawn with no API key, no `--bare`, no tools, no MCP, no saved session, in an empty temp folder; prompt on stdin; lossy UTF-8 line reader; 120 s timeout kills the child. Tested with fake `claude` shell scripts (echo, crash, logged-out, hang, can't start). ✅
3. **Answer shape** — `claude/picks.rs`: `{keep: [id], drop: [{id, reason}]}` + JSON schema; rejects missing, doubled or unknown ids. ✅
4. **Self-test** — `claude/self_test.rs`: 3-sentence sample with a false start. Exposed as the Tauri command `claude_self_test` and the CLI mode `SuperCut --claude-test`, which `npm run smoke` now runs on the built app. ✅

## Status (2026-11-20)
- `npm test`: 45 passed, 0 failed. Live round trip with this Mac's Claude: 5.9 s, `{"keep":[2,3],"drop":[{"id":1,"reason":"False start, retaken fluently in sentence 2"}]}`.
- `npm run build` + `npm run smoke`: the packaged app answered in 5.8 s with the same picks, then transcribed the 2.5 min .mov.

## Decisions
- `--max-turns` is not passed: structured output may need a tool turn, and `--tools ""` already stops anything else.
- Model pinned to `sonnet`: fast enough, and the user's default may be slower.
- Error wording lives once in `AppError`; `claude_status` reuses it.
- `stream-json` (not plain `json`) so retry events are seen; they're logged, not shown yet.

## Next
- Magic itself: send the real transcript's sentences, apply picks to the edit list.
- Show "Claude is busy, retrying…" in the status line from the retry events.
- Cancel a running call (SIGINT).
