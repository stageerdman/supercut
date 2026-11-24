# Replace audio: the better-mic recording, lined up by sound

Author: Jony · 2026-11-24 · Update: `updates/2026-11-24 BETTER AUDIO SWAP - OPEN/`.
Transcript side (Generate, Regenerate): `design/transcript-panel.md`, section 6.
Checked against `design/user-model.md`, goal 5 ("better sound from a separate mic: fewer users, but every time") and
the INIT research (Step 6): they drop the mic file anywhere, expect it lined up by itself, and fear a sync they can't
check.

## User goal
"Use my good mic recording instead of the camera's sound, and be sure it lines up."

## What I removed, and why
| Removed | Why |
|---|---|
| A sync dialog, a "Sync" button, choosing clap vs waveform | Lining up by sound finds a clap anyway (tech research, §6). The drop *is* the command. |
| An A/B "hear the camera audio" toggle (INIT plan) | They know the mic sounds better. What they check is the **lips**, by playing. A way back exists (Use camera audio, ⌘Z). (A31) |
| Choosing which part the audio is for | The app finds where it fits. One long file covers both parts; two files fit one part each. |
| Showing the measured offset ("+3.217 s") | A number nobody can judge. The nudge shows only *your* change from the match. |
| A per-track mic badge on the timeline | The waveform redraws from the new audio: that's the visible proof. The Audio panel lists each part. |
| "Replace audio" during review | Not a review action; it hides with ✦ Magic Cut. |
| Volume, gain, noise cleanup | Not asked for. |

## Entry: drop it anywhere, or the button
```
│ my-video     Lining up shure-take.wav… ▬▬──   [∿ Replace audio]  ⚙  [✦ Magic Cut]  Review cuts │
```
- **Button:** in the toolbar, left of the gear. Plain (no fill: ✦ Magic Cut stays the one primary), 32 tall,
  radius 10, waveform glyph 15 pt + "Replace audio" (`body`, `textSecondary`, `text` on hover). Opens the file
  picker (WAV · M4A · MP3 · AIFF · AAC). Shown once a video is loaded; hidden while reviewing.
- **Drop:** any audio file dropped anywhere on the window = replace audio. Dragging one over the editor: the timeline's
  track area gets a 1.5 pt `accent` outline, `accent` 8 % fill and a centred label "Drop to replace audio"
  (`bodyStrong`). 120 ms ease. Nothing appears over the video.
- **Video and audio dropped together** (both dragged from one folder, INIT #25): the video opens, then the audio lines up.
- **Audio only, nothing open yet:** the drop zone reads "Add the video first" (border `textSecondary`); the drop
  does nothing.
- **Two audio files at once:** each one lines up to the part it fits.

## Lining up
1. Status line (toolbar): "Lining up shure-take.wav…" with its bar. The button is disabled meanwhile. Seconds, not
   minutes; play and cut as usual.
2. Each part is matched on its own. A part the file **fits** gets the new audio, the camera audio muted. A part it
   **doesn't fit** keeps what it had (camera audio, or an earlier mic file).
3. The result, one of these:

| Result | What the user sees |
|---|---|
| **Lined up** | Status 3 s: "Mic audio lined up" (two parts: "…· parts 1 and 2"). The waveform redraws from the new audio (fade 120 ms). The button now shows the file name. |
| **Lined up, mic shorter than the part** | Same, plus "· camera audio fills 0:20 at the end" (or "at the start"). Waveform bars where the camera fills: 30 % instead of 60 %. |
| **Lined up, not sure** | Applied. Banner: "Lined up, but not sure. Play a few seconds and watch the lips." · action **Adjust** (opens the Audio panel). |
| **Doesn't fit anywhere** | Nothing changes. Banner: "shure-take.wav doesn't match this video's sound. Nothing changed." · action **Choose another…** |
| Can't read / unsupported | Banner: "This audio file can't be read." / ".ogg files don't open yet. Try WAV, M4A or MP3." |

Every replacement is **one undo step** ("Replaced audio"). Cuts, notes and words don't move: they're in video time,
and the new audio is placed on that same time.

When a part with a transcript gets new audio, the transcript panel offers to regenerate (`design/transcript-panel.md`, §6).

## The button after a swap, and the Audio panel
Once any part uses mic audio the button reads **"∿ shure-take.wav"** (`text`, truncated at 160 pt, full name in the
tooltip; two different files: "∿ 2 mic files"). Clicking it opens the Audio panel: it floats under the button
like the rules panel (radius 10, `surface`, hairline, 16 padding, 320 wide). Esc or a click away closes it.
```
┌ Audio ─────────────────────────────────────┐
│ Part 1   shure-take.wav       ‹  0.00 s  › │
│ Part 2   Camera audio                      │
│                                            │
│ Replace…                  Use camera audio │
└────────────────────────────────────────────┘
```
- One row per part: the audio it uses (file name, or "Camera audio" in `textSecondary`). With one part, no "Part 1".
- **Nudge** (mic rows only): ‹ › move that part's audio one frame earlier / later; the value is **your** change from
  the match ("0.00 s" = as matched, "+0.07 s" = later). Space still plays and pauses while the panel is open, so you
  can watch the lips while nudging. Nudges in one opening of the panel are one undo step ("Nudged audio").
- **Replace…** opens the picker (same as the button before a swap).
- **Use camera audio** puts the camera audio back on every part (one undo step, "Back to camera audio"). The button
  returns to "Replace audio".
- No confirmation anywhere: ⌘Z undoes each step.

## States, all in one place
| State | Toolbar button | Elsewhere |
|---|---|---|
| No video | hidden | Drop zone: audio → "Add the video first" |
| Camera audio | ∿ Replace audio | — |
| Dragging audio over | unchanged | Timeline tracks outlined, "Drop to replace audio" |
| Lining up | disabled | Status line + bar |
| Mic audio on ≥ 1 part | ∿ file name | Waveform from the mic; transcript hint if it was made from other audio |
| Not sure / no fit / error | unchanged | Banner (one sentence, one action) |
| Reviewing | hidden | — |

## Accessibility
- Button: "Replace audio" / "Audio: shure-take.wav" (`aria-haspopup=dialog`, `aria-expanded`).
- Audio panel: `role=dialog`, label "Audio"; focus goes to the first nudge (or Replace…), Esc returns it to the button.
- Nudge: `role=spinbutton`, label "Audio timing, part 1", ← → / ↑ ↓ one frame, `aria-valuetext` "7 hundredths of a
  second later".
- Results are said by the status line (polite) or the banner (alert), as today. The drop highlight is also an
  `aria-live` text ("Drop to replace audio").
- All controls ≥ 28 pt; ‹ › are 28 × 28.

## Later: voice-over and music (not built now, nothing above blocks it)
- **Replace** keeps one meaning: *the voice of this part comes from a better recording of the same moment.* It is
  decided by sound: the file fits the video.
- A voice-over or music **doesn't fit** the video's sound. So the "doesn't fit" result is the natural fork: later that
  banner can offer "Add as voice-over" / "Add as music" instead of only "Choose another…".
- Added audio will get its own lane under the track (like the notes lane), never the track itself, so the part's own
  sound and anything laid on top stay separate and each can be muted or removed alone.

## Assumptions
- **A29** Most mic users drop the file rather than press the button. Check: log drop vs button.
- **A30** One frame is a fine enough nudge, and nudges are rare once lining up by sound works. Check: count nudges.
- **A31** Nobody misses an A/B toggle; lips are how they check. Check: ask 3 mic users after their first swap.
