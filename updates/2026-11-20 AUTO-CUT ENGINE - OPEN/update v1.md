# Auto-cut engine — v1

## Goal
Magic works: from the Parakeet word transcript, find lines that were said more than once, let the user's
Claude decide what stays, and hand the UI a list of proposed cuts (word range + times + a short reason each).
Built-in rule: a re-recorded line keeps its **last** take. False starts and obvious fumbles go too.
A clean hook for custom rules (feature f-custom-ai-editing-rules), no UI for it.

## Shape
`src-tauri/src/autocut/` — pure core, Claude at the edge:
- `lines.rs` — words → numbered lines (sentence end or a pause).
- `similar.rs` — which lines are takes of the same line (word overlap), grouped.
- `prompt.rs` — what Claude reads: the rules (+ custom rules hook) and the numbered lines with their groups.
- `decide.rs` — Claude's keep/drop (reuses `claude::picks`) + the last-take rule → cuts with word ranges, times, reasons.
- `mod.rs` — `propose(parts, custom_rules, ask)`: the one entry; `ask` is passed in, so all of it is tested without Claude.

Claude only ever sees line numbers and answers with numbers: times come from the words, never from Claude.

## Roadmap
1. **Lines (pure)** — split each part's words into lines at `. ? !` or a pause ≥ 0.7 s; line ids run across parts.
   Tests: punctuation, pauses, parts, empty input.
2. **Repeated takes (pure)** — similarity = shared words in order (LCS) ÷ shorter line; a later line within the next
   few lines that scores ≥ 0.6 joins the group. Catches full retakes and false starts (a prefix of the retake).
   Tests: retake, false start, unrelated lines, chains of three takes.
3. **Decide** — prompt + system rules (custom rules appended when given), answer parsed by `picks::parse`, then the
   last-take guard: in a group where Claude keeps a take but not the last one, the keep moves to the last take.
   Dropped lines become cuts `{part, from, to, s, e, reason}`. Tests with canned answers.
4. **Entry points** — Tauri command `auto_cut` and CLI mode `SuperCut --auto-cut <file>` (transcribe + propose).
   Test: fake `claude` end to end through `propose`.
5. **Real sample with re-takes** — `npm run sample-retakes` speaks a script with a false start and two re-recorded
   lines (macOS `say`) into `models/retakes.wav`. Live tests: Parakeet → lines → the three groups are found;
   with this Mac's Claude: the earlier takes are cut, the last takes and the rest are kept.
6. **UI hook** — `src/ai.js` exports the runner (contract `design/ai-slot.md`): invokes `auto_cut`, builds the
   summary ("3 cuts · 1:02 → 0:44"). Tests in `test/ui.test.mjs`.

## Status
- Roadmap written. Building phase 1.

## Decisions
- One Claude call for the whole project (all parts): retakes can cross parts.
- The last-take rule is code, not just prompt: Claude decides *how many* takes stay, the rule decides *which*.
- Custom rules hook = a `&[String]` passed to `propose`, appended to the system prompt. The UI passes none yet.

## Next
- (after v1) Trim the pause around a cut, filler words ("um") as word-level cuts, cancel a running Claude call.
