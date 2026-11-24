# SuperCut — user model

Living file. Every screen is checked against it. Source: `updates/2026-11-20 INIT - OPEN/user-interactions.md` (Columbo). No live interviews yet — everything below is **reasoned, not observed**.

## Who
- **Main user (guess):** a solo creator who talks to camera, on a MacBook, often in the evening right after recording. Tired, wants it done tonight, afraid the AI cuts something needed.
- Also: course makers (want no skipped content), podcasters (long files, separate mic), people in a hurry (1–3 min clips, will skip review).
- Habits they bring: Descript (text = video, struck words), CapCut / Final Cut (player on top, timeline below, Space plays, drag to trim), Gling (AI keeps the last take).

## Goals, ranked (how often × how much it matters)
1. **Get a clean, postable video tonight** — drop → Magic → export.
2. **Trust every cut** — see it, check it, undo it.
3. **Throw away obvious junk myself** (start/end, a phone call) before the AI.
4. **Not wait blindly** — honest progress, freedom to walk away.
5. **Better sound** from a separate mic (fewer users, but every time).
6. **Teach the AI my taste** (rules) — mostly after a first disappointing run.

## What they do (expected, not yet observed)
- Common path: drop file → Space to check it → drag start/end in while transcribing → walk away → Magic → listen to the first 2–3 cuts → review or export.
- Repeated: Space, ⌘Z, edge drags, Y/N in review.
- Hesitations: "Is it doing something?", "Did it cut too much?", "What leaves my Mac?"
- Ignore: settings, export options, anything that isn't on the straight line.
- Drop-offs (risk): unannounced model download, technical Claude error, first cut they hear is wrong.

## Observed (the user's first real test, 2026-11-20)
- A thin bar near the video reads as **the video's own progress**. Background work needs a label and its own place.
- Editor shortcuts that aren't explained (J/K/L) feel **random**. Space + arrows are what they reach for; arrows = the smallest step.
- A primary action that's hidden "until it works" reads as **missing**. Show it; say plainly when it isn't ready.
- With a transcript on screen, the first thing they try is **cutting words** (select + Backspace), Descript-style.
- CapCut is the reference for clips / timeline; the two fixed slots feel off (parked until the timeline update).
- (2026-11-22) Words on the timeline strip read well zoomed far in; zoomed out they're **cut off mid-letter and
  unreadable**. They want whole words, then phrase starts, then no text; and cuts as **their own blocks** on top.

## Assumptions (guesses — check them)
| # | Assumption | Quick check |
|---|---|---|
| A1 | Two videos = two parts of one recording, played in order | Confirmed by Pixel as working assumption |
| A2 | Most people press Magic before writing any rule | Watch 3 first-time users |
| A3 | Pre-cuts are rough (start/end + one middle chunk), not precise | Count edits per session in a test build |
| A4 | Users trim while transcription runs | Log edits before transcript is ready |
| A5 | Dark UI fits (editor habit, video pops) | Ask 3 users after Phase 1 |
| A6 | A window ≥ 1100 × 700 is typical (MacBook, often full screen) | Log window sizes in a test build |
| A7 | After Magic, the most common hand edit is nudging a cut's edge (too tight / too loose), not new cuts | Count edge drags vs new cuts in a test build |
| A8 | Nobody misses a razor / `S` split once select + ⌫ cuts a range | Watch 3 CapCut users make their first hand cut |
| A9 | Struck-through text stays readable after a Magic run that cuts ~40 % (no folding needed) | Ask 3 users to read back the kept story |
| A10 | Fixing words is rare (a few per video, names and jargon), so one gesture with no mode is enough | Count fixes per session |
| A14 | 32 / 4 points per word are the right lines for words / phrases / no text (`design/timeline-words-by-zoom.md`) | Pinch through a real 20-min talk; note where text first feels crowded or sparse |
| A15 | Covering cut words with the block loses nothing: people read cut words in the panel, not on the strip | Ask 3 users after a Magic run where they look to see what was cut |
| A16 | Most notes are made while playing and have no text (research Q1) | Count notes with / without text, made playing vs paused |
| A17 | Most people never change a note's colour, so 5 colours are enough (Q4; red added on request, 2026-11-23) | Count colour changes per session |
| A18 | `M` lands ~0.5 s late, so going to a note 1 s early is right (Q8) | Log the gap between `M` and the nearest word start / cut edge |
| A19 | CapCut users find the ⚑ button without knowing `M` (Q5) | Ask 3 first-time users to "mark this for later" |
| A20 | Most speech the transcript misses is fillers and false starts, not real words (research Q1) | Tally every unheard bit on 3 real talks |
| A21 | People cut unheard speech far more often than they write into it (Q2) | Count ⌫ vs writes on unheard bits |
| A22 | People add a word by clicking a neighbour and retyping it with the new word (Q4) | Watch 3 users add a missed word |

