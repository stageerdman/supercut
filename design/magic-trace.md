# Magic Trace: what every Magic cut leaves behind

Author: Elon Engineer (research) · 2026-11-23 · For: whoever builds Magic Trace, Cut review mode (`f-cut-review-mode`)
and the learning logs. Feature: `f-magic-trace`.

## The goal, cut down
A trace has to answer three questions. Anything that doesn't help answer one of them stays out.
1. **Review:** which cuts did Magic make, why, and has the user looked at each one yet?
2. **Learning:** what did Claude see, what did it decide, and what did the user end up wanting instead?
3. **Trust (light, for the user):** "why is this gone, and what did it keep?"

## The main decision: record the proposal once, work out the rest
Don't log what the user does. Store **what Magic proposed**, once, and never change it. "What the user did with it"
is a pure function of that proposal and the current `edit.cuts`:

```
outcome(proposal, edit) → kept | touched | adjusted(ds, de) | restored | replaced
missed(run, edit)        → your cuts in speech Magic kept (cuts it should have made)
```

Why:
- There are no hooks in ⌫, edge drags, undo, redo or part removal, and no event log that can drift out of step with
  the edit. Any way the user reaches a state (undo, a merge, a split, a re-cut) gives the same answer.
- `normalize` merges and splits cuts, so an id on each cut wouldn't survive. Comparing by time (overlap in the same part)
  does survive.
- The edit and its history stay as they are. The trace is **not** in the undo history: if ⌘Z undoes the whole
  "Magic Cut" step, the trace still knows Magic proposed those cuts, and every one comes out `restored`. That is the
  strongest "no" there is.

### Outcome rules (per proposed cut P, in P's part; FRAME = 1/30 s)
| Outcome | Test |
|---|---|
| `kept` | A `by: 'magic'` cut covers P with both edges within a frame |
| `touched` | A `by: 'you'` cut covers P with both edges within a frame (the user dragged it but ended where it was) |
| `adjusted` | Some cut overlaps P but an edge moved by a frame or more. Record `ds`, `de` in seconds (+ = later), plus `wordsAdded` / `wordsBack` (words newly cut or brought back) |
| `restored` | Less than a frame of P is cut |
| `replaced` | A later Magic run happened. The outcome was frozen at that moment (see "Runs") |
| `agreed` | You had already cut P before the run (`withMagic` subtracted it). Keep the run's `before` cuts (yours at run time) to tell this apart from `touched` |

`missed`: `by: 'you'` cuts made after the run that overlap no proposal. These are the false negatives, and they are
half of what learning needs.

### Runs
Each Magic run adds one **run record**. The trace is an append-only list of them. When a new run lands, the previous
run's outcomes are computed and **frozen** into it, because `withMagic` is about to drop its cuts. Only the latest run
is live.

## What a run record holds
Rust builds it inside `autocut::propose`, where all of it is already in hand, and `auto_cut` returns it next to
`cuts` and `notes`.

```js
run = {
  id: 'r1',                   // per project, never reused
  at: '2026-11-23T10:04:00Z',
  app: '<build id>',          // scripts/build-id.js, so a log can be tied to the code that made it
  model: 'claude-sonnet-…',   // the real id from the stream's system/init line, not the "sonnet" alias
  rules: '<hash of RULES>',   // the built-in prompt's version
  custom: ['Keep every joke.'],     // the user's rules, as sent
  lines: [{ id, part, from, to, text }],   // exactly what Claude read (words can be fixed later)
  groups: [[2, 3]],           // what similar::groups hinted
  answer: { keep, drop, check },   // Claude's raw answer, before the last-take rule
  proposals: [{ line, part, from, to, s, e, reason, source: 'claude' | 'rule', instead?: lineId }],
  checks: [{ line, why }],    // Magic's notes (already shown as notes)
  before: [{ part, s, e }],   // your cuts at run time (added by the app, not Rust): tells `agreed` from `touched`, and `missed` from cuts you'd made earlier
  verdicts: { [proposal index]: { says: 'yes' | 'no', how?: 'restored', at, after, heard, note? } },   // Cut review mode, see "Verdicts"
  frozen?: { [line]: outcome },                        // set when a newer run replaces this one
}
```

