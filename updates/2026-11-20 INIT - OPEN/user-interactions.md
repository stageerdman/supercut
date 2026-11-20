# SuperCut — how people will use it (interaction research)

Author: Columbo (UX Detective) · 2026-11-20 · For: Jony (design), Pixel (orchestrator)

This is user-behavior research, not a screen design. It says what people do, see, click and **expect** at each step, and where they get stuck or lose trust. How the screen looks is Jony's call.

---

## 1. Summary

- **The job people hire SuperCut for:** "I just finished recording myself talking. Turn this messy recording into something I can post, **tonight**, without spending two hours in an editor, and without it cutting something I needed."
- **The core feeling to protect is trust.** People will let the AI cut only if they feel they can **see, check and undo** every cut. The review mode (Yes/No around each cut) is not an extra. It is the reason they believe the magic button.
- **The flow people expect is a straight line:** drop the video → it starts transcribing by itself → trim the junk at the start and end → press the magic button → check the cuts → fix a few words → export. Every step that branches off this line (rules, mic audio, second clip) must be possible, but must never be in the way.
- **The biggest gaps we found in the vision:**
  1. A cut is often *almost* right (it clips a breath or the first sound of a word). Yes/No alone is not enough; people will want to **nudge** a cut, or they will press "No" and lose a good cut.
  2. People treat the transcript like a document. They will try to **type to fix a wrongly transcribed word**, and that must not cut the video by surprise.
  3. "Add words" can only mean **bring back words that were cut**. It cannot make the person say new words. People need to see what is cut and what is kept, at a glance, in the text.
  4. Waiting is the most emotional moment. Local transcription and the AI step take time; people need honest progress and permission to walk away.

---

## 2. Who uses it (assumptions, marked)

| Person | What they record | Why they care |
|---|---|---|
| **Solo YouTuber / talking head** (main user) | 10–40 min to camera, many retakes ("let me say that again") | Cutting retakes and pauses is the most boring hour of their week |
| **Course maker / teacher** | Lessons, screen + face, sometimes in parts | Wants clean, no "ums", trusts nothing that skips content |
| **Podcaster with video** | 30–90 min, separate good mic | Better-mic audio is a must; long files |
| **Founder / marketer in a hurry** | 1–3 min clip on phone or webcam | Wants it done in 5 minutes; will skip review if allowed |

*Assumption:* the main user is the solo creator talking to camera, on a MacBook, often in the evening right after recording. Similar tools they may already know: **Descript** (edit video by editing text), **Gling** (AI removes bad takes and silences for YouTubers), **CapCut** (auto captions, "remove silences"), **Recut/TimeBolt** (silence cutting), **Final Cut / Premiere** (timeline). They bring these habits with them:
- From Descript: "deleting text deletes video", strike-through for removed words.
- From CapCut/Final Cut: a timeline at the bottom, a player at the top, space bar plays, drag to trim.
- From Gling: "the AI keeps my last take", and a list of cuts you can switch on and off.

---

## 3. Scope

**In (this research covers it):** open the app, load one or two clips, local transcription (Parakeet), quick manual pre-cuts, the AI magic button (via Claude Code), custom editing rules, swapping in better-mic audio, cut review mode (watch all / ~10 s around each cut with Yes/No), manual editing on timeline and transcript, export. Plus edge cases and errors for each.

**Out (and why):**
- Captions/subtitles burned in, titles, music, B-roll, effects, color: not in the MVP brief. (Note: many users will *ask* for captions early; see open questions.)
- Two camera angles synced together: unclear if wanted (see open questions). This document assumes **two clips = two parts of one recording, played one after the other**, confirmed as the working assumption by Pixel.
- Export to other editors (Final Cut XML, Premiere): later.
- Generating new speech ("AI voice says words I never said"): not possible with the vision as written; "add words" here means *restore cut words*.
- Team sharing, cloud, accounts.

---

