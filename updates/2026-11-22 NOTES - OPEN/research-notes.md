# Research: how people will create, find, edit, resolve and use editing notes

Author: Columbo · 2026-11-22 · For: Jony (design), Pixel. Feature: f-notes. Next feature that depends on it:
f-cut-review-mode (a "No" in review leaves a note to fix by hand later).
Read alongside `design/user-model.md`, `design/timeline.md`, `design/timeline-words-by-zoom.md`, `design/edit-model.md`.

Everything here is **reasoned, not observed**. No users were watched. Facts about other apps come from memory, not a
live check. Assumptions are marked **(A)**.

## Summary

People will hire notes for one main job: **"Remember this spot so I can deal with it later, and don't let me forget."**
A note is a to-do pinned to a moment, not a comment for someone else (this is a solo app). Three things follow:

1. **Making a note must cost almost nothing, mid-playback.** The most common note is made while listening, with
   no text at all, the way editors drop markers with `M` in Premiere, Resolve and Final Cut. Text is optional and
   can come later.
2. **Notes are only worth making if they come back to you.** People need "next open note", a visible count of open
   ones, and a gentle reminder before Export. Without a way back, notes become clutter and people stop making them.
3. **"Resolve" means "done"**: the note leaves the timeline but isn't lost. "Delete" means "this was a mistake".
   People will mix the two up unless resolve is the obvious action and delete is the quiet one.

AI notes are the riskiest part. Used well, they point at the 2–5 places Magic wasn't sure about. Used badly (a note
on every cut), they become noise, and people learn to ignore *all* notes, their own included. Magic's reasons
already show on cut hover; notes shouldn't repeat them.

Notes belong to **source time**, like cuts. Because the timeline keeps cuts in place, a note never has to move when
something is cut. A note on a cut is usually *about* that cut ("join too tight"), so it must stay visible and
clickable when a cut block is right above it.

## Scope

**In (this stage):** making a note (at a moment, or over a section) from the timeline and the transcript panel;
seeing and reading notes in the lane below the track; finding them again (next/previous, count, before export);
editing text and colour; resolving and deleting; notes that Magic adds; how notes behave with cuts, Magic re-runs,
undo and zoom; what cut review will need from notes.

**Out, and why:**
- Sharing notes / comments with other people (Frame.io style): the user is a solo creator; no accounts or sharing exist.
- Exporting notes as chapters, YouTube timestamps or Final Cut markers: a real wish for some (see watch-out), but a
  different job (publishing, not editing). Revisit after export grows options.
- The cut-review learning logs (6-second clips): engineering and privacy, not note behaviour. Only the hand-off
  "No → note → fixed → resolved" is covered here.
- Notes read by Magic as instructions: covered as an expectation and open question, not designed.
- Rich text, attachments, mentions, threads: nobody needs them in a solo to-do pinned to time.

## How people do this in similar apps today (from memory, not checked live)

| App | How it works | Habit it leaves |
|---|---|---|
| **Final Cut Pro** | `M` adds a marker at the playhead; `M` again (or double-click) opens it for text. A marker can be a **to-do**; ticking "Completed" turns it green. A timeline index lists markers. | `M` = marker. "To-do vs done" is a known idea. |
| **Premiere Pro** | `M` adds a marker, even while playing. Double-click: name, comment, colour, duration (a range). A Markers panel lists them; there are next/previous marker keys. | Markers while playing, ranges by duration, colour picked from ~8 fixed colours. |
| **DaVinci Resolve** | `M` adds a marker; `M` again (or Ctrl+M) edits it; colours from a fixed set; drag a marker with ⌥ to give it a duration; a list in the Index. | Colour as the user's own category. Most people never change the default colour **(A)**. |
| **Frame.io / Vimeo review** | Comments at a timestamp or over a range; list next to the video; a **checkmark resolves** a comment; "show completed" filter. | Resolve = tick it off; resolved items hidden but recoverable. |
| **Descript** | Comments on a text selection; resolve. | Notes on *words*, not only on time. |
| **Google Docs** | Comments on a selection; Resolve hides it; history keeps it. | Resolve is not delete. |

Two habits point the same way: **`M` at the playhead** for "mark this", and **a tick** for "done". People coming
from any editor will press `M` first. **(A)** Most of our users (CapCut background) never used markers at all and
will look for a visible button or a right-click item.

