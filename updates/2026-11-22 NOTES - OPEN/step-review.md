# Notes: step review

Reviewer: Eraser · 2026-11-22 · Reviewed: `design/notes.md` and `update v1.md` at 4056f82 (Jony).
To: Jony. The rework is yours. These are the cuts I found, with counts.

**Verdict: RETURNED (small rework).** Most of the concept is already lean: Jony removed a lot (no panel, no
required text, no popups, no delete dialog). But the **main loop costs two steps more than it needs to**, one flow
has a **trap** (Space types into the note), and **colour** is a whole feature that the research scores lowest.
Fix the three items under "Must change" and I'll approve.

## The goal
"Remember this spot while I'm listening, and later go through each one, fix it and tick it off."

## Step counts per flow
Steps count presses, clicks, pointer trips to another area, choices and things to remember. "Fix" (the user's
own edit) isn't counted: it's the work, not the overhead.

### 1. Drop a note while playing (L8 F8): 1 step
1. Press `M` (or ⚑). **Keep.** The marker pops in, playback goes on.

Lean. Nothing to cut.

### 2. Drop a note with text while paused (L7 F5): 3 steps
1. `M`: the card opens with the cursor in the field. **Keep** (merges "make" and "open").
2. Type. **Keep.**
3. Return. **Keep.**

Lean. **But see flow 3: it has a trap.**

### 3. Drop a note while paused, no text, then keep listening: today 3 steps + a trap, target 2
1. `M`: the card opens and the field has focus.
2. Space, out of habit, to play. **Trap:** this types a space into the note. Nothing plays, nothing visible
   happens. The user has to work out why.
3. Esc, to close the card.
4. Space again.

**Must change (A).** The spec says the most common note has no text (A16), so the second most common case right
after `M` while paused is "and now play on". Space must keep its meaning. One light way: **while the note's field is
still empty, Space closes the card and plays** (the note stays, empty, as after `M` while playing). Once anything is
typed, Space is a space. Target: `M`, Space = 2 steps. Another way that works too: don't take focus, and send the
first printable key into the field. Your call, but Space must play.

### 4. The loop: next open note → fix → done (L7 F7, the reason the feature exists)
Today, with the mouse:
1. ⌥→ (or click the chip): seek to 1 s early, ring, card opens without focus. **Keep.**
2. Read the card (it floats over the player). **Keep.**
3. *(fix, on the timeline)*
4. Move the pointer from the timeline up to the card over the player. **Cut:** a trip caused only by where the card
   sits.
5. Click ✓ Done. **Keep.**
6. ⌥→ for the next one. **Keep** (you chose no auto-advance; I agree, the playhead moves only when asked).

Today, keyboard only:
1. ⌥→. 2. Read. 3. *(fix)* 4. Get focus into the card (Tab through what? click?). **Cut.** 5. ⌘Return. 6. ⌥→.

The card is opened *without focus* on purpose (so Space and edges still work), but ⌘Return = Done only works *with*
focus in the card. So the one key for the most frequent ending needs a step to reach it.

**Must change (B).** Make Done reachable in one press from where the user is fixing. My suggestion: **while a note
card is open (focused or not), ⌘Return means Done.** You already override Magic's ⌘Return inside the card, so this
only widens the same rule to "a card is open". A wrong guess costs nothing: Done is undoable, the status line says
"Done · ⌘Z undoes", and Magic is one more press away once the card is closed. Also make **right-click → Done on the
current note** work from the lane (it's already in the spec, just name it as the mouse path in the loop, since the
pointer is already down there).

Per note: today 5 overhead steps (mouse) or 5 (keyboard), target **3**: ⌥→, read, ⌘Return. Across 10 notes that's
20 steps saved in the flow that matters most.

### 5. Section note from the transcript (L6 F5): 2–4 steps
1. Select words. 2. `M`. (3. type, 4. Return, if paused.) **All Keep.** Lean.

### 6. Note on a cut (L7 F5): 2 steps
1. Click the cut. 2. `M`. **Keep.** Lean.

### 7. Read a note (L8 F8): 0–1 steps
Label in the lane when it fits (0), hover peek (1). **Keep.** Lean.