A10 still holds for *fixing text*; it doesn't hold for *dealing with unheard speech*, which we expect to be frequent.

## Missed words (2026-11-22, reasoned)
- Two jobs, in this order: **cut** the speech the transcript didn't write down (ums, false starts), then, rarely,
  **write** a missed word that matters ("not"). Silence and unheard speech must never look alike: cutting "a pause"
  that was really a sentence is the worst outcome. Spec: `design/missed-words.md`.

## Notes (2026-11-22, reasoned)
- The job: **"Remember this spot so I can deal with it later, and don't let me forget."** A note is a to-do pinned
  to time, for yourself. The loop is drop it while listening → next open note → fix → Done. Spec: `design/notes.md`.

## Cut review (2026-11-23, reasoned)
- The job: **"Let me trust Magic's cuts without watching the whole video again."** A rhythm like sorting photos:
  most answers come ~2 s into a window, by key. "No" means two things: put it back now (⌫) or fix later (N → red
  note). People judge by the struck text first, the sound second. Spec: `design/cut-review.md`.

| # | Assumption | Quick check |
|---|---|---|
| A23 | 3 s before + 3 s after the join is the right window (research Q3) | Verdicts store `after`; look where answers land |
| A24 | Time order beats least-sure first (Q1) | Time 3 users on both orders of the same video |
| A25 | Most people stop reviewing after a handful of cuts once trust builds (Q7) | Checked stops per session in the trace |
| A26 | "N, fix later" plus mouse drags is enough; no nudge keys in review (Q5) | Count Nos that end as small `adjusted` edits |
| A27 | Framing the clip at 80 % of the timeline width is close enough to judge, with enough context around it | Count hand zoom-outs right after a frame |
| A28 | Three choices (All, Magic's, Not approved yet) cover how people narrow a review | Ask after a review of a hand-cut video |

### Observed: the user's first try of review (2026-11-23)
What they asked for after trying it (the "why" after each is my reading, a guess):
- **The timeline zooms in on the cut under review.** (Guess: a cut is a few pixels on a zoomed-out timeline.)
- **No accidental exits** (Esc, click-away): the Review cuts button becomes "Stop review" and is the only way out.
- **A visible Play button** that replays the clip as often as wanted. (Guess: the R key alone wasn't enough.)
- **✦ Magic Cut disappears while reviewing.**
- **All cuts by default**, with a choice like "only AI cuts" or "only unapproved".
- They stressed it must be **really neat and well made**. Spec v2: `design/cut-review.md`.

### Observed: the second try (2026-11-23)
- **The floating bar was rejected:** "looks like a pop-up window covering a big part of the video — not acceptable."
  Lesson: while judging a cut, the frames are the content; nothing may sit on the video. Controls dock beside it.
- **Arrows to the previous / next cut**, also on ← →. (Guess: they browse cuts back and forth, not only in order.)
  Spec v3: `design/cut-review.md`, "The bar".

### Observed: the third try (2026-11-24)
- **"Too busy, some buttons confusing."** Words, key caps, the reason line and three verdicts were too much to read
  mid-rhythm. Lesson: in a fast loop, glyphs the user already knows (‹ ▶ ✓ ›) beat labels; names go in tooltips.
- **Fix later was confusing.** A cut is approved or skipped; fixing happens now (⌫, a drag), not as a deferred note.
  (Guess: the user never used the red notes review made.) Check: count red notes with `about` made in review.
- **Switching the filter should start at the first cut.** "Nearest unchecked at or after now" surprised them.
- **They want to see what's approved**, in the bar and on the timeline, and a clear **"all done"** when finished.
  (Guess: without it they couldn't tell whether they had gone through everything.) Spec v4: `design/cut-review.md`.

## Editing by hand (2026-11-22, reasoned)
- Two views, one thing: cuts show in the transcript (struck) and on the timeline (hatched) at the same place, grey for
  yours, coral for Magic's. Specs: `design/edit-model.md`, `design/timeline.md`, `design/transcript-editing.md`.
- Expected path after Magic: play → hear a join that's too tight → drag that edge → Space to hear it again → ⌘Z if worse.