## Behaviour table

L = how many users will do it. F = how often in a session, for those who do. If unsure, I picked the lower score.

| # | Behaviour | L | F | Reason |
|---|---|---|---|---|
| 1 | **Drop a note while playing** ("fix this later"), often with no text | 8 | 8 | Playing through is the main review activity; spotting a problem and not wanting to stop is constant. Editor habit (`M`). |
| 2 | **Glance at the lane and read a note** (hover or click to see its text) | 8 | 8 | Every note made is read again at least once; AI notes are read first. |
| 3 | **Jump to the next open note, fix it, tick it done** | 7 | 7 | The payoff of #1. People with notes will do it in a run, several times per session. L7: some never come back to notes. |
| 4 | **Mark a section** ("this whole bit drags", "check this take") | 7 | 7 | Problems are often stretches, not moments. Select-then-act is already how cuts work, so it's natural. |
| 5 | **Read and act on Magic's notes after a run** | 7 | 7 | Only if Magic adds notes. Right after Magic, trust is lowest and people look for "where should I check?" |
| 6 | **Say "No" in cut review and come back later** (future feature) | 7 | 7 | The core of cut review. Each "No" is a note. Several per video for those who review. |
| 7 | **Type the text right away** (when paused) | 7 | 5 | When paused, people describe the problem ("too tight", "say it again?"). Short, 2–5 words **(A)**. |
| 8 | **Make a note on a cut** ("join sounds off") | 7 | 5 | Most problems after Magic are at joins (user model A7). The note sits under a cut block. |
| 9 | **Delete a note** (made by mistake, or an AI note they disagree with) | 7 | 4 | Mis-presses of `M`, and AI notes they don't want. |
| 10 | **Edit a note's text later** | 6 | 4 | Adding text to an empty marker, or updating it after a partial fix. |
| 11 | **Make a note from the transcript panel** (select words → note) | 6 | 5 | Readers spot problems in the text ("I said this twice"). They expect to act where they're looking. |
| 12 | **Leave notes open and export anyway** | 6 | 3 | In a hurry, or the notes were ideas for "next time". They must not be blocked. |
| 13 | **Come back the next day and continue from the notes** | 6 | 3 | Long videos are edited over two evenings; notes are the "where was I". |
| 14 | **Write a note as an instruction to Magic** ("cut this", "keep this joke") and run Magic again | 6 | 3 | Natural for someone who already writes rules for the AI. They'll expect Magic to read it. |
| 15 | **Note a moment for work outside the app** ("add B-roll", "zoom in here", "title card") | 5 | 4 | Many creators finish in another editor or add graphics later. Notes become a shot list. |
| 16 | **Change a note's colour** | 5 | 3 | Power users (Resolve/Premiere habit) use colours as categories. Most keep the default **(A)**. |
| 17 | **Look for resolved notes again** ("what did I fix?" / "I ticked the wrong one") | 4 | 2 | Rare, but needed when a tick was a slip. |
| 18 | **Undo a deleted or resolved note with ⌘Z** | 5 | 2 | ⌘Z is a reflex here (user model). Rare, but expected to work. |
| 19 | **Drag a note to move it or change its section** | 5 | 2 | Editors drag markers. Rare: most notes are dropped roughly and don't need precision. |
| 20 | **Many notes in one spot / zoomed out** (overlapping notes) | 4 | 3 | Sections overlap; Magic notes near user notes; a 20-minute fit view squeezes them. A condition more than a choice. |
| 21 | **Expect notes in the exported video** (fear) or **as chapters** (wish) | 4 | 2 | First-time users wonder if notes are "burned in"; YouTubers want chapters. |

### Watch-out list (low score, but can break trust or cause harm)

- **AI note flood.** If Magic leaves a note per cut (30 notes on a 20-minute video), people stop reading them, and
  then also stop trusting their own notes because the lane is noise. One run like that can kill the feature.
- **Resolve and delete feel the same.** If ticking a note makes it vanish with no way back, people fear ticking.
  If deleting and resolving look alike, a slip loses a note with text in it. Both must be undoable.
