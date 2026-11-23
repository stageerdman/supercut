# Cut review mode: how people review cuts quickly (research)

Author: Columbo (UX research) · 2026-11-23 · For: Jony (design) · Feature: `f-cut-review-mode`
Status: **reasoned, not observed.** No live users. It draws on how editors work in Premiere, Final Cut, Resolve and
Avid, on photo-culling tools (Lightroom, Photo Mechanic), on Descript and Gling, and on the earlier Magic Cut research
(`updates/2026-11-20 INIT - OPEN/user-interactions.md` §7, `updates/2026-11-22 NOTES - OPEN/research-notes.md` #6,
`design/user-model.md`, `design/notes.md`, `design/magic-trace.md`). Guesses are marked **(A)**.

## Summary
People will treat review as a **rhythm task, like sorting photos**: hear the join, press a key, the next one starts.
They hire it for one job: *"Let me trust Magic's cuts without watching the whole video again."* Four things decide
whether it works:
1. **A verdict can come at any moment.** The fastest reviewers answer after about 2 s, not after the full 6 s. A key
   press must count right away and move on. Waiting for the clip to end kills the rhythm.
2. **Keyboard first, using keys they already know.** ↑/↓ for previous/next cut is the convention in every big NLE.
   One key for Yes and one for No. Space keeps meaning play/pause.
3. **"No" means two things in their head:** *"this shouldn't be cut at all"* (put it back now) and *"roughly right,
   but off"* (fix later). The feature only covers the second, through a note. The first already has a key (⌫ restores
   a selected cut), and people will reach for it.
4. **The edge cases are about the window, not the cut:** cuts close together, tiny cuts, very long cuts, and the start
   or end of the video. Each one changes what the 6 seconds should contain.

## Scope
**In:** entering and leaving review, the play-around-the-cut window, the Yes/No flow, keys, going back, fixing a bad
cut (now or later), where you are and when you're done, and the edge cases Jony asked for.
**Out (and why):** the learning logs' storage and processing (engineering, covered by `design/magic-trace.md`),
watching the whole edited video start to end (a separate behaviour that normal playback already covers), reviewing
your own cuts (the adopted decision is that review covers Magic's cuts only), and screen layout (Jony's job).

## What similar tools teach
| Tool | What people do there | What it teaches us |
|---|---|---|
| Premiere / FCP / Resolve / Avid | ↑/↓ jump to the previous/next edit point. "Play around" (Premiere ⇧K, Resolve `/`) plays a pre-roll and a post-roll around the playhead (defaults are about 2 s each, adjustable). Avid trim mode loops the edit until you're happy | Editors already think in "jump to the edit, hear 2–3 s each side". ↑/↓ for cut-to-cut is muscle memory. Looping is for fine-tuning, not for judging |
| Lightroom / Photo Mechanic culling | One key for pick and one for reject. With auto-advance on, the next photo shows at once. People cull hundreds in a row and go back when they're unsure | Auto-advance after a verdict is what makes it fast. Going back has to be one key, because mistakes in a fast rhythm are normal |
| Descript "remove filler words" | A list of every "um" with play and ignore, then remove all | Tiny, similar cuts get bulk-approved. Nobody checks 40 "um"s one by one |
| Gling | Bad takes are shown struck out. People scan the list and listen to the ones that look suspicious | People judge by **text first** (what was removed) and listen only when unsure |