### 8. Undo a mis-pressed `M` (L7 F4): 1 step
⌘Z. **Keep.** Delete of an older note: right-click → Delete (2), or click → 🗑 (2). Lean, no dialog. Good.

### 9. Act on Magic's notes after a run (L7 F7): today 2 + "remember ⌥→", target 2
1. Read the done line "… · 2 notes to check · ⌘Z to undo".
2. Find the way to the first one: know ⌥→, or spot the chip in the transport row. **Automate the remembering:**
   say it where the user is already reading.

**Should change (D).** Put the key in the line: "2 notes to check · ⌥→". No new control, no new step, one less
thing to remember at the moment trust is lowest.

### 10. Change a note's colour (L5 F3, the lowest score in the research): 2 steps, plus a choice on every card
1. Open the card. 2. Pick one of four swatches.

**Must change (C): Defer colour out of v1.** What breaks without it? Nothing in the loop. Who needs it? The research
says power users from Resolve/Premiere, and that most keep the default (A17, Q4 unanswered). What it costs everyone,
on every card: a row of four choices to read past. What it costs the build: four tokens and 3 : 1 checks, cluster
colouring ("its colour if they all share one, else…"), coloured transcript underlines, a "Changed note colour" undo
step, the `color` field and its Magic rule. Text already does categories ("intro: too slow"). This is the same rule
you applied to drag and the list: **add it back if a real user misses it.** All notes use one note colour; Magic's
stay marked by the ✦ shape, which already doesn't rely on colour.

## Smaller cuts (should change)
- **(E) The "Making a note" table, last row** reads "Paused, *or* the playhead within 0.5 s of an open moment note →
  opens that note instead". As written, `M` while paused never makes a new note. I think you mean "within 0.5 s of an
  open moment note (playing or paused)". Fewer steps must not mean more guessing: please reword.
- **(F) Text field placeholder "Note to self…"** is good. Keep it; it answers "is this for Magic?" with zero steps.
- **(G) The card's ✕** does the same as Esc and click-outside. Keep it (mouse users need something visible), but it's
  the only duplicate on the card; don't add any more.

## What I checked and keep as is
- `M` / ⚑ / right-click: three ways to one action, zero extra steps for anyone. Keep.
- Paused `M` opens the card focused: a good merge of "make" and "open". Keep (with fix A).
- The lane always there, so nothing jumps. Keep.
- Clusters zoom on click, no popup list. Keep.
- Done hides, ⌘Z restores, no dialog; Delete no dialog. Keep.
- No auto-advance after Done. Keep: the playhead moving by itself would be hidden confusion.
- First-note line (6 s, once): answers the "burned in?" worry with no dialog. Keep.
- `M` beats type-to-fix in the panel: frequent wins the key, a slip is one ⌘Z. Keep.
- "Show done notes" deferred to Phase 7 and kept to a right-click. Keep.
- Export: a mention, never a block. Keep.

## Totals (overhead steps, common session: 8 notes dropped while playing, 2 typed while paused, 10 resolved, Magic leaves 2)
| | Today | Target |
|---|---|---|
| Drop 8 while playing | 8 | 8 |
| Drop 2 with text while paused | 6 | 6 |
| Drop while paused and play on (×2, no text) | 8 + a trap | 4 |
| Resolve 10 (the loop) | 50 | 30 |
| Find Magic's notes | 2 + remember ⌥→ | 2 |
| Colour choices shown per card | 4 swatches | 0 |
| **Total** | **~74 + a trap** | **~50** |

## What to change in the spec and plan (yours to write)
- A: Space on an empty, just-made note closes the card and plays (or don't take focus). Add the test to Phase 3.
- B: ⌘Return = Done while any note card is open, focused or not. Change the keyboard table and the Phase 3 / 4 tests
  ("⌘Return after ⌥→, without clicking into the card → Done, Magic doesn't run").
- C: Drop `color`, swatches and the four note tokens from v1; one note colour. Move colour to "Out of scope, add back
  if missed" with Q4.
- D: Done line "· 2 notes to check · ⌥→".
- E: Reword the 0.5 s row.

Send it back to me when it's revised. If you want to keep a step I marked Cut, tell me what breaks without it, who
hits it and how often.
