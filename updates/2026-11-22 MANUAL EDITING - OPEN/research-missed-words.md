# Research: words the transcript missed or got wrong

Author: Columbo · 2026-11-22 · For: Jony (design). Goal: "Detect pauses from the audio, not transcript gaps, and let
the user fix words the transcript missed." Read alongside `design/transcript-editing.md`, `design/edit-model.md`,
`design/timeline-strip.md`, `design/user-model.md`.

Everything here is **reasoned, not observed**. No users were watched. Facts about Parakeet and other apps come from
what I already know, not from a live check. Assumptions are marked **(A)**.

## Summary

People don't fix the transcript to get a nicer transcript. They fix it for three reasons: so they can **cut** a sound
that has no words to grab, so **Magic** makes the right call, and so they can **trust** what they read. The most
common missed "words" are likely ums, false starts and half-words. People want to **cut** those, not type them. So
the main job for audio-detected "speech with no words" is: let people see it and ⌫ it, like a pause. Typing the
missing words is a second, rarer job (names, a word that changes the meaning). It should work by selecting the
wordless stretch and typing, and the text should go only into that stretch, never into the words next to it.

The current fix field (double-click, or type over selected words) already suits the frequent "misheard name" fix.
There are four gaps:
1. People can't *see* where speech has no words. With pauses taken from transcript gaps, that speech even shows up as
   a **pause you can cut**: real speech, labelled as silence.
2. There's no way to add words at the right *time*. Typing an extra word into a neighbour squeezes it into the
   neighbour's time, so a later ⌫ on it cuts the wrong sound.
3. A word the transcript made up (over noise or silence) can't be removed: ⌫ cuts audio, and empty text means "no change".
4. Text-editor habit: click between two words, then type. Here a click selects the word and typing *replaces* it.

## Scope

**In (this stage):** fixing misheard words; adding missed words; speech that the audio finds but the transcript has
no words for; how both show in the transcript panel and on the timeline strip; how this affects cutting and Magic.

**Out, and why:**
- Captions / subtitle export: not built. If it comes, fixing words becomes far more frequent and casing/punctuation
  start to matter. Re-check everything here then.
- A custom word list (teach the speech model names up front): a different job (prevent, not fix), and it depends on
  what the model supports.
- Speaker labels, other languages, re-timing individual words by dragging: not needed for the first version.
- How the audio pause detector works: engineering, not behaviour. I only cover what the user sees and expects from it.

## Why the transcript goes wrong (what users will meet)

**(A)** Parakeet-style models are accurate on clean solo speech, but in a typical talking-head take the errors are:

| Error | Example | How often (A) | What the user wants |
|---|---|---|---|
| Filler left out | "um", "uh", "you know" not written | Often: many models drop disfluencies on purpose | **Cut** it |
| False start or half-word left out | "the— the plan" written as "the plan" | Often in retakes | **Cut** it |
| Name or jargon misheard | "Gling" → "cling", "Tauri" → "tory" | Every video that has names | **Fix** the text |
| Short word dropped | "it's **not** working" → "it's working" | Sometimes | **Add** it: changes the meaning, and Magic reads it |
| Quiet or trailing words dropped | a mumbled end of a sentence, an aside | Sometimes | Mostly **cut**, sometimes add |
| Phrase garbled | 3–5 wrong words over noise or crosstalk | Rare | **Retype** the phrase |
| Word made up | a word over a cough, music or silence | Rare | **Remove** the text only |

What this means: the most common "missing" words aren't words anyone wants to keep. Magic Cut's whole promise is
removing them. So wordless speech is a **cut target** first and a **typing target** second.

## How people do this in similar apps today (from memory, not checked live)

- **Descript:** text is the video. You fix words by typing (a separate "correct" action in some versions), and adding
  text re-aligns that region. People are used to "the gap is a place I can type". Missed ums are an old complaint.
  People use the filler tools or cut on the waveform.
- **Premiere Pro (text-based editing):** you edit the transcript word by word, mostly to fix spelling. Cutting missed
  audio happens on the timeline.
- **CapCut auto-captions:** you edit text per caption segment, and you can add a caption at the playhead. People think
  in phrases, not words.
- **Subtitle editors (Aegisub, Subtitle Edit):** select a stretch on the waveform, type its text. This is exactly
  "type into a selected stretch of time", and it's familiar to anyone who has done captions.

