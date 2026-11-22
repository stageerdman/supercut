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

## Editing by hand (2026-11-22, reasoned)
- Two views, one thing: cuts show in the transcript (struck) and on the timeline (hatched) at the same place, grey for
  yours, coral for Magic's. Specs: `design/edit-model.md`, `design/timeline.md`, `design/transcript-editing.md`.
- Expected path after Magic: play → hear a join that's too tight → drag that edge → Space to hear it again → ⌘Z if worse.