## Behaviour table (sorted by combined score)
| # | Behaviour | L | F | Reason |
|---|---|---|---|---|
| 1 | **Yes and move on**, often before the clip ends | 9 | 10 | Most Magic cuts are right. Speed is the whole point, and it happens at almost every cut |
| 2 | **Keys only, hands off the mouse** | 9 | 9 | 20–60 stops in a row. The user model already lists "Y/N in review" as a repeated action |
| 3 | **Replay the same cut** ("wait, what was that?") | 8 | 8 | Joins are subtle. The first listen is often lost to reading the reason line |
| 4 | **No: the cut is off, fix it later** (a note) | 8 | 6 | The feature's core. A few per video. They don't want to stop the flow |
| 5 | **Go back one cut** (pressed Yes too fast, or changed their mind) | 8 | 6 | Fast rhythms make slips. Every culling tool has "back" |
| 6 | **Peek at what was removed** (the text, or hear the removed bit) | 8 | 6 | They want to know *what* they're agreeing to, not only how the join sounds |
| 7 | **No: put it back now** (⌫ or "restore") | 7 | 5 | "That sentence was needed" is obvious and cheap to fix on the spot. Waiting for later feels silly |
| 8 | **Nudge an edge right here**, then Yes | 7 | 5 | "Almost right" cuts are common (the cut eats the first sound of a word, or leaves a breath). Earlier research flagged it as high importance |
| 9 | **Stop halfway and come back later** | 7 | 4 | Long videos, tired evening sessions. They expect to resume at the first unchecked cut |
| 10 | **Approve the rest at once** ("they're all fine") | 6 | 4 | Shows up once trust builds or review gets boring. Lower: it isn't in the MVP brief, and it risks harm |
| 11 | **Pause mid-clip to look at the frame / transcript** | 6 | 4 | Space is reflex. They look at the struck words, then go on |
| 12 | **Review only the first few cuts, then export** | 6 | 5 | The "in a hurry" user. The first 2–3 cuts decide trust (user model) |
| 13 | **Click a cut on the timeline while in review** | 5 | 3 | Mouse users jump to the one they worry about. They expect review to continue from there |
| 14 | **⌘Z right after a verdict** | 5 | 3 | The universal "oops". They expect it to undo the verdict, not a cut from 10 minutes ago |

**Watch out (low score, high harm):**
- **A meaning-changing cut gets a fast "Yes"** ("I do *not* recommend this" → "I do recommend this"). Rhythm breeds
  autopilot. The reason line and the struck text are the only defence.
- **Typing Y/N with words selected.** Today any letter typed with words selected opens the fix field
  (`writeKey` in `src/main.js:401`). If review keys are letters and a selection survives into review, "Y" would
  rewrite a word. That breaks trust quietly.
- **Re-running Magic in the middle of review.** The cuts being reviewed are replaced (`withMagic`), so verdicts and
  progress no longer match. They need to be told, not silently reset.