These habits point both ways. In the **panel**, people expect a text caret ("put the cursor there and type"). On the
**timeline**, people expect "select the stretch, then act on it".

## Behaviour table

Likelihood = how many users will do it. Frequency = how often in a session, for those who do. If I wasn't sure, I
picked the lower score.

| # | Behaviour | L | F | Reason |
|---|---|---|---|---|
| 1 | **Cut wordless speech** (um, false start, cough) by selecting it and pressing ⌫ | 8 | 8 | Cutting junk is the core job, and these are the likeliest missed bits. Done many times per video. |
| 2 | **Leave the transcript as it is** and just cut | 8 | 8 | People in a hurry, tired in the evening. Text errors don't change the video. Most sessions. |
| 3 | **Notice a mismatch while listening** (lit word stalls, speech with no text, wrong word) | 8 | 7 | Reading along while playing is how people check cuts, so errors show up during normal review. |
| 4 | **Fix a misheard name or term** (double-click, retype) | 9 | 6 | Almost every creator says their own name, brand or tool. A few times per video; F lowered because names repeat but get fixed once each. |
| 5 | **Fix the same name everywhere** (expect find + replace all) | 7 | 4 | The name shows up 5–20 times. After the third fix, people look for "replace all". ⌘F already exists, so they'll try it there. |
| 6 | **Retype a garbled phrase** (select a few words, type the right phrase) | 7 | 4 | Clear error, easy fix with today's field. Only a few per video. |
| 7 | **Click between two words and type** (text-editor caret habit) | 7 | 3 | Strong habit from Docs/Descript. Tried when adding a word. Today it selects a word and typing replaces it. |
| 8 | **Add a missed word that matters** (select the wordless stretch, type) | 6 | 4 | Only when the meaning changes ("not") or Magic needs it. Most people skip it. |
| 9 | **Add a word by retyping a neighbour** ("working" → "not working") | 5 | 3 | The workaround today's design suggests. It works for the text but puts the word at the wrong time. |
| 10 | **Fix words after a strange Magic cut** (find the transcript was wrong, fix, run Magic again) | 6 | 3 | Happens when a cut sounds wrong. Rare but high-stakes for trust. |
| 11 | **Fix while playback keeps running** | 6 | 5 | Proofreading flow: hear it, fix it, keep going. Pausing every time feels slow. |
| 12 | **Search for a word that was missed**, find nothing | 5 | 3 | ⌘F for "the part where I said X". If X is missing, they think the app is broken or it was cut. |
| 13 | **Expect "listen again" on a stretch** (re-transcribe just this part) | 5 | 2 | Descript-style habit. Saves typing a phrase. Most people won't think of it. |
| 14 | **Remove a made-up word** (text only, keep the sound) | 4 | 2 | Rare with this model. Today they can't do it without cutting audio. |
| 15 | **Fix casing or punctuation** | 4 | 2 | Only matters for captions (out of scope). Low value now. |
| 16 | **Fix a word that is already cut** | 3 | 2 | It's going anyway. Done only by perfectionists or by accident. |

### Watch-out list (low score, but can break trust or cause harm)

- **Cutting real speech labelled as a pause.** If pauses come from transcript gaps, a missed sentence shows up as a
  "2.4 s pause". A user ⌫s it to tighten the edit, and a real sentence is gone without them noticing (they don't
  re-listen to pauses). This is the strongest reason for this goal: an audio pause must mean *silence*.