## 4. The journey, step by step

Each step: **the moment → what they see → what they do → what they expect → edge cases and errors.**

### Step 1 — Open the app

- **Moment:** Just finished recording. Camera card or file is in Finder/Downloads. Slightly tired, eager to be done.
- **They expect to see:** one empty screen that says, in effect, "drop your video here." Nothing else asks for a decision. If they used it before, their **recent projects** (with a thumbnail and name) so they can carry on.
- **They do:** drag a file from Finder onto the window, or click to choose a file. Some will drag onto the Dock icon.
- **Expect:** zero setup. No account, no settings wizard. "It's local" should feel like a promise, not a configuration step.
- **Edge cases / errors:**
  - **First launch:** the transcription model may need a one-time download. People accept a one-time wait if told **how big and how long**, and if they can already drop their video while it downloads. They will not accept surprise downloads later.
  - **Claude Code missing or not signed in:** do not block opening the app or transcription. Tell them only when they need the AI (Step 4), in plain words, with what to do.
  - **Mac without enough disk space / old Intel Mac:** say so honestly, early, before a long job fails at 90 %.

### Step 2 — Load one or two videos

- **Moment:** File is dropped. They want to see their face in the player *now*.
- **They expect to see:** the video in a player within a second or two, a timeline with the clip, and a clear sign that **transcription has started by itself** with progress ("Transcribing… 12 %, about 3 min left").
- **They do:** press space to play, scrub a bit to check it's the right file. Often they walk away (make tea, check phone) while it transcribes.
- **Second clip:** they drop a second file onto the same window (or the timeline) and expect it to be **added after the first**, not to replace it. They expect to be able to swap the order. They expect one transcript that runs across both.
- **Expect:** transcription runs without them; the app stays usable (play, trim) while it runs. If they switch apps, a Mac notification when it's done is welcome.
- **Edge cases / errors:**
  - **Wrong format** (MKV, odd codec, audio-only file, a photo): say what's wrong and what works, in one sentence. Never a silent nothing.
  - **Very long file** (1–2 h, 4K): give a time estimate up front; let them keep working; don't freeze the window.
  - **Dropped a third file:** say "SuperCut works with up to two clips" (or allow it); don't silently ignore it.
  - **Dropped the mic audio file here by mistake** (a .wav): this is likely! Recognise "this is audio only" and offer: "Use this as the better-mic audio?" (see Step 6).
  - **Video with no speech / music only / another language:** transcript comes back empty or wrong. Tell them ("We found almost no speech") instead of showing an empty panel that looks broken. If the model only supports some languages, say which.
  - **Two clips with different sizes (one vertical, one horizontal) or frame rates:** tell them what the export will look like.
  - **Laptop sleeps / app quits during transcription:** on reopen, resume or restart it automatically; don't lose the project.
  - **Original file moved or deleted later:** on reopen, say which file is missing and let them point to it.

### Step 3 — Quick manual pre-cuts

- **Moment:** While transcription runs or right after. They know there's junk: the first 20 seconds of walking to the camera, the end where they reach to stop recording, maybe a phone call in the middle.
- **Why they do it (the real reason):** "I don't want the AI to waste time on this, and I don't want it to get confused by it." Also: it gives them something to do while waiting, and a feeling of control before handing over to the AI.
- **They do:** drag the start and end of the clip inward (trim handles, like every editor). For a middle chunk: select a range on the timeline (or in the transcript) and delete it.
- **Expect:** instant, visible result; the removed part is clearly gone (or clearly greyed) in both timeline and transcript. Undo works (⌘Z). The AI later **respects** these cuts and does not bring the junk back.
- **Edge cases:**
  - They pre-cut before the transcript is ready: must work fine; transcript should line up when it arrives.
  - They trim too much by accident: undo, or drag the handle back out (the original is never destroyed).
  - Should their pre-cuts show up in review mode later? *Assumption:* no, they made these on purpose; review is for the AI's cuts. (Open question.)

