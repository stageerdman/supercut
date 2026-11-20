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

## Assumptions (guesses — check them)
| # | Assumption | Quick check |
|---|---|---|
| A1 | Two videos = two parts of one recording, played in order | Confirmed by Pixel as working assumption |
| A2 | Most people press Magic before writing any rule | Watch 3 first-time users |
| A3 | Pre-cuts are rough (start/end + one middle chunk), not precise | Count edits per session in a test build |
| A4 | Users trim while transcription runs | Log edits before transcript is ready |
| A5 | Dark UI fits (editor habit, video pops) | Ask 3 users after Phase 1 |
| A6 | A window ≥ 1100 × 700 is typical (MacBook, often full screen) | Log window sizes in a test build |
