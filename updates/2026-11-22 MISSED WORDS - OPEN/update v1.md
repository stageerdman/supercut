# Missed words — v1

Goal (from Pixel): detect pauses from the audio, not transcript gaps, and let the user fix words the transcript
missed. This update is the second half: **see, cut and write the speech the transcript missed, and edit words**.
The first half (speech runs, silence-split transcription, pauses from audio) is
`updates/2026-11-22 AUDIO PAUSES - OPEN/update v1.md`, Phases 1–3. Its Phase 4 moves here.

Lead: Jony. Builders: Uncle Bob (Rust, pure model), Jony (views).

## The design (read before building)
- `design/missed-words.md`: the whole spec (unheard speech, the write rule, where you type, listening again,
  right-click, look, states, accessibility).
- Research: `updates/2026-11-22 MANUAL EDITING - OPEN/research-missed-words.md` (Columbo).
- Changes: `design/edit-model.md` (fixWords → writeWords), `design/transcript-editing.md` (typing from the timeline,
  pills), `design/timeline-strip.md` (unheard blocks).

## Depends on
AUDIO PAUSES Phases 1–3: `Transcript.speech: [{ s, e }]` reaches the UI with the words. Phases 1 and 3 here can start
before it lands: they're pure and take `speech` as input (tests pass runs in by hand).

## Shape
| File | What | Owner |
|---|---|---|
| `src/ui/unheard.js` (new) | `unheard(speech, words)`, `MIN_UNHEARD` 0.3 s, `tokens(words, unheard)` | Uncle Bob |
| `src/ui/fix.js` | `writeWords(words, sel, text, unheard)`, `removeText`, `fixWords` as helper | Uncle Bob |
| `src/ui/selection.js` | `unheard: true` selections, ⌫ through the word rule | Uncle Bob |
| `src/ui/pauses.js` | called with speech ∪ written words (function unchanged) | Uncle Bob |
| `src-tauri/src/transcribe.rs` + command `recognize` | re-hear one stretch | Uncle Bob |
| `src/ui/transcript.js`, `fix-field.js` | pills, field over a pill / between words, listening | Jony |
| `src/ui/strip-view.js`, `timeline.js` | unheard blocks, typing on a timeline selection | Jony |
| `src/ui/context-menu.js` (new) | `menuFor` (pure), native `popup` | Jony |

## Roadmap
Each phase ends with tests that lock it in. "Check in the window" = someone runs `npm run dev` and does it by hand;
agents can't see the screen, so say so in Status when that hasn't happened.

### Phase 1 — Unheard speech, the model (pure JS)
`unheard.js`; selection `{ part, s, e, unheard: true }`; ⌫ cuts it with the word rule (pause midpoints, neighbours =
nearest word or speech edge), label "Cut 0.6 s unheard"; pauses from speech runs ∪ `fixed` words.
Tests (`test/unheard.test.mjs`): a run fully covered by words → nothing; a run with a 0.5 s hole between words → one
piece; pieces under 0.3 s dropped; no `speech` → `[]`; memo returns the same array for the same words; ⌫ on unheard
cuts to the silence midpoints, ⌫ again leaves no cuts; a word written into silence removes the pause over it;
`tokens` merges in time order.

### Phase 2 — Unheard speech in both views (Jony)
Panel pill and strip block (look, hover, selected, lit, cut), click / Tab / ← → selection, ⌫, word labels treat the
block as an obstacle, "No speech found." becomes pills when there's speech, accessible names.
Tests (fake DOM, like `test/transcript.test.mjs`): pills render in word order with their labels; the lit state moves
onto a pill while the playhead is inside it; clicking a pill selects its range on the timeline and the other way
round; ⌫ on a strip block and on a pill give the same cut; Tab order is time order across pauses, unheard and cuts;
`layoutLabels` stops a label at an unheard block.
Check in the window: on the real take, play over three unheard bits (the lit pill), ⌫ one, listen to the join.

### Phase 3 — Where written words go (pure JS)
`writeWords` exactly as specified (replaced = highlighted; insert into the free room, narrowed to unheard speech; no
room → overlapped words; unchanged words keep their time; removed middle words leave their time free), `removeText`,
labels "Fixed …" / "Added …" / "Removed text …".
Tests (`test/write.test.mjs`): every row of the examples table in the spec; **invariant over random cases**
(seeded): words sorted, none overlap, every word outside the replaced ones keeps its text and times; empty text = no
change; a written word in a cut stays cut; cuts never change; `fixWords`' old tests still pass through it.