- **`source`**: `'rule'` when `decide::keep_last_takes` overrode Claude's pick. This tells "Claude was wrong" apart
  from "our rule was wrong".
- **`instead`**: the line kept in place of a dropped take (the last take of its group). It comes free from `groups`.
  For drops that aren't in a group (a fumble or a false start), leave it out. Don't add it to Claude's schema yet.
- **`lines` + `groups` + `rules` + `custom` + `model`** rebuild the exact prompt (`prompt::transcript`,
  `prompt::system`). So every logged run is a **replayable test case**: run a new prompt or model over past runs and
  score it against what users really kept. That is the loop that improves AI cutting.
- Size: about 30 KB of line text for a 30-minute recording, plus about 100 bytes per proposal. Small enough to keep
  every run.

### Left out on purpose
- **Confidence.** `claude -p` doesn't give log-probabilities. A self-reported "confidence: 0.8" costs tokens and isn't
  calibrated, so it would mislead review and learning. The honest uncertainty signals already exist: a `check` note
  on or next to the line, `source: 'rule'`, and group membership. Add a real confidence only if review shows it needs
  ordering and these signals aren't enough.
- **The full prompt text per cut.** It is stored per run and can be rebuilt from the fields above.
- **An event log of user actions.** It is replaced by `outcome()`.
- **A link id on each cut in `edit.cuts`.** Matching by time is enough, and an id would break on merges and splits.

## Where it lives
- **With the project, beside `edit`, outside the history:** `project.magic = { runs: [run…] }` in the JS app state.
  Today nothing is saved to disk (edits last until the window closes; see `updates/2026-11-22 MANUAL EDITING`), so the
  trace lasts exactly as long as the cuts it describes. When project saving lands, `magic` is saved in the same file
  as `edit`. That's one more key, with no separate store.
- Part removal and undo: `withoutPart` / `rename` must also rename part ids inside `magic.runs` (lines and proposals),
  the same way they do for cuts and notes.