- **Notes burned into the export.** A first-time user who sees coloured notes on the timeline may worry they appear
  in the video. One plain line ("Notes stay here, they're never in your video") the first time a note is made
  removes the worry.
- **A note hidden under a cut block.** The cut block covers strip + track. A note below the track must stay
  clickable when a cut is right above it, or the "join sounds off" note becomes unreachable exactly where it matters.
- **Magic deletes my note.** If a Magic re-run replaces AI notes, it must never touch notes the user wrote, edited or
  resolved (same idea as `withMagic` keeping cuts you touched).
- **Notes that silently do nothing** (#14). A user writes "cut this" in a note, runs Magic, and nothing changes.
  They blame Magic. Either Magic reads notes, or the app makes clear notes are for you only.
- **`M` stealing typing.** `M` must not fire while the user is typing in the transcript fix field or in the rules box.
- **Lost note text.** Clicking away from a note being typed must keep the text, never drop it.

## Deep dives

### 1 · Drop a note while playing (L8 F8)

- **Moment:** evening, MacBook, headphones, right after a Magic run or after trimming the start and end. Playing at
  1×, eyes on the video or the transcript.
- **Trigger:** they hear something: a join that's too tight, a stumble Magic left in, a sentence they want to redo,
  a spot for a graphic.
- **Thoughts:** "That's off. I'll get back to it — I don't want to stop now." / "Where was that again?" (if they don't
  mark it, 30 seconds later they've lost it).
- **Emotions:** a small spike of irritation at the problem, then relief once it's "parked". Calm flow if marking
  didn't break playback; frustration if it paused or popped up a box.
- **Expectations:** one key (`M`, from any editor) or one visible button. Playback **keeps going**. The note appears
  at the moment they pressed (they accept it's ~0.5 s late, reaction time **(A)**). No text box in the way. Under a
  second, one step.
- **Success:** "Tap, keep listening, it's there when I come back."
- **Friction and fears:** a text field that grabs focus and pauses the video. Not knowing whether it worked (no
  visible mark). The note landing after the problem, so jumping back to it starts too late. Not finding the button
  at all (CapCut users don't know `M`).
- **Product insight:** a note can be **empty**: a marker is a valid note. Making one while playing should not pause or
  open a field; a visible control plus `M` both work. Because of reaction time, jumping to a moment note should play
  from a little **before** it. Text is added later (#10) or when paused (#7).

### 2 · Glance at the lane and read a note (L8 F8)

- **Moment:** any time the timeline is visible, often right after Magic or when opening the project again.
- **Trigger:** a coloured mark under the track catches the eye, or they're looking for "the one about the intro".
- **Thoughts:** "What did I write there?" / "What's this orange one — did the AI put that?"
- **Emotions:** curious, a bit wary for AI notes; neutral for their own.
- **Expectations:** hovering shows the text at once (like a cut's hover reason); a click opens it to edit.
  They can tell **who** made it (me or Magic) without opening it, and whether it's a moment or a section by its
  shape. Zoomed out, they still see *that* there's a note, even if not its text.
- **Success:** "I can read my notes without clicking around, and I know which are mine."
- **Friction and fears:** text that only shows after clicking (slow to scan). Marks so thin they can't be hit. Two
  notes on top of each other, one hiding the other. A note that looks like a cut (same colours as cut hatch).
- **Product insight:** reading must be cheaper than opening: hover (and focus) shows the text. Who made it must show
  in shape or label, not only colour (Magic's coral already means "AI cut"). Zoomed out, notes need the same
  "never invisible" rule cuts have (a minimum width/hit area), and overlapping notes need a way to reach each one.

### 3 · Jump to the next open note, fix it, tick it done (L7 F7)

- **Moment:** the second half of a session, or the next evening. They have 5–15 notes and want to work through them.
- **Trigger:** "Okay, now let me fix the things I marked." Or the reminder at Export.
- **Thoughts:** "Next one… this was the tight join. Drag, listen. Good. Done. Next."
- **Emotions:** a satisfying rhythm when it works, like ticking a list. Anxiety if they can't tell how many are left.
- **Expectations:** a key or button for next/previous **open** note (resolved ones skipped). The playhead goes a bit
  before it and the view scrolls there. The note's text is visible while they fix. Ticking it done is one click or
  one key, and it then leaves the lane. A count of what's left ("3 notes") somewhere quiet.
- **Success:** "Zero open notes. I know I didn't miss anything." Then Export with a clear conscience.
- **Friction and fears:** having to scan the timeline by eye to find the next one. A resolved note still cluttering
  the lane. Resolving the wrong note (the one next to it). No way back after a slip.
- **Product insight:** this loop is the feature's reason to exist. **Next open note**, an **open count**, and
  **resolve as the main action on a note** (delete second, quieter) matter more than colours. Resolved notes leave the
  lane but stay recoverable (and undo brings one back). This loop is also exactly what cut review needs (#6).

### 4 · Mark a section (L7 F7)

- **Moment:** paused, or after replaying a stretch. Usually a slow part, a take they're unsure about, a run of
  stumbles.
- **Trigger:** "This whole bit is too long" / "Not sure this take is better than the first."
- **Thoughts:** "I don't want to cut it yet. Just mark it." They select the stretch the way they'd select to cut, then
  look for "note" instead of ⌫.
- **Emotions:** thoughtful, undecided. They're deferring a decision, which feels responsible, not lazy.
- **Expectations:** drag across the track (or select words in the panel), then the same note action as a moment
  note (`M`, button, right-click). The note spans exactly the selection. The selection chip that today says **Cut ⌫**
  could also offer the note **(A)**.
- **Success:** "I can see the whole stretch I was unsure about, and come back to decide."
- **Friction and fears:** a section note that looks like a cut or a selection, so they think something was cut.
  Section notes that stack and hide each other. Having to make a moment note and then stretch it.
- **Product insight:** one action, two results: no selection → a moment note at the playhead; a selection → a section
  note over it. Same in the timeline and the transcript panel. A section note must look clearly unlike a cut and unlike
  a selection; living in its own lane below the track does most of that.

### 5 · Read and act on Magic's notes after a run (L7 F7)

- **Moment:** right after Magic finishes. The user model says trust is fragile here and the first cut they hear
  decides it.
- **Trigger:** new notes appear with the cuts. "What is it telling me?"
- **Thoughts:** "Oh, it wasn't sure about these two takes — let me check." Good case. Bad case: "Why are there
  thirty of these? I'm not reading all that."
- **Emotions:** with a few, useful notes: reassured, like a careful assistant flagged its doubts. With many: overwhelmed,
  then dismissive.
- **Expectations:** Magic's notes are **few** and **specific**: what to check and why, in plain words ("Two good takes
  here; I kept the second. Listen to both?", "Background noise from 3:10 to 3:40"). They want to accept (tick) or
  dismiss (delete) quickly. They expect a new run not to bury their own notes.
- **Success:** "It pointed me to the three places that actually needed me."
- **Friction and fears:** a note on every cut (duplicating the cut's hover reason). Vague notes ("check this").
  AI notes they dismissed coming back on every run. Their own notes being changed or removed by Magic.
- **Product insight:** Magic should leave a note **only where it wants the user to decide or check**, not to explain a
  cut (the hover reason already does that). A tight cap per video length helps **(A)**. On a re-run, untouched AI
  notes are replaced; any note the user wrote, edited or resolved is kept. Dismissed AI notes shouldn't come straight
  back for the same spot **(A)**.

### 6 · Say "No" in cut review and come back later (L7 F7, future feature)

- **Moment:** cut review: the app plays ~6 s around each cut, the user presses Yes or No. Quick, rhythmic, several
  per minute.
- **Trigger:** a cut that sounds wrong but they don't want to stop the review flow to fix it.
- **Thoughts:** "No. Not now, I'll fix that after." They may want to say *why* ("too tight", "cut a word"), but most
  won't type mid-review **(A)**.
- **Emotions:** in flow; any typing breaks it. Afterwards: a clear list of what's left feels great.
- **Expectations:** No leaves a note on that cut, at once, with no dialog. Later, "next open note" takes them to each
  one. When they've fixed it by hand, they tick it done.
- **Success:** "Review was fast, and afterwards I had a to-do list of exactly the bad cuts."
- **Friction and fears:** a typing box after each No. Notes from review looking different from or living elsewhere
  than other notes (two lists). Having to remember which notes came from review.
- **Product insight:** review notes are ordinary notes (same lane, same next/resolve), maybe pre-filled with a short
  label like "Review: fix this cut". The resolve moment matters to the learning log ("AI cut → user fixed it"):
  cut review will want to know which cut a note belongs to and when it's resolved. **(A)** People won't always tick a
  note after fixing; the log shouldn't depend only on the tick.

## How notes relate to cuts, the transcript and Magic (brief asks)

These follow from the behaviours above; each is a user expectation, not a design.

| Situation | What people expect |
|---|---|
| A note's section is then cut | The note stays where it is (the timeline keeps cuts in place) and stays readable/clickable under the cut block. The note was probably *about* cutting it; they resolve it themselves. |
| A cut with a note is restored | The note stays. Notes don't belong to cuts; they belong to time. |
| An edge is dragged through a note | Nothing happens to the note. |
| Magic re-runs | User-touched notes untouched; Magic's untouched notes replaced. Cuts and notes follow the same "yours stays" rule. |
| ⌘Z | Making, editing, resolving and deleting a note are undo steps like cuts ("Added note", "Resolved note", "Deleted note"). |
| Transcript panel | People select words and expect to add a note there. They'd like to see that a word range has a note (a subtle mark), but the reading surface must stay clean **(A)**. |
| Playback | Notes don't stop or slow playback. The playhead passing a note can show its text briefly **(A)** — useful in review, distracting otherwise; check. |
| Export | Notes never appear in the video. Open notes earn one quiet mention at Export ("2 open notes"), never a block. |
| Second part (two videos) | A note belongs to one part, like a selection, and moves with it if parts are reordered or removed and restored. |

## Key insights for Jony

1. **A note is a to-do pinned to time.** Optimise for "drop it fast, find it again, tick it off". Colour and
   formatting come last.
2. **Empty notes are normal.** Making a note while playing must not pause or demand text. `M` plus a visible control.
3. **One action, two kinds:** no selection → a moment note at the playhead; a selection → a section note over it.
   The same from the timeline and the transcript panel.
4. **The way back is the feature:** next/previous open note, a quiet open count, and a mention at Export.
5. **Resolve is the main action, delete the quiet one.** Resolved notes leave the lane but can be found again; both
   are undoable.
6. **Magic's notes must be rare and actionable** and must never touch notes the user owns. Don't repeat cut reasons
   as notes.
7. **Who made it** must be visible without colour alone (Magic's coral already means "AI cut").
8. **Notes live in source time**, outside cuts: cutting, restoring or dragging edges never moves or deletes a note,
   and a note under a cut block stays reachable.
9. **Cut review will reuse this loop as is.** Its "No" is a note; its learning log needs to know which cut a note was
   about and when it was resolved.
10. **Say once that notes are private to editing** and never exported.

## Open questions and assumptions to check

| # | Question / assumption | Quick check |
|---|---|---|
| Q1 | (A) Most notes are made while playing and have no text | Count notes with/without text, and made while playing vs paused, in a test build |
| Q2 | Should Magic read notes (e.g. "cut this" → act on it)? It changes what people write in them (#14) | Product call for Pixel; then watch 3 users after their first note |
| Q3 | What exactly should Magic leave notes about, and how many at most? | Run Magic on 3 real talks, list every place it was unsure, ask 3 users which they'd want flagged |
| Q4 | (A) Most users never change a note's colour; how many colours earn their place? | Count colour changes per session |
| Q5 | Do CapCut-background users find the note action without `M`? | Watch 3 first-time users asked to "mark this for later" |
| Q6 | Should a note's text pop up as the playhead passes it? | Try both in review; ask if it helped or distracted |
| Q7 | Do people want resolved notes visible at all (a "show done" toggle), or is undo enough? | Ask after a week of use; count how often anyone looks |
| Q8 | (A) Reaction time puts moment notes ~0.5 s late; how far before a note should "jump to note" land? | Log the gap between `M` and the nearest word start / cut edge |
| Q9 | (A) After fixing a review "No", people forget to tick the note | Compare hand edits near review notes vs ticks in a test build |

Suggested additions to `design/user-model.md` (Jony's file): Q1, Q4 and Q5 as assumptions; "a note is a to-do pinned
to time" as the reasoned job.