### Phase 4 — Typing from anywhere (Jony)
The field over a pill; an empty field between the neighbouring words for a pause or a timeline range; typing with
focus on the timeline goes into it; the overlapped-words fallback highlights before the field opens; one history step
per commit; Magic landing while the field is open applies the write to the new state.
Tests: the key map with a pill / a pause / a range selected (letter → field holding it, `M` → note, Return → field);
commit → one step with the right label and words, ⌘Z → back with the pill; the field between words sits at the right
index; written words reach Magic's input (`ai.js`).
Check in the window: add "not" three ways (pill, retype "working", timeline drag) and ⌫ each: only "not" is cut.

### Phase 5 — Hearing a stretch again (Rust + Jony)
`recognize { id, s, e }` → `{ text }` on the already-loaded Parakeet, 0.3 s padding, register it; the field's
`listen` mode (placeholder, fill + select on arrival, dropped on first keystroke, empty on nothing / error).
Tests: Rust live test (skips without the model) — a cut-out stretch of `models/en.wav` gives its words back; silence
gives `""`; out of range → plain error. UI: the command is registered; a fake slow `invoke` + a keystroke → typed text
kept, result ignored; a failing `invoke` → empty field, no banner.
Check in the window: double-click five unheard bits on the real take; note how many come back right (fill in Q7).

### Phase 6 — Right-click (Jony)
`menuFor(target, cuts)` for words, unheard, pause/range, cut block (items, enabled state, Cut vs Restore);
right-click outside the selection selects first; ⇧F10; Remove Text.
Tests: `menuFor` for each target and cut state; each item calls the same handler as its shortcut; Remove Text → one
step, words gone, time free (shows as unheard when speech covers it), cuts unchanged.
Check in the window: the native menu opens at the pointer, VoiceOver reads it, Esc closes it.

### Phase 7 — Check with real use, update the user model
One full pass on the real take: cut ten unheard bits, fix two names, add one word, remove one. Answer Q1, Q2, Q6, Q7
below as far as one person can; write the answers into `design/user-model.md` and `wiki.md`.
Tests: none new; `npm run test:ui` and `npm run test:rust` green.

## Out of scope (on purpose)
- Replace all for a repeated name (research #5): proposed as its own feature (lives in ⌘F).
- Magic reading unheard speech (research Q3): wait for Q6. If half-words are heard at Magic's joins, let Magic extend
  a cut over an adjacent unheard bit; that's a small, separate change.
- Re-timing words by dragging, snapping word edges to speech runs (AUDIO PAUSES "Later").
- Captions, casing and punctuation work, speaker labels.

## Open questions (carry until answered)
| # | Question | How we'll know |
|---|---|---|
| Q1 | Is most unheard speech fillers and false starts? | Phase 7 tally on the real take |
| Q2 | Do people cut unheard bits far more than they write into them? | Count ⌫ vs writes in a test build |
| Q4 | Do people click between words and type, and is step 4 of the write rule what they expect? | Watch 3 users add a word |
| Q6 | Are half-words left at Magic's joins? | Listen to joins after Magic on `models/retakes.wav` |
| Q7 | Does hearing again get it right often enough to be the default on double-click? | Phase 5 check |

## Status (2026-11-22)
- Design and roadmap written (Jony): `design/missed-words.md`, this file. Edit model, transcript and strip specs
  point to it. Nothing built yet.
- Next: Phase 1 (can start now) and AUDIO PAUSES Phases 1–3 in parallel.

## Decisions
- **Unheard speech is derived, not stored**: speech runs minus words, recomputed when words change (like pauses).
  Writing into it makes it shrink or go; undo brings it back for free.
- **Silence and unheard speech never look alike**: filled grey block vs. dotted empty outline with `…`; the panel shows
  only speech.
- **One write rule for every selection**: what's highlighted is replaced; with nothing highlighted, the text fills the
  free time, narrowed to the sound. Typing never does nothing.
- **Words you didn't change keep their time.** Retyping a neighbour ("working" → "not working") is then correct, so
  no caret or insert mode is needed.
- **⌫ never deletes text** (still). Removing text only is a menu item, the one thing right-click adds.
- **Listening again is not a button**: it's what the field does when you open it on unheard speech with
  double-click / Return. Typing first wins.
- **Native right-click menu**, items from a pure function, each item = an existing shortcut.