- **Learning logs are not project data.** They are written to
  `~/Library/Application Support/xyz.supercut.editor/learning/<run id>/`. Each one is a `case.json` (lines around the
  cut, the proposal, the outcome, the user's final cuts there, the verdict) plus the ~6 s clip `f-cut-review-mode`
  asks for, cut with the bundled ffmpeg. They are written **only for disagreements**: `restored`, `adjusted`,
  `missed`, and review "No". Agreement is cheap to rebuild from the run record and isn't worth video on disk. A case
  is deleted once it is processed, as the feature says.
- **When to write a case:** at export, because what ships is the user's real answer. Also when the user fixes the
  last open review "No" note. Before that, the outcome can still change.
- **Privacy:** the promise is "only the text of your transcript is sent to Claude. Your video stays here." Learning
  cases stay on this Mac. Anything that sends them anywhere needs its own one-time, explicit yes. Nothing does that
  today.

## Verdicts: what Cut review adds (Jony, 2026-11-23)
Review is the one place where the user *says* what they think of a cut, so it is the one thing the trace records
instead of working out. Everything after the verdict, including the fix, is still worked out by `outcome()`.
Screen spec: `design/cut-review.md`.

### What a verdict holds
Written into the **live run** (`run.verdicts`), keyed by proposal index (the same index as `run.proposals` and
`outcomes`). Outside the undo history, like the rest of the trace; a verdict's ⌘Z in review removes it by hand.
```js
verdicts[3] = {
  says: 'no',             // 'yes' | 'no'
  how: 'restored',        // only when the "no" was ⌫ (put back now); left out for "fix later"
  at: '2026-11-23T21:04:10Z',
  after: 1.8,             // seconds into the window when the key came (answers Q-R1: is 6 s right?)
  heard: [{ part, s, e }],// the source spans the window played, as cut at that moment: what the user judged
  note: 'n12',            // the red "fix later" note's id (N only)
}
```
- A stop of several cuts writes the same verdict for each proposal in it. `outcome()` later shows which one changed.
- Changing a verdict overwrites it. A verdict on your own cuts (no Magic run) is not recorded: it teaches Magic
  nothing.
- `heard` is a few numbers, not video. It is exactly what the clip will be cut from.

### "No, then fixed": how it's read
Nothing is logged when the user fixes the cut. The answer comes from three facts already in hand: the verdict, the
outcome, and the note.

| Verdict | Outcome when judged | Note | What it teaches |
|---|---|---|---|
| no | `adjusted(ds, de)` | done or open | **The edge was wrong, by this much.** The main signal for where cuts should start and end |
| no | `restored` | any (or `how: 'restored'`) | **It shouldn't have been cut at all** |
| no | `kept` / `touched` | done | Flagged, then left as it was: a weak "no" (the user changed their mind) |
| no | `kept` / `touched` | open | Flagged, not fixed yet: logged as `fixed: false`, rewritten when it changes |
| yes | `kept` | — | **Heard and approved**: a strong "yes", stronger than an unreviewed `kept` |
| yes | `adjusted` / `restored` | — | Approved, then changed anyway (a too-fast Yes, or a fix found later) |
| none | any | — | As before review existed |

"Fixed" means the red note is done (`doneAt`) **or** the outcome is no longer `kept`/`touched`: people fix a cut and
forget to tick its note (Notes Q9), so the tick alone isn't trusted.

### Into the learning log
- `learningLog` adds `verdicts` beside `outcomes` (yes verdicts stay there; they are labels, not cases).
- A **case** is written for every proposal that is `restored` or `adjusted` (as today) **or has a "no" verdict**. A
  case with a verdict also holds `verdict` (`says`, `how`, `after`), `fixed: true | false` and `doneAt`.
- **The clip:** for each case with a verdict, the ~6 s window the user heard, rendered from `heard` with the bundled
  ffmpeg (480p H.264 + AAC, about 1 MB), saved beside the log as `learning/<run id>-<proposal index>.mp4`. Only
  for "no" verdicts: that is where the sound mattered and the text alone may not explain it. A rewrite overwrites.
- **When:** as today (a newer run freezes this one; the window closes), and also each time a red review note is marked
  done, because that is the moment a "no" becomes an answer. Writing again is harmless.
- Privacy is unchanged: logs and clips stay on this Mac.

## What the user sees (lightly)
Showing the trace earns its place in one way only: it answers "why is this gone?" where the user is already looking.
- **Hover and review line for a dropped take:** "Magic: earlier take · kept “This is my brand new video.”". It names
  the take that stayed, which is the thing the user wants to compare. Use `instead`, the line's text, ≤ 70 characters.
  Cut review mode shows the same line under the player for each cut.
- **Review order:** time order (decided in `design/cut-review.md`: jumping around the story costs more than it saves).
  A check note on the stretch is shown in the review line instead.
- **Not shown:** model, prompt, rules hash, stats, confidence, and a log viewer. `design/ai-slot.md` removed the log view
  on purpose, and the transcript already shows the result.

### Shipped (Jony, 2026-11-23)
The hover is the whole visible trace, and nothing new was added for it. `keptReason` (`src/ui/magic.js`) adds
"· kept “…”" to a dropped take's reason, so it appears wherever the user already meets a cut:
- the timeline block's hover (`cutHover`): "Magic Cut: Earlier take · kept “so today we…”"
- the transcript hover over cut words (`src/ui/transcript.js`)
- the VoiceOver label for a focused or selected cut (`cutLabel`), so keyboard and screen-reader users get the same answer

Deliberately not built: a badge, an info button, a panel or a log view. They answer no question the hover doesn't
already answer, and they would add noise to every Magic cut. The review line under the player waits for Cut review
mode (`f-cut-review-mode`), which will reuse the same `reason` string.

## Build order (suggested)
1. Rust: `propose` returns the run record (model from the stream's init line, `source`, `instead`). Tests next to
   `decide.rs`.
2. JS `src/ui/trace.js`, pure: `withRun`, `outcome`, `outcomes`, `missed`, `freeze`. Tests on merges, splits, undo of
   the whole step, re-runs, and a cut you'd made before Magic. Keep it in app state outside history.
3. The hover line with `instead`.
4. Cut review mode reads `outcomes` and writes `verdicts` (see "Verdicts" above and
   `updates/2026-11-23 CUT REVIEW MODE - OPEN/update v1.md`).
5. Learning cases at export (disagreements only, plus the clip).
6. Project saving (its own feature) saves `magic` next to `edit`.