### Step 4 — Press the AI magic button

- **Moment:** Transcript is done. This is the big moment of hope and doubt: "Will it understand me?"
- **They expect to see:** one obvious button. Pressing it with **no setup** should already give a sensible result (remove retakes, keep the last good take, remove long pauses and filler words).
- **While it works:** a clear, honest "working" state with progress or at least stages ("Reading the transcript… Choosing the best takes… Placing cuts"). Ideally a time hint. They may watch, they may leave.
- **When done:** they expect a **summary they can grasp in two seconds**: e.g. "38 cuts · 24:10 → 14:52 · 3 retakes removed". The cuts are visible on the timeline and in the transcript (cut words struck through or greyed). The video now plays the edited version.
- **Expect:** nothing is destroyed; they can undo the whole AI pass in one step; they can press it again.
- **Edge cases / errors:**
  - **Claude Code not installed / not logged in / offline / rate-limited / it times out:** one plain message saying what happened and what to do; their manual work stays. Never a half-applied cut list.
  - **AI returns nothing useful or way too much** (cuts 80 % of the video): show the summary; people will immediately think "that's wrong" and want to undo or re-run. Big cuts are a trust breaker: make the size of the change obvious.
  - **Pressed again after manual edits:** what happens to their manual fixes? *Expectation:* their own edits win and are kept. If that can't be done, warn before.
  - **Pressed before transcript is ready:** either wait and run automatically, or say "available when the transcript is done". Don't show an error.
  - **Privacy fear:** "It's local" was the promise, but the AI step sends the transcript to Claude. Some users will care. Say once, plainly, what is sent (text only, not video). *(Watch-out list.)*

### Step 5 — Write custom editing rules

- **Moment:** Usually *after* the first AI run disappointed them a bit ("It cut my joke", "It kept the 'um's", "It cut too tight"). Rarely before the first run. Power users write them once and reuse them forever.
- **They expect:** a place to write in plain words, like talking to an editor: "Always keep the last take", "Don't cut pauses shorter than one second", "Keep my intro exactly as is", "Remove 'basically' and 'you know'". Some example rules shown to get them started.
- **They do:** write or edit a rule, then press the magic button again.
- **Expect:** rules are **remembered for next time** (across projects), without saving anything. They expect the next AI run to visibly follow the rule; if a rule had no effect, they will think the app ignored them.
- **Edge cases:**
  - Rules that conflict ("cut all pauses" + "keep natural pauses"): the AI decides; they'd like to know.
  - Very long rule text pasted from somewhere: fine.
  - Rules for *this video only* vs *always*: people will want both eventually. *Assumption:* MVP = one rule set that is remembered. (Open question.)
  - Some people will try to use the rules box as a chat ("put back the part about pricing"). See watch-out list.

### Step 6 — Swap in better-mic audio

