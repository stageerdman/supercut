# Missed and misheard words: see them, cut them, write them

Author: Jony · 2026-11-22 · Status: ready to build. Plan: `updates/2026-11-22 MISSED WORDS - OPEN/update v1.md`.
Research: `updates/2026-11-22 MANUAL EDITING - OPEN/research-missed-words.md` (Columbo) and
`updates/2026-11-22 AUDIO PAUSES - OPEN/update v1.md` (Elon: speech runs from Silero VAD).
Builds on `design/edit-model.md`, `design/transcript-editing.md`, `design/timeline-strip.md`,
`design/timeline-words-by-zoom.md`. Changes the "fixWords" rule in the edit model (see "Where words go").
Checked against `design/user-model.md`: goal 2 (trust every cut: real speech must never look like silence) and goal 3
(throw away junk myself: most missed "words" are ums and false starts people want gone).

## User goal
"If I said something, show me it's there, even when the app didn't catch the words. Let me cut it, or write what I
said, and have it land exactly where I said it."

Ranked, from the research: **cut** speech with no words (L8 F8) ≫ **fix** a misheard word (L9 F6, already works)
≫ **add** a missed word that matters (L6 F4) ≫ **remove** a made-up word (L4 F2).

## What I removed, and why
| Removed | Why |
|---|---|
| An "insert" mode, a text caret between words | Typing into a selection already covers it. A second way to type is a second thing to learn. |
| A dialog with start/end times for a new word | The time is the selection. Nobody should type a timestamp. |
| A "3 unheard bits" counter, badge or nudge | Fixing is optional (research #2). Unheard speech is shown, never flagged as an error. |
| A "Listen again" button on every word | Rare (L5 F2). It happens on its own where it's useful: opening the field on unheard speech. |
| Replace all (same name everywhere) | Real pain, but its own job and its own place (⌘F). Proposed as a separate feature. |
| Showing silence in the panel | The panel is for what was said. Anything that shows up in it is speech. That's what keeps the two apart. |
| Letting Magic read unheard speech | Not until we hear whether half-words are left at Magic's joins (research Q6). Fewer moving parts first. |
| Dragging words to re-time them | Out of scope. Times come from the selection and the audio. |

## The three things on the time line of a part
| Thing | Comes from | Means to the user | Panel | Strip |
|---|---|---|---|---|
| **Word** | transcript, or typed | "this was said" | the word | the word (by zoom level) |
| **Unheard speech** | a speech run with no word on it | "something was said here" | `…` pill | dotted outline block |
| **Pause** | the silence between speech runs | "nothing here, safe to cut" | — | grey filled block (today) |

Silence and unheard speech never look alike: one is a **filled** grey block with a length, the other an **empty
dotted outline** with `…`. Different fill, different edge, different label. And only speech appears in the panel.

## What unheard speech is (pure: `src/ui/unheard.js`)
- Input: a part's speech runs (`transcript.speech`, from the audio-pauses update) and its words (`edit.words[part]`).
- `unheard(speech, words)`: each speech run minus the time covered by words (`[w.s, w.e]`). Pieces ≥ **0.3 s** are
  unheard speech (`MIN_UNHEARD`, Elon's number); shorter pieces are word edges running long, not missed speech.
- Recomputed when words change (memoised like `pauses`), so writing words into it makes it shrink or vanish at once.
  No new state: it's derived, like pauses.
- A transcript without `speech` (old one, or VAD failed) → no unheard speech; everything else works as today.
- **Pauses** come from speech runs (audio-pauses Phase 3) **plus any word you wrote** (`fixed: true`): a word you put
  into silence the detector missed is speech too, so no pause is drawn over it.

## Cutting it (the frequent job)
Unheard speech is selected like a word and cut like a word.
- Selecting it gives `{ part, s, e, unheard: true }`.
- ⌫ is the one toggle rule. The cut range is the word rule (`wordRange`): from the middle of the silence before it
  to the middle of the silence after it, its neighbours being the nearest word or speech edge. So a cut "um" leaves
  one natural pause, exactly as a cut word does. Label: "Cut 0.6 s unheard".
- ⌫ again restores the same range.
- During playback it **lights** like a word (accent) while the playhead is inside it, so following never stalls over
  speech the transcript missed (research #3).

## Writing words (one rule for every selection)
Select, then type. That's all. It works from the panel and from the timeline, on words, on unheard speech, on a pause
or on any dragged range.

### What gets replaced, what gets filled (pure: `writeWords` in `src/ui/fix.js`)
`writeWords(words, sel, text, unheard)` → `{ words, label }`. Steps:

1. **Replaced words** = the words highlighted by the selection (`wordsIn`: middle inside). What you see highlighted is
   what goes. Words only touched at the edge stay.
2. **No word highlighted** → this is an **insert**. The room is the free time inside the selection, between the
   nearest words: `[max(sel.s, prev.e), min(sel.e, next.s)]`. If unheard speech lies in that room, the room shrinks to
   that speech (first start → last end): the words take the sound, not the silence around it, so a later ⌫ cuts
   exactly what was said (research insight 4).
3. **No word highlighted and no room** (under 0.1 s, `MIN_ROOM`; e.g. a drag inside one word) → the words the
   selection overlaps are replaced instead. The panel highlights them as the field opens, so you see what you're
   fixing. Typing never does nothing.
4. **Words you didn't change keep their time.** The typed words are matched against the replaced words: the same
   words at the start and at the end (exact text) keep their times. Only the middle is re-timed:
   - middle had old words → the new middle words share those old words' span, by letter count (today's rule);
   - middle had no old words (you only added) → the new words go into the **gap** between the kept words on each
     side, narrowed to unheard speech in it if there is any. Gap under `MIN_ROOM` → fall back to sharing the whole
     replaced span by letter count (today's rule).
   - you removed words from the middle and added none → their text goes, their time is left free (unheard speech
     where the audio heard talking).
5. Every written word gets `fixed: true`. Empty text = no change (as today). Cuts never move; a word whose middle is
   in a cut is cut.

**The guarantee (tested):** after any write, the part's words are in time order, none overlap, and no word outside
the replaced ones changes its text or its time. A new word can't collide with a neighbour.

Why step 4: it makes today's workaround correct. Click "working", type "not working": "working" keeps its time and
"not" goes into the gap before it (or the unheard "not" there). The caret habit (research #7) then does the right
thing, with no caret.

### Examples (`|` = word edges, `~` = unheard speech, `_` = silence)
| Before | Selection | Typed | After |
|---|---|---|---|
| `it's _~~~_ working` | the `~~~` pill | `not` | `it's _not_ working`, "not" on the `~~~` time |
| `it's _~~~_ working` | "working" | `not working` | same as above: "working" keeps its time |
| `it's ___ working` (no unheard) | dragged over the gap | `not` | "not" fills the gap between "it's" and "working" |
| `use cling today` | "cling" | `Gling` | "Gling" on cling's time (today) |
| `gonna` | "gonna" | `going to` | two words share gonna's span (today) |
| `so um the` (um made up over a cough) | "so um the" | `so the` | "um" text gone, its time free |
| `the plan` | drag over the first half of "plan" | `planet` | no room, so "plan" is replaced |

### Labels (history, one step each)
"Fixed “cling”" (today) · "Added “not”" (insert, or step 4 with only additions) · "Removed text “um”".
Quotes hold the first 24 characters, then "…" (today's `short`).

## Where you type
| Selection | How the field opens | Where it sits |
|---|---|---|
| Words (panel) | type a letter (not `M`), double-click, Return: today | over the words |
| Unheard pill (panel or strip) | type a letter, double-click, Return | over the `…` pill |
| A pause or a dragged range (timeline) | type a letter, or Return | in the panel, between the neighbouring words (an empty field, holding the letter). The panel scrolls it into view; the timeline keeps the selection |

The field is today's fix field: inline, same font, 1 pt accent outline, no label, no button. Return or click away
commits, Esc cancels. While it's open the panel never scrolls. **Typing with focus on the timeline now works** (today
it needs a click in the panel first): the letter goes into the field.

`M` still makes a note (`design/notes.md`); a word starting with "m" opens with Return or a double-click.

### Hearing it again (on unheard speech only)
Opening the field with **double-click or Return** on unheard speech asks the speech model to listen to just that
stretch (0.3 s either side): Rust command `recognize { id, s, e } → { text }`.
- While it listens (well under a second for a 1–5 s stretch): the field is open, empty, placeholder "Listening…"
  in `textSecondary`. You can type straight away; the moment you type, the result is dropped.
- It hears words → they fill the field, all selected. Return accepts, typing replaces, Esc cancels.
- It hears nothing, or fails → the field stays empty, the placeholder clears. No error message: you can still type.
- Opening it by **typing a letter** skips listening: you already know what to write.

This is the cheap win from Elon's spike (re-recognising a missed stretch got the sentence back every time it was real
speech), with no button: it's simply what the field does on speech it couldn't read.

## Editing existing words
- **Double-click** a word, **type over** it, or **Return** on it: today, unchanged (the main way).
- **Right-click** (or Control-click, or ⇧F10 with focus on it): a short native menu for what's under the pointer.
  It's the discovery path for people who don't know the gestures, and the only home for "remove the text, keep the
  sound". Right-clicking something outside the selection selects it first (Mac habit).

| Right-click on | Menu |
|---|---|
| Words | **Fix Text** ↩ · **Cut** ⌫ (or **Restore** ⌫ if all cut) · — · **Remove Text** |
| Unheard speech | **Write What's Said…** ↩ · **Cut** ⌫ / **Restore** ⌫ |
| A pause or a range on the timeline | **Write Words Here…** ↩ · **Cut** ⌫ / **Restore** ⌫ |
| A cut block | **Restore** ⌫ |

- Shortcuts show on the right, as Mac menus do. Each item runs the same code as its shortcut; the menu adds no
  new behaviour except Remove Text.
- **Remove Text** takes the words out of the transcript and leaves the video alone. Their time becomes free: unheard
  speech if the audio heard talking there, a pause if not. One undo step: "Removed text “um”". It's below a separator
  because it's the rare one.
- Native menu (Tauri v2 menu API, `popup()` at the pointer): it looks right, and VoiceOver and the keyboard work for
  free. The items come from a pure `menuFor(target, cuts)` so they're tested without a window.

## Look
### Unheard pill (panel)
- Inline, where it falls between the words: `…` in `textSecondary`, `caption` 11 pt, padding 0 6, height 18,
  radius 9, 1 pt **dotted** border `textSecondary` 60 %, no fill. Its width doesn't grow with its length: it's a mark,
  not a timeline.
- Hover: `raised` fill; title "Unheard speech · 0.6 s · Type what's said, or Backspace to cut".
- Selected: `accent` 20 % fill (like a word). Lit: `…` and border in `accent`.
- Cut by you / Magic: `…` struck through in the owner's colour, 2 pt, as a word.
- Under 0.3 s: not shown (see above).

### Unheard block (strip)
- At its times, inset 2 pt top and bottom like a pause, radius 3, **no fill**, 1 pt dotted border `text` 55 %; `…`
  centred in `text` 70 % when ≥ 20 pt wide. Min width 2 pt (never invisible zoomed out).
- It's an **obstacle** for word labels (`design/timeline-words-by-zoom.md`, rule 2), like a pause block.
- Click / Tab selects (in time order with pauses and cuts); selected: 1.5 pt accent ring and the chip **Cut ⌫**, as a
  pause. Under a cut block it's covered, like a cut pause.
- Layers: with the pause blocks (z 2).

Colours are all existing tokens (`design/visual-system.md`). Accent is used only for selected and lit, as today.

## States
| State | Panel | Strip |
|---|---|---|
| Transcript without speech runs | No pills; writing still works on words and dragged ranges | No unheard blocks; pauses from word gaps (fallback) |
| Speech runs, no unheard speech | Nothing new to see | Nothing new |
| Part with no words but speech | "No speech found." is replaced by one pill per unheard run, so the part can still be cut and written into | Unheard blocks |
| Field open, listening | Empty field, "Listening…" | Selection stays |
| Recognize failed / heard nothing | Empty field, ready to type | — |
| Words written | Pill gone (or smaller); new words in `text` | Block gone; new labels laid out at once |
| Magic lands while the field is open | Field stays; on commit the write applies to the new state (the selection is time, not indexes) | Blocks strike in |
| Undo of a write | Old words back, pill back; the change scrolls into view, status "Undo · Added “not”" | Same |

## Accessibility
- Pill: `role="button"`, "Unheard speech, 0.6 seconds, at 4:12. Type what's said, or Backspace to cut it." Cut:
  "…, cut. Backspace restores." In the panel's word order, so ← → reach it like a word.
- Strip block: the same label; in Tab order with pauses and cuts.
- The field while listening: `aria-busy="true"`, name "Write what's said, listening". With text: "Write what's said,
  not".
- The menu is native: keyboard and VoiceOver come with it. ⇧F10 opens it on the focused item.
- Contrast: `textSecondary` on `surface` ≈ 7:1; the dotted border is 60 % of that, which is decoration — the `…` and
  the label carry the meaning. Increase Contrast: border solid 1.5 pt.
- Tap targets: pill 18 pt high, at least 24 pt wide; strip block hit area at least 12 pt wide (as cut blocks).

## Components (each its own file, tested on its own)
- `src/ui/unheard.js` (pure, new): `unheard(speech, words)`, `MIN_UNHEARD`, `tokens(words, unheard)` (words and
  unheard runs merged in time order, for `wordRange` and ← →).
- `src/ui/fix.js`: `writeWords(words, sel, text, unheard)` (new, the rule above); `fixWords` stays as its
  letter-count helper. `removeText(words, from, to)`.
- `src/ui/fix-field.js`: opens over words, over a pill, or empty between two words; `listen` option (placeholder,
  drop the result on first keystroke).
- `src/ui/context-menu.js` (new): `menuFor(target, cuts)` (pure) → items; `popup(items, at)` (Tauri).
- `src/ui/transcript.js`: renders pills, lights them, opens the field on them, right-click.
- `src/ui/strip-view.js` / `timeline.js`: unheard blocks, Tab, right-click, typing on a selection.
- `src/ui/pauses.js`: unchanged function; called with speech runs ∪ written words.
- Rust: `recognize { id, s, e }` in `transcribe.rs` (reuses the loaded Parakeet), registered in `generate_handler!`.