- **Typing meant to insert replaces a word** (#7). Click "working", type "not": "working" disappears. The user may not
  notice, and Magic then reads the wrong sentence.
- **An added word at the wrong time** (#9). Later ⌫ on "not" cuts part of "working". It sounds broken, and they don't
  know why.
- **Leftover sound at a Magic join.** If the last word of a dropped take was missed, Magic's word-exact cut stops
  short and a half-word stays at the join ("…the— so anyway"). The user hears a glitch and blames Magic, not the
  transcript. Wordless speech next to a Magic cut is the most likely place for this. **(A)**: worth checking in a test.
- **The fix field silently discards a fix.** Clicking away commits, which is good. But if the words change under the
  field (Magic lands, undo), any loss must be visible, or people stop trusting their edits.

## Deep dives

### 1 · Cut wordless speech (L8 F8)

- **Moment:** evening, MacBook, right after a Magic run. They're playing through the first few cuts with headphones.
- **Trigger:** they hear "uhhh" or "the— the" that Magic left in, because there was no word for Magic to see.
- **Thoughts:** "Why didn't it catch that? …Fine, I'll kill it myself. Where is it? There's nothing in the text."
- **Emotions:** a little let down before (the AI missed something). Focused while hunting for it. Relief once it's
  gone, and a small rise in trust if it was easy.
- **Expectations:** the sound is *visible somewhere*: a block on the strip, like a pause, or a marked gap in the
  panel. One click selects it, ⌫ cuts it, Space confirms. Three steps, no typing, no dragging precision.
- **Success:** "click, ⌫, gone, and the join sounds natural."
- **Friction and fears:** zoomed out, a 0.4 s "uh" is a few points wide, too thin to hit. Selecting by dragging spills
  into the neighbouring words, so they cut half of one. Worst case: the block looks like a pause, so they think it's
  silence and cut a real sentence. Two kinds of block that look alike would cause that.
- **Product insight:** wordless speech needs its own presence in both views, **clearly different from silence**, and
  it should follow the same ⌫ toggle as pauses and words. Cutting it shouldn't require typing anything. Pauses
  ("silence") and speech-with-no-words must never be confused. This matters more than adding words.

### 2 · Leave the transcript as it is (L8 F8)

- **Moment:** any session, often someone with a 1–3 minute clip who wants it posted tonight.
- **Trigger:** none. They see "cling" instead of "Gling", shrug and move on.
- **Thoughts:** "The video's fine, the text doesn't get exported. Not worth my time."
- **Emotions:** neutral, but each error they see costs a little trust in "the AI understood me".
- **Expectations:** errors don't block anything: Magic, cutting and export work the same.
- **Success:** never having to think about it.
- **Friction and fears:** a prompt, badge or "3 unknown words" count would nag them. Errors that make Magic cut badly
  turn ignoring them into a problem.
- **Product insight:** fixing must stay optional and silent: no counters, no nudges. Wordless speech should be easy
  to see but shouldn't look like an error the user has to clear.

### 3 · Notice a mismatch while listening (L8 F7)

- **Moment:** playing back, eyes on the panel (the lit word moves), or on the strip.
- **Trigger:** the lit word stops moving while they hear speech. Or it lights a word they didn't say.
- **Thoughts:** "Wait, that's not what I said." / "It skipped a bit there." / "Is it out of sync?"
- **Emotions:** a short jolt of doubt. If the lit word stalls for seconds, they suspect sync is broken, which feels
  worse than a typo.
- **Expectations:** they look at the exact spot, the one under the playhead, and expect to act on it right there,
  without hunting. Many will press Space (pause), then double-click the word.
- **Success:** the app showed them *where* the gap is, and fixing took one gesture from where they were looking.
- **Friction and fears:** a stall with nothing to look at reads as a sync bug. If the panel jumps away (following
  resumes) as they reach for the word, they lose it.
- **Product insight:** the wordless stretch should "light" during playback like a word does, so following never
  appears to stall. This also gives people a target to click.

### 4 · Fix a misheard name or term (L9 F6, deep-dived because it's in the brief)

- **Moment:** reading the transcript after transcription, or during review. Usually the first time their own name
  appears.
- **Trigger:** their name, brand or tool is spelled wrong. It feels personal.
- **Thoughts:** "Ugh, it always gets my name wrong." Then after the fourth time: "Is there a replace all?"
- **Emotions:** mild irritation, then satisfaction when it's fixed. Fatigue if it repeats.
- **Expectations:** double-click, type, Return: done (today's field fits). Then they expect the same fix to apply to
  the other times, or at least to be offered.
- **Success:** fixed once, right everywhere.
- **Friction and fears:** fixing the same word 12 times by hand. Not knowing whether the fix is "saved". The field
  gives no feedback beyond the text changing (that's fine, but undo must name it).
- **Product insight:** today's gesture is right. The next most valuable step is **replace the others too**, likely
  through the existing ⌘F search, since that's where people go to find repeats. It's open whether that belongs in
  this goal, but it's the most-felt pain after the first fix.

### 5 · Add a missed word into a stretch of time (L6 F4, deep-dived because it's in the brief)

- **Moment:** after spotting a meaning-changing gap ("it's working" where they said "it's not working"), or after a
  strange Magic decision.
- **Trigger:** "Magic will think I meant the opposite" / "this reads wrong."
- **Thoughts:** "Let me just put 'not' in there." In the **panel**: "click between 'it's' and 'working' and type." On
  the **timeline**: "that little bump in the waveform is the 'not': select it and type."
- **Emotions:** careful and a bit wary ("will this break my cuts?"). Pleased if the word lands where it was said.
- **Expectations:**
  - The new word goes **in the gap**, not into a neighbour. It shouldn't change the words next to it.
  - Dragging is imprecise, especially zoomed out. If the selection overlaps the edge of a neighbouring word, they
    still mean "the gap". If it fully covers words, they mean "replace these" (same as typing over selected words in
    the panel today).
  - The new word behaves like any word afterwards: ⌫ cuts *its* sound, it lights during playback, Magic reads it.
  - Typing straight after selecting works from **either** view. Selecting on the timeline and typing, with nothing
    happening, will read as broken.
- **Success:** "I said 'not' there, now the text says it, and cutting it would cut exactly that sound."
- **Friction and fears:** the typed letter replacing the clicked word (#7). The word landing in a neighbour's time.
  The selection having to be pixel-exact. A dialog asking for start/end times (far too much).
- **Product insight:** a collision-free rule that matches what people mean: **text typed into a selection goes into
  the wordless part of it; whole words inside the selection are replaced; words only partly inside are left alone.**
  If audio-detected speech is there, the new words should take *its* time (the sound), not the whole gap including
  silence, so a later ⌫ cuts exactly the spoken bit. In the panel, the wordless stretch itself needs to be a clickable
  thing (#3), so "add a word" becomes "select the gap and type" with no new caret mode. That keeps the existing
  "no caret" decision and gives insertion a real target.

### 6 · Edit an existing word: right-click or double-click? (from the brief)

- People reach for: **double-click** (text habit, works today), **typing over a selection** (works today), and
  **right-click** (Mac habit when unsure: "what can I do with this?"). **(A)** Right-click is used most by people who
  don't know the shortcut, which describes nearly everyone the first time.
- **Product insight:** keep double-click and type-over as the main way. A right-click menu earns its place as the
  *discovery* path, listing the few things you can do with a word or gap: fix, cut/restore, and remove-text-only for a
  made-up word (watch-out #14 has no other home, since ⌫ must keep meaning "cut").

## Key insights for Jony

1. **Silence and wordless speech are two different things to the user.** Silence: "safe to cut". Wordless speech:
   "something was said here". They must never look the same. Today's transcript-gap pauses mix them up, which can cost
   real speech.
2. **Wordless speech is mostly a cut target.** Make it selectable and cuttable with the same ⌫ toggle, in both views.
   Typing into it is the second job.
3. **Insertion = select a stretch, then type.** The text fills the wordless part only. Whole words inside are
   replaced, partial ones are left alone. It needs no caret and no new mode, and it should work the same from the
   timeline and the panel.
4. **Inserted words need real time.** Where audio speech is detected, the words take that speech's span, so cutting
   them later is exact.
5. **Following must not stall** over wordless speech. Give it a "lit" state during playback.
6. **Fixing stays optional and quiet.** No error counts or nudges.
7. **Right-click is the discovery path** and the only sensible home for "remove this text, keep the sound".
8. **Replace-all for repeated names** is the most-felt pain after the first fix (a candidate, not necessarily this goal).

## Open questions and assumptions to check

| # | Question / assumption | Quick check |
|---|---|---|
| Q1 | (A) Most wordless speech is fillers and false starts, not real words | Run 3 real talks; listen to every audio-speech stretch with no words and tally |
| Q2 | (A) People cut wordless speech far more often than they type into it | Count ⌫ vs typing on those stretches in a test build |
| Q3 | Should Magic see wordless speech (e.g. as "[sound]") so it can cut it, or leave it alone? | Product call for Pixel/Jony; it changes how often users must do #1 by hand |
| Q4 | Do people click between words and type (#7), and what do they expect then? | Watch 3 users add a missed word in the panel |
| Q5 | Does playback keep running while the fix field is open, and do people want it to? | Watch users proofread a 5-minute clip |
| Q6 | (A) Missed last words leave half-words at Magic's joins | Listen to the joins after a Magic run on `models/retakes.wav` |
| Q7 | Is "listen again" on a stretch worth it vs. typing? | Ask after Q1: if gaps are mostly real phrases, yes |

Suggested additions to `design/user-model.md` (Jony's file): Q1, Q2 and Q4 as assumptions; A10 ("fixing is rare")
still holds for *fixing text*, but not for *dealing with wordless speech*, which this research expects to be frequent.