- **Moment:** Only for people who recorded sound on a separate mic (lav, USB mic, Zoom recorder). Those people do it **every time** and know exactly what they want: "Use the good audio, throw away the camera audio."
- **They do:** drop the .wav/.m4a/.mp3 onto the app (they'll drop it anywhere, so the app should understand any drop of an audio file), or choose "use better audio" and pick a file.
- **They expect:** the app **lines it up automatically** (by matching sound), the same way pro editors sync audio. They expect to hear the difference right away, and a way to compare old vs new (A/B toggle) to be sure it synced.
- **Best moment to do it:** before transcription (better audio = better transcript) — but most people will do it *later*, when they remember. Both must work. If they do it after transcription, should the transcript be redone? *Expectation:* cuts stay exactly where they are.
- **Edge cases / errors:**
  - **Couldn't sync** (mic started much later, or file from a different take): say so; let them nudge the offset by ear and see the result.
  - **Sync drifts** over a long recording (different clocks): it starts in sync and slowly goes off. Users notice lips out of sync at minute 30. Hard; flag it.
  - **Mic file shorter than the video:** what plays in the gaps? Camera audio is the natural fallback; tell them.
  - **Two clips + one long mic file**, or **one mic file per clip**: both happen.
  - **Wrong file** (music, a different day): they need to remove/replace it easily.

### Step 7 — Cut review mode

This is the trust step. Two ways people will want to review:

**A. Watch everything.** The edited video plays from start to end, like the viewer will see it. Used by careful people, short videos, or the final check before export. They expect normal player controls, and to **stop and fix** something the moment they see it (then continue).

**B. Jump through the cuts (about 10 s around each).** Plays a few seconds before the cut, skips what was removed, plays a few seconds after. Then asks: keep this cut, **Yes** or **No**? Then moves to the next cut automatically.

- **Moment:** After the AI pass. Often sitting back, hand on the keyboard. This is a rhythm task, like sorting photos.
- **They expect:**
  - **Keyboard first:** one key for Yes, one for No, one to replay, one to go back. They will do 20–60 of these in a row; reaching for the mouse each time is tiring.
  - Always know **where they are**: "Cut 7 of 38" and how many are left.
  - To **hear the cut as the viewer will**, and optionally peek at **what was removed** (people want to know *what* they're agreeing to cut, not only how the join sounds).
  - "No" means **put the removed part back**. Immediately audible on replay.
  - To stop halfway and come back later, and find their place.
  - At the end: "All 38 cuts checked. 4 restored." and a natural next step (export).
- **Missing in the vision — "almost right":** many cuts are good but slightly off (cuts the first sound of a word, leaves a breath, too tight). With only Yes/No they must choose between a bad cut and no cut. They expect a quick way to **nudge** the cut a little earlier/later, or to jump to edit it. *(Product insight, high importance.)*
- **Edge cases:**
  - Two cuts close together (within 10 s): the clips overlap; group them or play them as one; don't make the user hear the same seconds twice and get confused about which cut they're judging.
  - Tiny cuts (a 0.3 s "um"): 38 of those is boring. People will want to **accept all of a kind at once** ("all filler-word cuts look fine").
  - Changed their mind on cut 3 while at cut 20: they expect to go back.
  - They skip review entirely and export: allowed, but they may regret it. *(Watch-out list.)*

### Step 8 — Manual editing on the timeline and the transcript

- **Moment:** During or after review. They spotted "that sentence should go" or "it cut the bit I needed."
- **Transcript editing (Descript habit):**
  - Select words → Delete → those words are cut from the video. Expect strike-through or grey, not vanished text, so they can see and restore.
  - **"Add words" = restore:** click/select struck words → bring back. That's the only "add" that's possible; people must see the cut words to restore them.
  - Click a word → the player jumps there. This is how people navigate: by text, not by time.
  - **Fixing a typo in the transcript** (Parakeet heard "Super Cat"): people *will* try to type a correction. They expect it to fix the text, not cut the video. Whether to allow it or not, the result must not surprise them. *(Watch-out list.)*
- **Timeline editing (CapCut/Final Cut habit):**
  - Space to play, click to place the playhead, drag the edges of a cut to change it, select a range and delete.
  - Expect the timeline and the transcript to **always match**: change one, the other updates at once.
  - Zoom in to place a cut precisely between words.
- **Expect everywhere:** ⌘Z / ⇧⌘Z undo and redo, for every action including the AI pass. Autosave. The original files are never changed.
- **Edge cases:** deleting half a word in text (cut lands mid-word: snap to word edges); deleting everything; editing while the AI is running (block or queue, but say so).

### Step 9 — Export

- **Moment:** The finish line. Often late. They want to upload to YouTube now.
- **They expect:** one clear "Export" with good defaults: same size and quality as the original, MP4, saved next to the original or in a place they choose, with a sensible name ("my-video – SuperCut.mp4"). Not a wall of codec settings.
- **While exporting:** progress, time left, can keep using the Mac. When done: "Show in Finder" and maybe "Play". A Mac notification if they left.
- **Expect:** the export is exactly what they saw in the player, with the better audio, with every cut they kept.
- **Edge cases / errors:**
  - Not enough disk space: say so before starting, not at 95 %.
  - File name already exists: don't overwrite silently.
  - Quit during export: warn.
  - Export before reviewing all cuts: allowed; maybe a gentle "12 cuts not checked yet" so they choose consciously.
  - Audio clicks at cut points (hard cuts on speech): people notice; tiny audio fades at each cut are expected by anyone who has edited before.

### Step 10 — Coming back later (implicit, but everyone does it)

- Close the app, come back tomorrow, expect **everything exactly as they left it**: cuts, review progress, rules, mic audio. No "Save" dialog anxiety. Recent projects on the opening screen.

---

## 5. Behavior table

Scores 1–10. Likelihood = how many users will do it. Frequency = how often, per video/session. Sorted by combined score. When unsure, the lower score was chosen.

| # | Behavior | Likelihood | Frequency | Reason |
|---|---|---|---|---|
| 1 | **Drop a video and expect it to just start** (play + auto-transcribe) | 10 | 9 | Every session begins here; any setup step feels like friction |
| 2 | **Export and post** | 10 | 8 | The whole point; once per video, every video |
| 3 | **Press the magic button with no rules** | 9 | 9 | The reason they chose SuperCut; first thing after transcript |
| 4 | **Undo something** (incl. the whole AI pass) | 9 | 8 | Editing is trial and error; the AI makes bold moves |
| 5 | **Review cuts with Yes/No around each cut** | 9 | 8 | Trust: they won't publish AI cuts unseen, at least for the first weeks |
| 6 | **Trim the junk at start and end** | 8 | 9 | Almost every recording starts with walking to the camera and ends reaching for it |
| 7 | **Nudge a cut that is almost right** | 8 | 7 | Common with automatic cuts (clipped breaths, word starts); not in the vision |
| 8 | **Delete words in the transcript** | 8 | 7 | Descript habit; fastest way to drop a sentence |
| 9 | **Click a word to jump the player there** | 8 | 7 | People navigate by what was said, not by timecode |
| 10 | **Swap in better-mic audio** | 7 | 8 | Only users with separate mics, but they do it every single time |
| 11 | **Watch the whole edited video before export** | 7 | 7 | Careful users and short videos; final check |
| 12 | **Leave the app while it transcribes / thinks / exports** | 7 | 7 | Waits of minutes; people multitask |
| 13 | **Restore words the AI cut ("add words")** | 7 | 6 | AI will cut something needed in most videos |
| 14 | **Close and reopen the project later** | 7 | 5 | Long videos are edited over two sittings |
| 15 | **Tweak rules and re-run the AI** | 7 | 5 | After a first disappointing result; less once tuned |
| 16 | **Type to fix a wrong word in the transcript** | 6 | 5 | Text looks like a document; names and jargon get misheard |
| 17 | **Ask the AI in words to change something** ("tighter", "put back the pricing part") | 6 | 5 | Claude is behind the button; chat is the habit people have now |
| 18 | **Skip review, export straight after AI** | 6 | 5 | People in a hurry; more often once they trust it |
| 19 | **Write rules once, before the first run** | 6 | 2 | Power users only; most learn by first seeing a result |
| 20 | **Record vertical video on phone and load it** | 5 | 5 | Shorts/Reels creators; affects export shape |
| 21 | **Load two clips (part 1 + part 2)** | 5 | 4 | Camera file splits, breaks in recording |
| 22 | **Load a very long file (1 h+)** | 5 | 4 | Podcasters, lessons |
| 23 | **Accept all cuts of one kind at once** (all "um" cuts) | 5 | 4 | Emerges when review gets boring |
| 24 | **Want captions with the export** | 5 | 4 | The transcript is right there; CapCut habit. Out of MVP scope |
| 25 | **Drop the mic audio file as if it were a video** | 4 | 3 | Easy mistake when dragging both files from one folder |
| 26 | **Drop an unsupported file** | 4 | 2 | Rare, but must not fail silently |
| 27 | **Use it without Claude Code set up** | 5 | 1 | First run on a new Mac; blocking if handled badly |

---

## 6. Deep dives (top behaviors)

### 6.1 Drop a video and expect it to just start (#1)

- **Moment:** 9 pm, home desk, MacBook. Just stopped the camera, copied the file. Still warm from recording, a bit drained.
- **Trigger:** "I want this off my plate before bed."
- **Thoughts:** "Okay, drop it in… Is it doing something? How long will this take? Can I go make tea?"
- **Emotions:** before: tired, hopeful. During: impatient if nothing visibly happens in the first 2 seconds. After: relief when they see their video and a progress line with time left.
- **Expectations:** video visible in ~1–2 s. Transcription starts **without a click**. A time estimate. Ability to play/trim during the wait.
- **Success:** "I dropped it and it just started working."
- **Friction and fears:** a dialog asking settings; a spinner with no time; a frozen window; a first-run model download that wasn't announced; the fan noise with no explanation.
- **Product insight:** auto-start transcription on drop. Waiting must be honest (progress + time left) and non-blocking. First-run download is announced with size/time and happens before or alongside, not as a surprise.

### 6.2 Press the magic button with no rules (#3)

- **Moment:** Transcript just finished. They're back from the kitchen.
- **Trigger:** "Let's see if this thing is as good as they said."
- **Thoughts:** "Please don't butcher it… Did it get my retake at minute 4? Why did it cut so much?"
- **Emotions:** before: hope mixed with doubt. During: suspense (wait must feel short and alive). After: delight if the length dropped a lot *and* the first few cuts sound right; distrust if the first cut they hear is wrong.
- **Expectations:** one press, no setup; a result in about a minute or two for a typical video; a two-second summary (cut count, before/after length); nothing destroyed; one-step undo.
- **Success:** "It did in two minutes what takes me an hour, and the first cuts I checked were right."
- **Friction and fears:** silent long wait; an error with tech words (Claude Code, tokens, CLI); a half-applied result after failure; the AI cutting their best joke; not knowing whether the transcript left the Mac.
- **Product insight:** good defaults matter more than rules (most people will never write a rule before their first run). The first impression is decided by the first 2–3 cuts they hear, so review mode should be one obvious step away from the result. Failure must leave the project exactly as before.

### 6.3 Review cuts with Yes/No (#5)

- **Moment:** Sitting back, one hand on the keyboard, maybe headphones on. 10–20 minutes of focused rhythm.
- **Trigger:** "I'm not posting this without checking what it cut."
- **Thoughts:** "Yes… yes… wait, it cut 'not' — that changes the meaning! No. … How many left?"
- **Emotions:** before: duty. During: flow if it's fast and keyboard-driven; boredom if there are many tiny cuts; alarm when a cut changes meaning. After: confidence; "I can trust this now."
- **Expectations:** auto-play each cut with a few seconds before and after; one key Yes, one key No, replay, back; "7 of 38"; No restores immediately; resume later where they stopped.
- **Success:** "I checked every cut in ten minutes and I know the video is right."
- **Friction and fears:** having to click with the mouse each time; overlapping cuts played twice; not knowing *what* was removed; losing review progress; no way to fix an "almost right" cut.
- **Product insight:** review is the trust engine; it needs to be fast and keyboard-first. Add a way to peek at what was removed. Close cuts should be grouped. The "almost right" case needs an answer (nudge, or jump to edit) — see 6.4.

### 6.4 Nudge a cut that is almost right (#7)

- **Moment:** In review, cut 12. The cut is right in spirit, but it eats the "s" of "so".
- **Trigger:** They hear the clipped sound.
- **Thoughts:** "Yes, cut that… but not like that. If I say No I get the whole retake back. Ugh."
- **Emotions:** frustration; feeling forced into a bad choice. After a quick fix: satisfaction and craft pride.
- **Expectations:** a tiny adjustment (a bit earlier / a bit later), replay, then Yes. Without leaving review mode.
- **Success:** "Fixed it in one second and moved on."
- **Friction and fears:** having to leave review, find the spot on the timeline, zoom, drag, find their place again.
- **Product insight:** Yes/No needs a third path for "almost". Also: cuts should snap to word boundaries and get tiny audio fades, which removes many of these cases before the user ever hears them.

### 6.5 Trim the junk at start and end (#6)

- **Moment:** While waiting for the transcript.
- **Trigger:** They see the first frames: themselves walking to the chair.
- **Thoughts:** "Get rid of that. And the end where I reach for the camera."
- **Emotions:** small sense of control before handing over to the AI.
- **Expectations:** drag the edges like any editor; instant; undoable; the AI later respects it.
- **Success:** "Two drags, done."
- **Friction and fears:** the AI bringing the junk back; trim not shown in the transcript; trimming locked until transcription ends.
- **Product insight:** trimming must work during transcription. Manual cuts are "theirs" and outrank the AI.

### 6.6 Delete words in the transcript / click a word to jump (#8, #9)

- **Moment:** During review or after; reading the transcript like a script.
- **Trigger:** "That whole sentence is pointless" or "where did I talk about pricing?"
- **Thoughts:** "Select, delete, done. Like Descript." / "Click 'pricing', play."
- **Emotions:** feels powerful, like editing a doc; panic if text vanishes and they can't see how to bring it back.
- **Expectations:** deleted words stay visible but struck/greyed and can be restored; timeline updates instantly; click jumps the player; selection snaps to whole words.
- **Success:** "I edited the video by reading it."
- **Friction and fears:** cut lands mid-word; text and timeline out of sync; typing a correction cuts the video; no way to tell AI cuts from their own.
- **Product insight:** transcript and timeline are two views of one edit and must always agree. Cut words remain visible and restorable — that *is* "add words".

### 6.7 Swap in better-mic audio (#10)

- **Moment:** Right after loading the video, or when they first hear the echoey camera sound.
- **Trigger:** "Ugh, camera audio. Where's my mic file."
- **Thoughts:** "Drop the wav… did it sync? Let me check the lips."
- **Emotions:** before: mild dread (syncing is a known pain). After: delight if it just syncs; anger if lips drift at minute 30.
- **Expectations:** drop anywhere → auto-sync → immediately hear it; quick A/B compare; cuts unchanged.
- **Success:** "It sounds like a studio and I didn't have to line anything up."
- **Friction and fears:** sync failure with no fallback; drift over long recordings; mic shorter than video; not knowing which audio the export will use.
- **Product insight:** recognise any dropped audio file as "better audio". Auto-sync is expected; a manual nudge is the fallback. Make clear which audio is active. Better audio before transcription gives a better transcript — offer it but don't require it.

### 6.8 Export and post (#2)

- **Moment:** Late. Finish line. YouTube upload page already open.
- **Trigger:** Review done, or "good enough".
- **Thoughts:** "Just give me an MP4 like the original. Where did it go?"
- **Emotions:** before: impatience. During: hope it doesn't fail. After: relief, pride.
- **Expectations:** one click with good defaults; progress and time left; "Show in Finder" at the end; export = what they saw.
- **Success:** "Clicked export, made tea, file was there."
- **Friction and fears:** codec choices; failure near the end (disk); silent overwrite; clicks at cut points; export missing the better audio.
- **Product insight:** defaults over options. Check disk space up front. A gentle note if cuts weren't reviewed, never a block.

---

## 7. Watch-out list (lower scores, but could break trust)

- **Typing to fix a transcript word cuts the video.** Users treat text as text. A surprise cut feels like the app destroyed something.
- **Skip review and publish a meaning-changing cut** (e.g. "I do *not* recommend this" → "I do recommend this"). Rare, but a real harm to the creator. Worth a gentle "unchecked cuts" note at export.
- **"It's all local" — but the transcript goes to Claude.** Users who chose the app for privacy will feel betrayed if they find out later. Say once, plainly, what leaves the Mac.
- **Failure leaves a half-cut project** (AI crashed mid-way). Must be all or nothing.
- **Losing work:** crash, quit, sleep, moved source file. Autosave and resume are expected, not a feature.
- **Using the rules box as a chat** ("put back the pricing bit"). If nothing happens, they think the AI ignored them. Either support it or make clear the box is for standing rules.
- **Sync drift with mic audio** on long recordings: noticed only after export, on YouTube, in public.
- **Claude Code missing** on first use: if the message is technical, non-technical users give up at the most important moment.

---

## 8. Things people expect everywhere (cross-cutting)

- **Undo/redo for everything**, including the full AI pass. ⌘Z works as on any Mac.
- **Autosave.** No Save dialog. Original files never changed.
- **Space plays/pauses**, everywhere, always. Arrow keys / J-K-L for those who know editors.
- **Honest waiting:** progress + time left for transcription, AI, export. Can leave and get a notification.
- **One edit, two views:** timeline and transcript always show the same cuts. Clear difference between *their* cuts and the *AI's* cuts.
- **Plain-word errors** with what to do next. No raw tool or model errors.
- **Mac habits:** drag and drop anywhere, ⌘O, recent projects, Show in Finder.

---

## 9. Key insights

1. **Trust is the product.** The magic button sells the app; the review mode makes people keep using it. Fast, keyboard-first review with a clear count is essential.
2. **Yes/No needs an "almost".** A quick nudge (or a jump to fine-edit) in review saves many good cuts.
3. **Default AI result > rules.** Most people press the button before writing any rule; rules come after the first disappointment. Rules must be remembered automatically.
4. **Show cut words, don't hide them.** Struck-through words are both the evidence ("what did it cut?") and the way to "add words" back.
5. **Their edits outrank the AI.** Pre-cuts and manual fixes must survive a re-run of the magic button.
6. **Waiting is designed, not left over.** Auto-start transcription, honest progress, work allowed during waits.
7. **Any audio file dropped = better audio, auto-synced,** with A/B compare and a manual fallback.

## 10. Open questions (for Pixel / the user)

1. **Two videos:** two parts of one recording (assumed) or two camera angles synced together?
2. **Better audio:** always a separate mic file to sync (assumed), or also "enhance the existing audio" (like Descript's Studio Sound)?
3. **"Add words":** confirm it means *restore cut words*, not generate new speech.
4. **Typing in the transcript:** may users correct wrong words (text only), or is the transcript strictly for cutting?
5. **Nudging in review:** is a third option ("adjust") in scope for the MVP, or only Yes/No?
6. **Rules:** one remembered rule set for all videos, or also per-video rules? Can the rules box be used as a one-off instruction ("put back the pricing part")?
7. **Review of manual cuts:** should user's own pre-cuts appear in review, or only AI cuts? (Assumed: only AI cuts.)
8. **Privacy message:** how should the app explain that the transcript (text only) is sent to Claude?
9. **Captions:** out of MVP, but expect early requests. Confirm it's later.
10. **Export formats:** MP4 same as source assumed. Any need for vertical/other sizes or an editor project file in the MVP?
11. **Languages:** which languages must transcription support for the target users?

*Research basis:* how people use Descript, Gling, CapCut, Recut/TimeBolt and Final Cut/Premiere today (known habits and common complaints), applied to the SuperCut vision. No live user interviews yet; scores are reasoned estimates and marked as such.
