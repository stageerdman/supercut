# Custom AI editing rules — v1

## Goal
The user writes their own editing rules in plain words ("Keep every joke", "Cut the intro small talk").
They are kept on this Mac, survive a restart, and every Magic Cut run hands them to Claude after the
built-in rules. Where they differ, the user's rules win (feature f-custom-ai-editing-rules).

## Shape
- `src-tauri/src/rules.rs` — the store: a JSON list of strings in
  `~/Library/Application Support/xyz.supercut.editor/rules.json`. `load(path)` / `save(path, rules)`, pure
  `clean(rules)` (trim, drop empty, drop duplicates). Missing file = no rules.
- `main.rs` — commands `get_rules` / `save_rules`; `auto_cut` and the `--auto-cut` CLI load the rules and pass them on.
- `autocut::run(bin, parts, rules, trace)` → `propose(parts, rules, ask)` → `prompt::system(rules)` (already there:
  built-in rules, then "The user's own rules … they win").
- The engine never reads files: the rules come in as `&[String]`.

## Roadmap
1. **Store (Rust)** — `rules.rs`: clean, load, save (write to `.tmp`, then rename, so a crash never leaves half a file).
   A file that isn't a list of strings is an error (`AppError::Rules`), never silently treated as "no rules".
   Tests: round trip, missing file → empty, cleaning, broken file → error, save creates the folder.
2. **Commands + engine wiring** — `get_rules`, `save_rules` (returns the cleaned list); `auto_cut` and the CLI load
   the rules and pass them to `autocut::run`. Tests: saved rules reach Claude's system prompt through `run`
   with a fake `claude`.
3. **Rules UI** — one place to write the rules (UX expert first). Invokes `get_rules` / `save_rules`.
   Tests in `test/ui.test.mjs`.
4. **Live check** — with this Mac's Claude: a rule that overrides a built-in one (e.g. "keep false starts")
   changes Magic Cut's cuts on `models/retakes.wav`. Live test, ignored by default like the other live tests.

## Status (2026-11-20)
- Phase 1 ✅ `rules.rs` + `AppError::Rules`; 5 tests.
- Phase 2 ✅ `get_rules` / `save_rules` registered; `auto_cut` and `--auto-cut` read the saved rules each run;
  `autocut::run` takes them. Test: a fake `claude` that only answers when the rule is in its system prompt.
- `npm test`: 24 UI + 79 Rust passed, 0 failed.
- Phase 3 ✅ (Jony) Gear in the toolbar (⌘,) opens "Your rules": one text box, one rule per line, saved as you
  type and on close; pressing Magic Cut closes the panel and saves before the run. Spec `design/rules.md`,
  code `src/ui/rules.js`. Tests: store (load once, debounced save, cleaning like Rust, failed save retries),
  panel (open/Esc/⌘,/click outside, unreadable file stays read-only), commands match `generate_handler!`.
  `npm test`: 31 UI + 79 Rust passed. App rebuilt and opened; nobody has clicked through the panel in the window yet.
- Phase 4: next. The UI calls `invoke("get_rules")` → `string[]` and `invoke("save_rules", { rules })` → the
  cleaned `string[]`; errors arrive as one plain sentence.

## Decisions
- Plain JSON array of strings: the rules are a list of sentences, nothing more yet.
- Saving cleans the list (trim, no empties, no duplicates) and returns it, so the UI shows what was stored.
- A broken rules file stops Magic Cut with a plain message instead of quietly running without the user's rules.
- Rules are read on every run (a tiny file), so a save applies to the next Magic Cut at once.
