# Your rules — the settings panel

Author: Jony · 2026-11-20 · Status: **built** (`src/ui/rules.js`). Feature: Custom AI editing rules.
**2026-11-26:** the panel is now Settings, in sections; rules stay the first one. See `design/settings.md`.
Checked against `design/user-model.md` (goal 6: "Teach the AI my taste", mostly after a first disappointing run).
Storage and Magic Cut's use of the rules: Uncle Bob's `get_rules` / `save_rules` commands (`src-tauri/src/rules.rs`) (contract below).

## User goal
"Magic Cut cut my joke. Tell it, once, to keep my jokes — and have it remember."
They come here with one sentence in mind. The fastest path: open, type the sentence, leave.

## What I removed, and why
| Removed | Why |
|---|---|
| A Settings window with tabs | There is one setting. A window for it is ceremony. |
| A list with Add / Edit / Delete buttons per row | One text box, **one rule per line**, does all four with zero buttons: type to add, click to edit, delete the line to delete. Everyone already knows how. |
| Save / Cancel / Done buttons | Saved as you type (and on close). Closing is Esc, a click outside, or the gear again. |
| On/off toggles per rule, rule ids, ordering handles | No user goal needs them. Delete the line instead. |
| An examples gallery / templates | Two examples as the placeholder are enough to show the shape; they vanish when you type. |
| A count badge on the gear | Decoration. The gear is always there; the rules are one click away. |
| A "saved" tick | Autosave is the norm on a Mac. Only a failure gets said (banner). |

## Flow
1. Click the **gear** in the toolbar (or ⌘,). The panel drops in under it, the cursor already in the text box.
2. Type a rule. Enter starts the next one.
3. Click anywhere else, press Esc, or press Magic Cut. The rules are saved; the next Magic Cut run follows them.

Total: 1 click + typing. Pressing Magic Cut with the panel open closes it and saves *before* the run starts, so a rule typed a second ago is already used.

## Layout
```
toolbar  …………………………………………… Choosing the best takes…   (⚙)  [ ✦ Magic Cut ]
                                                   ┌──────────────────────────────┐
                                                   │ Your rules                   │  13 semibold
                                                   │ Magic Cut follows these the  │  13 secondary
                                                   │ next time it runs. One rule  │
                                                   │ per line, in plain words.    │
                                                   │ ┌──────────────────────────┐ │
                                                   │ │ Keep my jokes            │ │  15 / 1.5 (placeholder
                                                   │ │ Cut every um and uh      │ │   in secondary when empty)
                                                   │ │                          │ │
                                                   │ └──────────────────────────┘ │
                                                   └──────────────────────────────┘
```
- **Gear:** 32 × 32 hit area, 15 pt glyph, `text-secondary`, `text` on hover, `accent` while open. Sits left of Magic Cut, right of the status line. Visible in every state, also the empty screen: you may write rules before the first video.
- **Panel:** 360 pt wide, top 56 (4 below the toolbar), right edge aligned with the toolbar's 16 pt padding. `surface`, 1 pt `hairline` border, radius 10, padding 16, gap 12. Floats over the player; doesn't move anything.
- **Text box:** 8 lines tall (~180 pt), `bg`, hairline border, radius 6, padding 12, 15 / 1.5 (the reading size, like the transcript). No resize handle. Accent focus ring.

## States
| State | What shows |
|---|---|
| Closed | Gear only. |
| Opening (first time, loading) | Panel with the box read-only for the instant the file takes; then filled. |
| No rules | Empty box with the placeholder "Keep my jokes / Cut every um and uh". |
| Rules | One per line, exactly as Magic Cut will use them (blank lines and edge spaces are dropped on save). |
| Load failed | Banner with the error (e.g. "Your rules file can't be read."); the box stays read-only so nothing overwrites the file. |
| Save failed | Banner with the error. What they typed stays in the box and is saved again on the next change or close. |

## Keyboard & accessibility
- ⌘, opens / closes (the Mac's Settings shortcut). Esc closes and returns focus to the gear.
- Gear: `aria-label="Your rules"`, `aria-expanded`, `aria-controls`; tooltip "Your editing rules (⌘,)".
- Panel: `role="dialog"`, `aria-labelledby` its title; box `aria-describedby` the hint.
- Contrast: text 15:1, hint 7:1 on `surface`. Typing in the box never triggers editor keys (Space, ⌫, arrows).

## Contract (Uncle Bob, Rust)
- `invoke('get_rules')` → `string[]` (`[]` when none saved).
- `invoke('save_rules', { rules: string[] })` → the cleaned `string[]` actually stored (trimmed, no blanks, no repeats). Whole-list replace.
- Errors: one plain sentence, shown as is.
- Stored at `~/Library/Application Support/xyz.supercut.editor/rules.json`. `autocut::run` reads it itself; `auto_cut` is unchanged.

## Built in
`src/ui/rules.js` — `parseRules` / `rulesText` (pure), `createRulesStore` (load once, debounced save, flush; tested with a fake `invoke`), `mountRules` (the DOM: gear, panel, Esc, click outside, ⌘,). Markup in `src/index.html`; wiring in `src/main.js`.

## Assumptions
- R1: People think of rules as short sentences, one per line, not paragraphs. Check: read the first 10 rules files from testers.
- R2: Nobody misses an explicit Save button. Check: watch 3 users add a rule; note any who hunt for one.
