# Settings — the gear panel, in sections

Author: Jony · 2026-11-26 · Status: **built** (2026-11-26). Feature: Token usage, one-click debug report, easy Claude setup.
Checked against `design/user-model.md` ("Ignore: settings"; goal 6 rules; the new "Checking and getting help" job).
Parts: `design/rules.md` (built), `design/usage.md`, `design/debug-report.md`. Claude setup is **not** here:
it lives where the need appears, on Magic (`design/claude-setup.md`).

## User goal
Open the gear for one thing (a rule, a number, a report), do it, leave. Rules stay the reason most people come.

## What I removed, and why
| Removed | Why |
|---|---|
| A Settings window or tabs, now | Three short sections fit in the panel. The planned tab (feature "Better settings, in its own tab") takes the same sections unchanged. |
| A "Claude account" section | Nobody opens Settings to set up Claude; they press Magic. The fix sits there. |
| Section icons, a sidebar, a footer with the version | Decoration. The version goes in the debug report, where it is needed. |

## Layout
The rules panel (`design/rules.md`) grows down. Same 360 pt width, `surface`, radius 10, padding 16. Sections are
separated by a 1 pt `hairline` with 16 pt above and below. Order = how often people come for it.

```
┌──────────────────────────────┐
│ Your rules                   │  bodyStrong
│ Magic Cut follows these…     │  body, textSecondary
│ ┌──────────────────────────┐ │
│ │ Keep my jokes            │ │  (unchanged, 8 lines)
│ └──────────────────────────┘ │
│ ──────────────────────────── │
│ Usage            1.2 M tokens│  design/usage.md
│ talk-final          412 k    │
│ podcast-ep3         860 k    │
│ ──────────────────────────── │
│ Help                         │  design/debug-report.md
│ Sends the app's log …        │
│ [ Send debug report ]        │
└──────────────────────────────┘
```
- Max height: window height − 72. If taller, the panel scrolls as one; the rules box never shrinks.
- The cursor still lands in the rules box on open. Tab order: rules box → usage list (only if it scrolls) → Send.

## The section component
One reusable piece: `section({ title, aside, hint, body })` in `src/ui/settings-section.js`.
- `title` bodyStrong, `aside` (optional, right-aligned, body `textSecondary`, tabular numbers), `hint` (optional, body
  `textSecondary`), `body` (any node). Gap 8 inside, 16 + hairline + 16 between sections.
- Each section is its own module that returns one `section(...)`: `rules.js` (wrap the existing title/hint/box),
  `usage.js`, `debug-report.js`. The panel only stacks them. **Moving to the Settings tab later = mount the same three
  modules in the tab.** Nothing else changes.

## Naming
- Gear tooltip: "Settings (⌘,)". `aria-label="Settings"`; the panel's dialog is labelled "Settings".
- ⌘,, Esc, click outside: unchanged from `design/rules.md`.

## States
Each section owns its states (see its file). The panel itself has one more: while open, Usage and the Send button
load lazily: the rules show at once, the usage list fills in a moment later (no skeleton; it's two lines of text).
