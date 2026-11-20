# The AI spot — how the Claude Code connection plugs into the screen

Author: Jony · 2026-11-20 · For: Uncle Bob (Claude Code connection)
Screen spec: `design/main-screen.md` (state 8, banner table in state 9).

## User goal
"Press one button and get the junk cut, without it cutting something I need." The user sees **one button**, an honest
line about what's happening, and the result **in the transcript**, where they can read what was cut.

## Where AI shows up (nothing else)
| What | Where | Built in |
|---|---|---|
| Start / cancel | **✦ Magic**, the one filled button, far right of the toolbar. Queued or running, it becomes a pill with ✕ | `src/ui/magic-button.js` |
| What it's doing | The status line ("Choosing the best takes…"); the pill only says "Magic ✕". Queued: the status line adds "· Magic starts when the transcript is ready" | `src/ui/magic.js`, `src/ui/status.js` |
| First run ever | Status line, 8 s, once: "Only the text of your transcript is sent to Claude. Your video stays here." | `src/ui/magic.js` |
| Result | Cut words stay in the transcript, **struck through** (accent line), same as yours; hover says why ("Magic: earlier take · Backspace brings it back"). Summary in the status line for 6 s | `src/ui/transcript.js`, `src/ui/cuts.js` (`withMagic`) |
| Problems | The banner: one sentence + **Try again**. Signed out → "Sign in to Claude…" + **Copy command** | `src/ui/magic.js` |

Removed on purpose: an AI results panel, a chat box, a log view, a progress dialog, a "Magic done" modal.
The transcript already shows the result better than any panel could.

## The contract (UI side: one file, `src/ai.js`)
While `runner` is `null`, Magic still shows (the user couldn't find it when it was hidden), but pressing it only opens the banner
"Magic isn't connected yet. Soon it will pick your best takes; for now, cut words in the transcript." No Claude sign-in banner is shown. To connect, export:

```js
export const runner = {
  // parts: only those with a transcript, in play order.
  // onStage(text): call with short plain stages, no "…" (the UI adds it): "Choosing the best takes".
  run: async ({ parts /* [{ id, name, words: [{ w, s, e }] }] */, onStage }) => {
    // …invoke Rust, listen to its stage events, call onStage(...)
    return {
      summary: '38 cuts · 24:10 → 14:52', // one line, shown 6 s
      cuts: [{ part: 1, s: 12.4, e: 15.9 }], // part = the part's id; seconds in that part's own time
    };
  },
  cancel: () => {/* stop the claude process; the late result is ignored anyway */},
};
```

**Connected (2026-11-20):** `src/ai.js` exports the runner. It calls the Rust command `auto_cut`
(`src-tauri/src/autocut/`); each cut also carries `from`/`to` (word indices in its part) and a short `reason`.
Magic sends each part's `seconds` too, for the summary.

Rules the UI already enforces (tested in `test/ui.test.mjs`):
- **Throw a plain sentence** (`throw new Error('Claude is busy. Try again in a minute.')`). It goes straight into the banner
  with Try again. Nothing in the project changes on failure: cuts are only taken after `run` resolves.
- Pressing Magic re-checks `claude_status` first. Not `ready` → sign-in banner, `run` is never called.
- Pressed while transcribing → queued; it starts by itself when the last transcript lands.
- Cancel while running → `cancel()` is called and any late result is dropped.
- Times stay in the app: build `cuts` from sentence/word ids Claude picks, never from times Claude writes.

## States (button · status line)
| State | Button | Status line |
|---|---|---|
| No video | hidden | — |
| No runner yet | **✦ Magic** (filled); press → "not connected yet" banner | — |
| Ready | **✦ Magic** (filled) | transcription text or empty |
| Queued | pill "Magic queued ✕" | "Transcribing… 12 % · about 2 min · Magic starts when the transcript is ready" |
| Running | pill "Magic ✕" | privacy note the first time ever (8 s), then "Choosing the best takes…" |
| Done | **✦ Magic** (run again) | "38 cuts · 24:10 → 14:52 · ⌘Z to undo" for 6 s |
| Failed | **✦ Magic** | banner: the error + Try again |

Keyboard: ⌘↩ presses Magic (and cancels when it's a pill).

## Not yet (later phases)
AI cuts on the timeline (accent hatch), Review mode. A Magic run joins your own cuts as one ⌘Z step
(a second run replaces only the first run's cuts).