- **Bulk approve** (#10) hides exactly the cut that matters. If it's ever added, it should never be the default.

## Deep dives

### 1 · Yes and move on (L9 F10)
- **Moment:** evening, MacBook, right after Magic's "38 cuts" line. Leaning back, one hand on the keys.
- **Trigger:** "Let me check what it did before I post this."
- **Thoughts:** "Fine… fine… fine. Oh, that one's clean. Next." By cut 5: "I don't need the whole 6 seconds."
- **Emotions:** wary at the start, relaxed by cut 5 if the first few are good, bored by cut 30.
- **Expectations:** the clip starts **at once** (under ~150 ms after the key). Pressing Yes at any moment ends that clip
  and starts the next one. A count that moves ("7 of 38").
- **Success:** "That took four minutes and I trust the whole thing."
- **Friction and fears:** a hitch or a black frame when seeking to the next window (it reads as "is it broken?").
  Having to wait for the clip to end. Auto-advance that moves on *without* a verdict (they'd feel they missed one).
- **Product insight:** a verdict mid-clip is the main path, not an edge case. After the clip ends with no verdict, it
  should **wait**: no looping, no auto-advance. Pre-loading the next window (the timeline already pre-loads at cuts,
  `design/timeline.md` "Playback over cuts") matters more than anything visual.

### 2 · Keys only (L9 F9)
- **Moment:** the same session. The mouse is far away, or it's a trackpad they don't want to aim with.
- **Thoughts:** "Which key was it? Y… for yes, obviously."
- **Expectations, by habit:**
  | Want | Keys people will try first | Why |
  |---|---|---|
  | Yes, next | **Y**, then Return, then ↓ | Y/N is the plain-words mental model (and in the user model). Return = "OK". ↓ = "next" in NLEs |
  | No | **N**, then ⌫ | N pairs with Y. ⌫ is this app's restore toggle, so it means "put it back" (see #7) |
  | Replay | **R** or Space after the clip has ended | Space after the end = "again", Space mid-clip = pause |
  | Previous / next cut, no verdict | **↑ / ↓** | Premiere, FCP and Resolve all use ↑/↓ for previous/next edit. Free in this app today |
  | Leave review | **Esc** | Every mode on the Mac |
  | Note | **M** | Already the note key. Some will press M instead of N (they're neighbours, and both make a note) |
- **Conflicts in this app today:** ←/→ are one bit, and on a focused edge they nudge it (keep that: it's the nudge,
  #8). ⌥←/⌥→ go to the next open note. Letters edit words when words are selected (Watch out). ⌘Return finishes a note.
- **Product insight:** the keys must be **visible while reviewing** (people forget them by the second session). Review
  should own Y/N/R/↑/↓ and drop any word selection when it starts. ⌫ and M should keep their app-wide meaning, so
  nothing has to be relearned.

### 3 · Replay the same cut (L8 F8)
- **Moment:** they were reading the reason line ("Magic: earlier take · kept “so today we…”") and missed the join.
- **Thoughts:** "Wait, did it cut a word there? Again."
- **Expectations:** one key, from the start of the same window. Not from where they paused.
- **Friction:** replay that resets their verdict, or replay that plays the *removed* part (that's a different wish,
  #6).
- **Product insight:** replay and peek are two keys or two clear actions. Replay = the edited version again.

### 4 · No: fix it later (L8 F6)
- **Moment:** cut 12 sounds wrong, but they're on a roll.
- **Thoughts:** "Not now. Remember this one."
- **Emotions:** a small jolt of distrust, then relief that it's noted.
- **Expectations:** no dialog, no typing. The next cut starts. Afterwards there's a list to work through. `design/notes.md` already says
  a No makes an ordinary note with `about` set to the cut, and ⌥→ walks through them.
- **Success:** "When I finished, I had exactly the 3 bad ones to fix."
- **Friction and fears:** a typing box after each No. Not knowing whether No *already changed* the cut. (Did it put
  the words back? Earlier research assumed No = restore, and some users will too.)
- **Product insight:** No has to say what it did, in a few words, where they're looking ("Noted, fix later · ⌥→").
  The end line should lead straight into the notes loop. **(A)** People will fix a cut and forget to tick its note
  (Notes Q9). The learning log should already use `outcome()`, not the tick.

### 5 · Go back one cut (L8 F6)
- **Moment:** they hit Y and heard something odd as the next clip started.
- **Thoughts:** "No no no, the one before."
- **Expectations:** ↑ (or ⌘Z) goes back to the previous cut, shows its verdict, and plays it again. They can then
  change the verdict.
- **Friction:** going back that doesn't show what they said last time. ⌘Z that undoes something else entirely
  (a cut, a Magic run).
- **Product insight:** a verdict must be changeable. Changing Yes → No later should make the note. Changing No → Yes
  should remove the note only if it's still empty and untouched. Whether ⌘Z undoes a verdict is an open question (Q2).

### 6 · Peek at what was removed (L8 F6)
- **Moment:** a cut where the join sounds perfect, but they don't know *what* went.
- **Thoughts:** "Sounds smooth… but what did it take out? Was it the bit about pricing?"
- **Expectations:** first the **text**: the struck words in the transcript, scrolled into view and lit, plus the
  reason line. Then, if unsure, one key to hear the removed part.
- **Product insight:** most users judge by text first, the way they do in Gling and Descript. The transcript panel
  should follow the cut being reviewed. Hearing the removed part is the second step, and for long cuts it's too
  long to play in full (see edge cases).

### 7 · No: put it back now (L7 F5)
- **Moment:** "It cut the punchline." Obvious and unarguable.
- **Thoughts:** "Just undo that one. Why would I leave it for later?"
- **Expectations:** ⌫ (their restore habit) brings the words back at once. Replay plays it with them back in. The
  next press moves on.
- **Product insight:** don't block ⌫ in review. A restore during review is the strongest "no" there is, and the trace
  already records it as `restored` without extra work. It should count as reviewed, no note needed.

## Edge cases (Jony's three, and three more)
**Cuts close together.** With 3 s each side, any other cut whose edge falls within 3 s of **edited** time lands in the
same window. This is common for filler cuts ("um" every few seconds).
- What people expect: to judge **what they hear**. If they hear two joins, the question is about both.
- Hearing the same seconds twice, once per cut, confuses them ("am I on 7 or 8?").
- Insight: play the window as the viewer will hear it (every cut skipped, yours too). Join near neighbours into one stop
  ("Cuts 7–8 of 38"), and cap the group at about 3 cuts so a No still points somewhere. A No on a group is
  ambiguous for learning. `outcome()` sorts it out later (only the cut that was really changed shows up as
  `adjusted`/`restored`), so the log doesn't need the user to say which one.

**Very short cuts** (a 0.2–0.5 s "um" or breath).
- The join is all there is to hear. These are the most numerous, the least risky, and the most boring.
- They won't want 3 s + 3 s for each. They'll press Y within a second (#1 covers it if a mid-clip verdict works).
- A cut shorter than a few frames can't be heard at all. People will say Yes blindly, or wonder what it is.
- Insight: early verdicts handle most of this. Bulk approve (#10) is the pressure valve to watch, but not MVP.

**Start and end of the video (and of each part).**
- A cut at 0:00 or running to the end has no "before" or no "after". Most of those are the user's own head and tail
  trims, so they're out of scope. Magic can still cut a false start at the very beginning.
- Expect: the window keeps its length but shifts (0 s before + about 6 s after; or about 6 s before, then it stops).
  A plain "Start of video" / "End of video" so the silence after isn't mistaken for a broken player.
- With two parts, a window can cross from part 1 into part 2. It should play across in play order, just as the viewer
  will hear it.

**Very long cuts** (a whole retake, 30–60 s).
- 6 s tells them nothing about what was removed. They judge from the reason line ("earlier take · kept “…”") and the
  struck text.
- Hearing all of the removed part is too long. **(A)** They'd want to hear its first couple of seconds, enough to
  recognise the take.

**Cut sitting right next to one of your own cuts.** The window already includes the user's cut, and it plays as one
join. That's fine because it's what the viewer hears. But a No here may really be about the user's own cut. **(A)**
Rare.

**Re-run Magic, or undo the Magic step, mid-review.** The reviewed cuts vanish or change. Expect a plain line ("Magic
ran again, 12 new cuts to check") and progress that starts from the new run. Never stale "7 of 38".

## Flow, as people imagine it (not a screen design)
1. Magic finishes. "38 cuts · … " and the obvious next step is **Review**. They press it or its key.
2. The first cut's window plays at once. Count, reason line, and the struck words lit in the transcript.
3. Y (any time) → next. N → noted, next. ⌫ → put back, counts as reviewed. R → again. ↑/↓ → move without a verdict.
4. They leave with Esc any time. Next time they resume at the first unchecked cut.
5. End: "38 checked · 3 to fix · ⌥→" and the way to export. Unchecked cuts never block export; they're only mentioned
   there.

## Key insights
1. **A mid-clip verdict is the main path.** Design for a 2-second decision. The 6-second window is the most it plays,
   not the least.
2. **Use habits people already have:** Y/N for the plain-words verdict, ↑/↓ for previous/next cut, Space play/pause,
   ⌫ restore, M note, Esc leave. Nothing new to learn except Y/N.
3. **"No" is two jobs.** Restore now (⌫) and fix later (N → note). Both count as reviewed. Say what happened every
   time.
4. **Text first, sound second.** Lighting the struck words and the reason line does more for trust than a longer
   clip.
5. **Window = what the viewer hears.** Group near neighbours, shift the window at the ends, and play across parts.
6. **Order:** `design/magic-trace.md` suggests least-sure cuts first. **(A)** Jumping around the story costs context:
   each cut needs a moment to re-orient ("where are we?"). Time order is what NLE users expect from ↑/↓.

## Open questions
| # | Question | How to check |
|---|---|---|
| Q1 | Least-sure first, or time order? Least-sure first spends attention where it's needed but loses the story's thread | Give 3 users both orders on the same video and time them. Ask which felt sure |
| Q2 | Does ⌘Z in review undo the last verdict (and its note)? Verdicts live outside history today (`magic-trace.md`) | Watch what users expect after a wrong N |
| Q3 | Is 3 s + 3 s right, or do people want less before (2 s) and more after? NLE defaults are about 2 s each | Log when verdicts come (seconds into the window) |
| Q4 | When the clip ends with no verdict, wait, or loop? (Reasoned: wait) | Watch 3 users. Count replays |
| Q5 | Is an edge nudge inside review (← → on a focused edge) needed in the MVP, or is "N, fix later" enough? | Count N notes that end up as small edge moves (`adjusted` with small `ds`/`de`) |
| Q6 | Group cap: 3 cuts, or by window length? | Run it on a real filler-heavy talk and count the stops |
| Q7 | **(A)** How many people review at all past cut 5? | Log how far review gets per session |
