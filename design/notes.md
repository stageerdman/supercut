# Notes

Author: Jony · 2026-11-22 · Status: **final, ready to build** (revised after Eraser's step review, `step-review.md`). Plan: `updates/2026-11-22 NOTES - OPEN/update v1.md`.
Research: `updates/2026-11-22 NOTES - OPEN/research-notes.md` (Columbo). Model: `design/edit-model.md`.
Timeline: `design/timeline.md`, `design/timeline-words-by-zoom.md`. Tokens: `design/visual-system.md`.
Checked against `design/user-model.md`: goal 2 (trust every cut: park a doubt and come back to it), goal 1 (finish
tonight: know nothing is left), and the habits people bring (`M` from Premiere / Final Cut / Resolve; Space, ⌘Z).

## User goal
"Remember this spot so I can deal with it later, and don't let me forget."
A note is a **to-do pinned to a moment** (or a stretch) of the recording. It's for the editor only. It never
shows in the video. It isn't a comment for anyone else: the app is used by one person.

The loop the whole feature serves:
**drop it while listening → come back to the next open one → fix it → mark it done.**

## What I removed, and why
| Removed | Why |
|---|---|
| A notes list / markers panel | With 5–15 notes, "next open note" plus a count does the job. A panel is a second place to look, and the screen has no room for it. |
| Required text, title + comment fields | Most notes are made mid-playback with no text (A16). One optional text field. |
| A text box that pops up while playing | It would grab focus and stop the flow. Playing: `M` adds and nothing else happens. |
| Dragging notes, resizing a section | Rare (L5 F2). A note dropped half a second late is fine, because jumping to it starts 1 s early. If it's wrong: delete it and press `M` again. |
| A free colour picker | Five fixed colours, yellow by default (red added on request). Most people never change it (A17). |
| A note from Magic on every cut | The cut's hover already says why it was cut. A note per cut is noise, and then people stop reading their own notes too. |
| Note text popping up as the playhead passes | Distracting while listening (Q6). Hover and "next note" show the text when you want it. |
| A separate "resolved" screen or filter bar | Done notes are hidden. ⌘Z brings one back. A small "Show done notes" toggle handles the rare "what did I fix?" (Phase 7). |
| A confirmation before delete | Delete is undoable. No dialog. |
| Notes in the export, chapters, Final Cut markers | That's publishing, not editing. Out of scope. |
| Replies, mentions, rich text, attachments | It's one person writing to-dos for themselves. |
| Notes as instructions to Magic ("cut this") | Not now. Notes are private to you. The placeholder "Note to self…" and the first-note line say so. Open question Q2, for Pixel. |

## The note
```js
note = {
  id,                    // stable, for the card, undo and cut review
  part, s, e,            // source time, like cuts. s === e → a moment note; s < e → a section note
  text: '',              // can be empty
  color: 'yellow',       // 'yellow' | 'red' | 'blue' | 'violet' | 'teal'
  by: 'you' | 'magic',   // any touch on a Magic note makes it yours (as with cuts)
  done: false, doneAt?,  // done notes stay in the state, hidden from the lane
  about?: { s, e, by },  // the cut it's about: set by M on a selected cut and by cut review later
}
```
Notes live in `edit.notes`, next to `cuts` and `words`. That gives undo/redo, saving (when projects are saved) and
"one truth" for free. Notes belong to **time, not to cuts**: cutting, restoring or dragging an edge never moves or
deletes a note.

## Making a note: one action, two kinds
| Situation | `M` (or the ⚑ button, or right-click "Add note") makes |
|---|---|
| No selection | A **moment note** at the playhead |
| Words selected (panel or strip) or a time range selected | A **section note** over the selection (the words' starts and ends, not the pause midpoints a cut uses) |
| A cut selected | A section note over that cut, with `about` = the cut. This is "the join sounds off" note |
| The playhead within 0.5 s of an open moment note (playing or paused), no selection | No new note: there's one already. Paused, its card opens. Playing, its marker pops again and nothing opens. A double press can't make two |

After making a note:
- **Playing**: nothing opens. Playback goes on. The marker pops in (scale 0.6 → 1 and fade, 160 ms). The status line
  says "Note added · ⌘Z undoes" for 2 s.
- **Paused**: the card opens with the cursor in the text field, so you can type at once (2–5 words, A).
- **Paused, then Space**: while the text field is still empty, **Space closes the card and plays**. The note stays,
  empty, exactly as if `M` had been pressed while playing. Once anything is typed, Space is a space. So "mark and play
  on" is `M`, Space, two keys, and Space never silently types into a note.
- A selection is cleared (it's been used), as after ⌫.
- **The very first note ever**: the status line says "Note added. Notes are only for you, never in your video." for
  6 s, once, then never again. That answers the "will this be burned in?" worry without a dialog.

### Where `M` works
Everywhere except inside a text field (the note's own text, the fix field, the rules box, search).
**One exception to type-to-fix:** in the transcript panel, typing a letter over selected words opens the fix field.
`M` is the one letter that doesn't. It makes a note. Fixing a word that starts with "m" begins with Return or a
double-click instead. I chose this because notes are made often (L8 F8) and fixes rarely (A10), so the common action
gets the key that people already know. A slip is harmless: a note appears, and ⌘Z removes it.

## The lane
A row of its own **under the track**. Words are above the track, notes are below it, and a cut block (strip + track)
never covers a note. That keeps the watch-out from the research ("a note hidden under a cut block") from happening.

```
│ 0:00        0:30   ▼    1:00                       1:30     │ ruler
│ So the first… ┌──────────┐ and then [0.8 s] we…             │ strip
│ ▁▃▅▃▁▂▆▇▅▂▃▅▆ │  2.4 s   │ ▃▅▆▃▁▁▂▅▇▆▃▁▁▃▅▆▃▅▃▅▃▂▁▃▅▆▅▃▂▁ │ track
│               └──────────┘                                  │
│  ▌ too tight       ▕✦ Two good takes…    ▏   ▌  ③           │ notes lane
```
- **Box**: 4 pt under the track, 20 pt tall, full part width. The timeline grows by 24 pt (`HEIGHT` 152 → 176).
  It's there as soon as a part is loaded, even when it's empty: if it appeared with the first note, the whole layout
  would jump mid-playback. Empty, it has no label and no hint. It's just space.
- **Moment note**: a pill 6 × 16 pt, radius 3, centred on its time, solid note colour. A Magic note's pill is 14 pt
  wide with a ✦ (9 pt, `onAccent`) inside, so who made it shows in shape, not in colour.
- **Section note**: a bar from `s` to `e`, 16 pt tall, radius 4. Fill is the note colour at 24 %, with a 2 pt solid
  stripe in the note colour at its start and a 1 pt border in the note colour at 60 %. A Magic section starts with a ✦
  (11 pt, note colour) just after the stripe. It is at least 6 pt wide.
- **Text in the lane**: when there's room, the note's text is drawn as a label, `caption` 11 pt, `text` 90 %. For a
  moment note it sits right after the pill, and for a section it sits inside the bar after the stripe (or the ✦).
  The rules are the same as the strip's words (`design/timeline-words-by-zoom.md`): **whole or nothing** (whole
  words, then "…"; if not even the first word fits, no label), **no overlap** (a label stops 6 pt before the next
  note or the part's end). The text is the first line only. An empty note shows no label.
- **Stacking**: moment notes sit above sections, and a shorter section sits above a longer one, so a long section
  still shows at its ends. Done notes aren't drawn.
- **Too close to tell apart** (zoomed out: two markers' centres under 12 pt apart): they merge into one **cluster**,
  a pill 18 × 16 pt with the count ("3"), `caption` tabular in `onAccent`. It takes the notes' colour if they all
  share one, else `textSecondary`. **Clicking a cluster zooms in** on those notes (fit their span with 15 % margin,
  anchored on the cluster) until they separate. No list, no popup. Sections are part of a cluster only when their
  whole bar is under 12 pt.
- **Selected / current note**: the 1.5 pt `accent` ring outside it, the same ring a selected cut gets.
- **Hit area**: at least 12 pt wide, the full 20 pt lane height. When targets overlap, the nearer centre wins.
- **Layer**: the lane is its own row with nothing above it but the playhead (which runs through it, 1 pt accent) and
  chips.

## Reading a note: hover, then click
- **Hover** (or keyboard focus) for 150 ms shows the **peek**: a small read-only card just above the lane, `raised`,
  radius 6, padding 8, at most 240 pt wide, 3 lines. It holds the text in `body` 13, or "Empty note" in
  `textSecondary`, and a `caption` line under it: "1:12", or "1:12 – 1:40 · 28 s", plus " · ✦ Magic" if Magic made it.
  It leaves when the pointer leaves.
- **Click** (or Return on a focused note) opens the **card** and moves the playhead to just before the note (see
  "Going to a note"). Play/pause stays as it was. The time selection isn't touched.

## The card
The one place to change a note. It's non-modal: you can keep working on the timeline while it's open, which is the
point when you're fixing what the note says.

```
┌──────────────────────────────────────┐
│ 1:12 – 1:40 · ✦ Magic             ✕  │  caption, textSecondary · close
│ Two good takes here; I kept the      │  text field, body 13, placeholder "Note to self…"
│ second. Listen to both?              │
│                                      │
│ ● ○ ○ ○ ○                    🗑  (✓) │  colours · delete (quiet) · Done (primary, green circle)
└──────────────────────────────────────┘
```
- **Where**: it floats over the bottom of the player, 8 pt above the transport row, centred on the note's x and kept
  inside the player's width. That way it never covers the timeline you're fixing on. It's 280 pt wide, `raised`,
  radius 10, hairline border, padding 12. Only one card is open at a time.
- **Text field**: grows up to 4 lines, then scrolls. Return saves and closes, ⇧Return adds a new line. Esc or ✕ closes
  and **keeps the text**. Clicking anywhere outside the card and the timeline also closes it and keeps the text.
  Text is never lost.
- **Colours**: five swatches (yellow, red, blue, violet, teal), 16 pt dots with a 28 pt hit area, in a radio group.
  The chosen one has a 1.5 pt `text` ring. A change applies at once.
- **Done** is the one primary button: a 28 pt circle in `doneGreen` (#34C759) with only a 14 pt `onAccent` check, no
  words. Its name is "Mark note done". Green, not coral: coral means "cut" and Magic, and Done is neither. On a done
  note it turns hollow (1.5 pt green ring, green check), named "Reopen note", and the same press reopens it. **⌘Return does the same
  whenever a card is open, focused or not**, so after ⌥→ and a fix on the timeline, one press ends the note. (⌘Return
  is Magic everywhere else. While a card is open it means Done; close the card and it's Magic again. A wrong guess
  costs nothing: Done undoes with ⌘Z.) The button's tooltip is "Done (⌘Return)".
- **Done with the mouse, from the timeline**: right-click the note in the lane → "Done". The pointer is already down
  there after the fix, so there's no trip up to the card.
- **Delete** is a quiet icon button (`trash`, 13 pt, `textSecondary`, 28 pt target, label "Delete note"). ⌘⌫ inside
  the card does the same. There's no dialog, because ⌘Z brings it back.
- **Undo**: one step per thing you did. Opening, typing and closing is one step, "Edited note", made only if the text
  changed. A colour change is "Changed note colour". Done is its own step, and so is Delete.

### Done and delete
- **Done**: `done: true`, `doneAt` = now. The card closes, the marker fades out (200 ms), and the status line says
  "Done · 2 notes left · ⌘Z undoes", or "All notes done" after the last one. The note stays in the state.
- **Delete**: the note is gone, with the status line "Note deleted · ⌘Z undoes". Deleting a Magic note also remembers
  the spot, so the next Magic run doesn't put the same note back (see Magic's notes).

## Going to a note: the way back
This loop is why the feature exists.
- **⌥→ / ⌥←**: the next / previous **open** note after / before the playhead, across parts in play order. It wraps
  around at the ends. Done notes are skipped.
- **The count**: a quiet chip in the transport row, "3 notes", `caption`, `textSecondary` on `raised`, radius 6, 24 pt
  tall. It shows only while some note is open. Clicking it does the same as ⌥→. Its tooltip is "Next open note (⌥→)".
- **Going to a note** moves the playhead to **1 s of kept time before** the note's start, clamped to the part's first
  kept moment. People press `M` about half a second late (A18), and this also plays you across a join when the note
  is about a cut. If the note is off screen, the view centres it. The note becomes current (ring), and its card opens
  **without focus**, so Space still plays and you can drag edges while you read it. Play/pause stays as it was.
- Then you fix the problem with the usual tools and end the note with **⌘Return** (or right-click the note → Done, or
  the card's ✓ Done). To go on, press ⌥→ again. There's no automatic jump to the next note: the playhead never moves
  unless you asked it to.
- **Per note that's three steps of overhead**: ⌥→, read, ⌘Return.

## The transport row
```
│  ▶  01:12 / 23:40   ⚑  3 notes                                     − ───◯─── +  │
```
- **⚑ Add note**: an icon button (SF Symbol `flag`, 13 pt, 28 pt target) right after the time readout. Its tooltip is
  "Add note (M)". It's there for people who don't know `M` (A19). It does what `M` does.
- **The count chip** sits after it, only while notes are open.
The transport row only holds things about the video's time, and both of these are.

## Right-click
- **Empty lane or track**: "Add note here" makes a moment note at the pointer's time, or a section over the selection
  if the pointer is inside it.
- **A note**: "Done", "Delete".
- **The lane** (Phase 7): "Show done notes".
These sit next to the existing clip items. Nothing else is added.

## In the transcript panel
- **Making**: select words, then `M`. That gives a section note over them. With no selection, `M` makes a moment note
  at the playhead, as everywhere.
- **Showing**, kept quiet so reading stays easy: the words under an open section note get a 2 pt underline in the
  note's colour at 60 %, 3 pt below the baseline (cut words keep their strike line, and both can show). A moment note
  is a 2 × 14 pt bar in its colour in the space before the word under its time. Done notes show nothing.
- Hover over an underline or a bar shows the peek. Click opens the card (and seeks, as clicking a word does).
- Each word's name for screen readers adds ", has a note" when a note covers it.

## How notes live with everything else
| Situation | What happens |
|---|---|
| The note's range gets cut | Nothing moves. The note stays in the lane, readable and clickable. You mark it done yourself |
| A cut with a note is restored | The note stays. Notes belong to time |
| An edge is dragged across a note | Nothing happens to the note |
| ⌘Z / ⇧⌘Z | Notes are part of the edit, so every note step undoes like a cut. The status line gives the label, and the changed note scrolls into view |
| Playback | Notes never pause, slow down or pop anything up |
| Zoom | Labels follow the whole-or-nothing rule. Markers stay at least 6 pt wide. Notes too close together merge into a cluster |
| Two parts | A note belongs to one part. Removing a part takes its notes with it into the history, and undoing brings them back (`withoutPart`, `renamePart`) |
| Magic re-runs | See below. Your notes are never touched |
| Export (when it's built) | Notes are never in the video. With open notes, the status line reads "Exporting… · 3 open notes", which is a mention and never a block |

## Magic's notes
Magic leaves a note **only where it wants you to decide or listen**, never to explain a cut (the cut's hover already
does that).
- **What it flags**: two takes that are nearly as good as each other ("Two good takes. I kept the second. Listen to
  both?"), a stretch it almost cut or almost kept (an aside, a tangent), speech it couldn't make out (a mumble, noise
  over words).
- **How many**: zero is the normal answer. At most one per 3 minutes of speech, and never more than 5 per run. The
  prompt asks for this and the app enforces it (it keeps the first 5 in time order).
- **Wording**: plain, under 70 characters, and it says what to do.
- **Shape**: `by: 'magic'` with a ✦ on the marker, in yellow. Colours belong to you, so Magic picks one (any of the
  five, e.g. red) only when your own rules ask it to ("mark mumbles red"); an unknown colour is yellow.
- **Re-run** (`withMagicNotes`): Magic's old untouched notes are dropped and its new ones added, except where a new
  note overlaps one you **deleted** before (`edit.dismissed`) or one of your open notes. Notes you wrote, edited,
  recoloured or marked done are yours (`by: 'you'`) and are never touched. This is the same rule `withMagic` uses for
  cuts. The notes are part of the same single undo step, "Magic Cut".
- **Done line**: "38 cuts · 24:10 → 14:52 · 2 notes to check · ⌥→ · ⌘Z to undo". The key is said where the user is
  already reading, right when trust is lowest. With no notes, the line stays as it is today.

## What cut review will use (later, `f-cut-review-mode`)
Review needs nothing new from notes. A "No" makes an ordinary note with `about` set to the cut, empty text, and no
dialog. "Next open note" then walks the user through each one. `about` says which cut the note was about, and
`doneAt` says when it was done. Q9 for review: people may fix a cut and forget to tick its note, so the learning log
should also look for a hand edit near `about`, not only the tick.

## States
| State | Lane | Transport | Card |
|---|---|---|---|
| No video | No lane | No ⚑, no chip | — |
| Part loaded, no notes | Empty lane | ⚑ | — |
| Transcribing / no transcript | Notes work (on time) | ⚑ | Works |
| Notes, all open | Markers | ⚑ · "3 notes" | — |
| All done | Empty again | ⚑ (chip gone) | — |
| Playing, `M` | Marker pops in | Chip count +1 | Doesn't open |
| Paused, `M` | Marker | +1 | Opens, text focused |
| Going to a note | Ring on it | — | Open, unfocused |
| Magic running | Your notes stay; its notes fade in (200 ms) with its cuts | Count updates | An open card stays open |
| A Magic re-run replaces the untouched Magic note whose card is open | The old note fades out | Count updates | The card closes. If you had changed anything, the note was already yours and stays |
| Show done notes (Phase 7) | Done notes at 35 % with a ✓ instead of the colour | — | The Done circle is hollow: "Reopen note" |
| Increase Contrast | Section fill 32 %, border 100 %, label text 100 % | — | — |
| Reduce Motion | Fades only, no pop scale | — | — |

## Accessibility
- **Lane**: `role="group"`, "Notes, part 1, 3 open". Each note is a button in the Tab order, after the part's cuts
  and pauses, in time order. Its name is "Note at 1:12, by Magic: Two good takes… Return opens." or "Empty note at
  1:12", and a section reads "Note from 1:12 to 1:40…".
- **Card**: `role="dialog"` (non-modal), "Note at 1:12". When it was opened by click or Return, focus goes into the
  text field, and when it closes, focus goes back to the note. Swatches are a radio group ("Colour: Yellow"). Done and
  Delete are named buttons, each at least 28 pt.
- **Status messages** go through the status line's existing live region ("Note added", "Done · 2 notes left").
- **Not by colour alone**: the shape tells moment from section, the ✦ marks Magic, and the text and peek say the rest.
  All five note colours are at least 3 : 1 against `bg` (they're graphics, not text). Text on a note colour uses
  `onAccent`.
- **Keyboard only** works end to end: `M`, ⌥→ / ⌥←, Return (open), typing, ⌘Return (Done), ⌘⌫ (Delete), Esc.

## Keyboard
| Key | Action |
|---|---|
| `M` | Add a note: at the playhead, or over the selection. Within 0.5 s of an open moment note (playing or paused) it makes no twin; paused, it opens that one. Never inside a text field |
| ⌥→ / ⌥← | Next / previous open note |
| Return | On a focused note: open its card |
| ⌘Return | **While any card is open, focused or not: Done.** Otherwise Magic, as today |
| In the card: Return · ⇧Return · ⌘⌫ · Esc | Save and close · new line · Delete · close (keeps text) |
| In the card, text still empty: Space | Close the card and play (the note stays). With text, Space is a space |

## Components (each its own file, tested on its own)
- `src/ui/notes.js` (pure): `addNote`, `editNote`, `setDone`, `deleteNote`, `openNotes`, `nextOpen(notes, parts, at,
  dir)`, `noteAt(notes, part, t, within)`, `withMagicNotes(notes, magic, dismissed, cap)`, `preRoll(parts, cuts,
  note)`.
- `src/ui/note-layout.js` (pure): markers, sections, labels (whole-or-nothing, reusing the measure rule from
  `word-levels.js`), stacking, clusters → `[{ kind, ids, x, w, label }]`.
- `src/ui/note-view.js`: the lane's elements (pill, bar, cluster, ring, hit area) and the peek.
- `src/ui/note-card.js`: the card (text, swatches, Done, Delete, keys, placement).
- `src/ui/timeline.js`: the lane row, its right-click, the extra 24 pt of `HEIGHT`.
- `src/ui/transcript.js`: underlines and bars.
- `src/main.js`: `M`, ⌥→ / ⌥←, the ⚑ button and the count chip, status lines.
- Rust `autocut`: the optional `check` list in Claude's reply → notes (`prompt.rs`, `decide.rs`).
