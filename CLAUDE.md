# Magic Cut

(The repo, the studio project and the code modules are still called SuperCut; the app users see is Magic Cut.)

A Mac app that turns a raw recording into a clean, cut video. It transcribes locally, uses AI to pick the best takes, swaps in better audio, and lets you review every cut before exporting. It looks like CapCut or OpenCut.

This file is compiled from the global modules in `~/.ai-control/modules/`
(STRUCTURE, CODING, UX, WORKFLOW). Rebuild it with the `rebuild-claude-md` routine when the modules change.
Keep project-specific rules in the last section.

---

## Structure

### AI Control standard
Every project carries the standard scaffold:
- `.project` — the project marker, listing the `modules:` it uses, its `secrets:`, and `claude_md_generated`.
- `CLAUDE.md` — compiled from the global modules for this project.
- `.gitignore` — always covers `.env`.
- `.env` — this project's secrets (never committed).
- `updates/` — one folder per update (see below).
- `issues.txt` — running list of known issues and TODOs.

### The updates/ folder
Each update is a folder named:

```
updates/YYYY-MM-DD UPDATE_NAME - OPEN/      # while in progress
updates/YYYY-MM-DD UPDATE_NAME - CLOSED/     # when done
```

Inside each update folder:
- **`update vX.md`** — the version-X plan (`X` starts at 1). Contains the goal, the phased roadmap to reach it, and live status tracking: what's done, what decisions were made, what's next. Bump to `v2`, `v3`… when the plan is substantially reworked.
- **`wiki.md`** — the decisions and lessons this update taught us: principles, what works and what doesn't. This is durable knowledge, not status.
- **Optional extra files** — logs for anything else related to the update, and any research-spike code that ran in isolation (see WORKFLOW.md). An update can be reopened (flip `CLOSED` → `OPEN`) to finish or fix something.

### Per-ecosystem conventions
- **Follow each ecosystem's own norms** — `src/`, `tests/`, the standard layout for whatever stack the project uses. Don't impose a foreign structure on it.
- Keep small projects **flat and simple**; add folders only when the project genuinely grows into them. Avoid premature nesting.
- **Rust/Tauri:** build output goes to the **shared Cargo target** (`~/.cargo-shared-target`, set globally in `~/.cargo/config.toml`), not a per-project `target/`. A missing local `target/` is expected; the first build after a clean is a full rebuild. Never add a per-project `target-dir`/`CARGO_TARGET_DIR` override. Full details: `wiki/shared-cargo-target.md`.

### Modular by default
- Structure code so any piece can be understood and fixed **in isolation**, with its own bounded context. Clear module boundaries, minimal cross-coupling. See CODING.md for how this shapes the code itself and UX.md for how it shapes the UI.

---

## Coding

### Modularize for isolated context
- Write code so any part can be picked up, understood, and fixed **on its own**, without loading the whole system into your head. That's the point of modularity here: an isolated context to work in and an isolated thing to change.
- Draw clear module boundaries with small, explicit interfaces. Keep cross-module coupling low so a change stays contained and a bug has one obvious home.

### Keep it minimal
- Build **only what's truly needed**. Don't add abstraction, configuration, or layers on speculation — add them when a real need shows up.
- Prefer reuse over duplication: shared helpers and components over copy-paste, but don't over-generalize before there's a second real caller.

### Test what matters
- Cover core logic, risky paths, and anything that would silently regress. Skip tests for trivial glue.
- Phases in a roadmap mostly end with tests that lock in what they built (see WORKFLOW.md) — this is how we keep moving without breaking earlier work.

### Idiomatic to the ecosystem
- Match the conventions, naming, and idioms of whatever stack and surrounding code the project uses. Read the neighbors before writing; new code should look like it belongs.
- Follow each ecosystem's standard tooling for formatting, linting, and layout rather than inventing house style.

---

## UX

