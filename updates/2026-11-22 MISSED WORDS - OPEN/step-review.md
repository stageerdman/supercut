# Missed words — step review (Eraser)

Reviewed: `design/missed-words.md` and `update v1.md` (Jony, 2026-11-22). Verdict: **APPROVED**.

## Goal
"When the app missed what I said, let me see it, cut it, or write it, and have it land where I said it."

## Step counts (most common path first)
| Job (research rank) | Steps | Mark |
|---|---|---|
| Cut unheard speech (L8 F8) | 1 click the `…` · 2 ⌫ | Keep: same as cutting a word, no new gesture |
| Fix a misheard word (L9 F6) | 1 double-click · 2 type · 3 Return | Keep: unchanged from today |
| Write a missed word on unheard speech | 1 double-click the `…` (it listens by itself) · 2 Return | Automated: re-hearing fills the field, no button |
| …if listening got it wrong | 1 click `…` · 2 type · 3 Return | Keep |
| Add a word into silence | 1 drag on the timeline · 2 type · 3 Return | Keep: the selection *is* the time, no timestamp dialog |
| Add a word by retyping a neighbour | 1 double-click "working" · 2 type "not working" · 3 Return | Keep: step 4 of the write rule makes the habit correct, no caret or insert mode |
| Remove made-up text, keep the sound (L4 F2) | 1 right-click · 2 Remove Text | Keep: rare, so it may live in a menu |

Already cut by the designer (agreed): insert mode / caret, start–end dialog, "unheard" counter/badge, per-word
"Listen again" button, drag-to-retime, replace-all (separate feature). Nothing confirms; everything is one undo step.

Current count on the frequent path: 2. Target: 2. Nothing left to erase.

## Watch for later
1. **`M` inside the type-to-write flow.** Typing on a `…` pill or a timeline range is now a main way to write, and
   `M` still makes a note there. "my", "maybe", "more" will turn into a note plus stray letters. Undo saves it, but
   it's a trap on the path whose hover text says "Type what's said". Watch it in Phase 4 / Q4; if it bites, let
   letters (including `m`) write when the selection is unheard speech or a range, and keep `M` = note for word
   selections and playback.
2. **Double-click listens, a letter doesn't.** Fine as long as listening is fast (<1 s). If Phase 5 shows it slow or
   often wrong (Q7), drop listening from double-click rather than adding a button.
3. **Fallback "no room → replace overlapped words".** Only acceptable because the words highlight before the field
   opens. Keep that highlight; never replace silently.
4. **Pill width doesn't show length.** OK because the strip shows it; if users cut long unheard bits from the panel
   by mistake, show the length in the pill (e.g. `… 4s`) for runs over ~2 s, not a confirmation.