### Always bring in UX experts
- For anything with a user-facing surface, **always launch a dedicated UX expert agent** to think the experience through before and during the build.
- For a surface with multiple parts, **launch several UX experts in parallel**, each owning a part, so the whole experience is deeply considered rather than improvised. Act as the orchestrator (see WORKFLOW.md) and synthesize their thinking.

### Cut everything unnecessary
- Approach every UI as Steve Jobs would: **relentlessly remove anything that isn't truly needed.** The default answer to a new element, option, or screen is "does this earn its place?" — if not, it's gone.
- Minimal by conviction: the fewest screens, controls, and steps that do the job well.

### Minimal visual system
- Keep the **number of fonts to a minimum** — ideally one or two, used consistently. Same discipline for colors, spacing, and sizes: a small, deliberate scale, not ad-hoc values.
- Aim for a polished, modern result. When the stack supports it, lean on solid component foundations (e.g. Tailwind / shadcn-style primitives) rather than hand-rolling one-off styles.

### Standardized, reusable, isolated components
- Build the UI from **reusable, standardized components** — define a thing once and reuse it everywhere, so the interface stays consistent and cheap to change.
- Keep components **highly isolated**: each stands on its own with a clear interface, so it can be understood, restyled, or fixed without touching the rest. This mirrors the modularity rule in CODING.md and STRUCTURE.md.

### Fundamentals
- Responsive across the sizes the project targets, and accessible by default — real contrast, keyboard reachability, sensible focus, meaningful labels.
- Sensible defaults, fast feedback, and clear, honest error states over decoration.

---

## Workflow

### Commit and backup
- **Always commit AND push after every change.** No change is ever left uncommitted or unpushed. Each working change is its own commit — small, focused, one logical unit per commit — and is pushed to the remote immediately. Don't batch unrelated edits.
- **Everything lives on GitHub.** Every project has a GitHub remote and every commit is pushed right away; nothing important stays local-only. If a project isn't backed up yet, fix that first.
- Write plain, honest commit messages that say what changed and why. Never commit secrets — `.env` stays in `.gitignore`.

### Roadmaps and phases
- Any non-trivial update or coding task starts with a **roadmap broken into phases**. Design the phases before writing code and record them in the update's `update vX.md` (see STRUCTURE.md for the updates layout).
- **Most phases end with tests** that lock in what that phase built, so we don't break earlier work as we go. Test what matters — core logic, risky paths, anything that would silently regress — not trivial glue.
- Track status as you go: what's done, what decisions were made, what's next. Keep `update vX.md` current.

### Research spikes
- When a phase involves a new API, an unfamiliar library, or a genuinely new design, make it a **research phase**: a throwaway spike that runs *outside the main code*, inside the update folder, in an isolated environment.
- Use the spike to find out what actually works before committing the main codebase to an approach. Capture the findings — principles, what worked, what didn't — in the update's `wiki.md`.

### Act as an orchestrator
- Prefer to **delegate to your own agents** rather than doing everything inline. Act as the orchestrator: decompose the work, fan out to focused agents, and synthesize.
- For anything with a UX dimension, **always launch a UX expert agent** — and launch several in parallel for different parts of the surface so the experience is thoroughly thought through. See UX.md.

### Verify before moving on
- Verify changes by running the actual thing, not just by trusting a green test. Confirm the phase does what it set out to do before you commit and move to the next.

---

## Project-specific rules

- **Name:** users see **Magic Cut** (`productName` in `src-tauri/tauri.conf.json`; scripts read it from there). Internal names stay `supercut`: the Cargo crate and binary, the npm package, and the bundle id `xyz.supercut.editor`. Keep that id: the speech model folder and the app's saved settings live under it.
- **Install:** `npm ci && npm run install-app` builds a release, replaces `/Applications/Magic Cut.app` (and any old `SuperCut.app`), indexes it for Spotlight and opens it (`-- --no-build` installs the last build). `npm run build`/`npm run app` alone leave the app in the hidden shared Cargo target, which Spotlight never lists.
