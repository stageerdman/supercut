# The transcript panel: blocks, width, rail, search, following seeks

Author: Jony · 2026-11-22 · Builds on `design/transcript-editing.md` (cutting and fixing words stay exactly as they are).
Checked against `design/user-model.md`: the user edits long talks by reading. They told us it "reads as one blob" and
that they lose track of *where in the video* they are while scrolling.

## User goal
"Find my place in what I said, fast, and always know which moment of the video I'm looking at."

## What I removed, and why
| Removed | Why |
|---|---|
| The native scrollbar | The rail does its job in *time* (where you are in the video), not in pixels. Two strips on one edge is noise. The wheel still scrolls. |
| Clickable block timestamps | Clicking any word already goes there. The time is a label, not another control. |
| Search options (case, whole word, regex) | People search for a word they remember saying. Case and punctuation are ignored; phrases work. |
| "Replace" / "Cut all matches" | Not asked for. Easy to add later on the same matches if people want it (A13). |
| Search moving the playhead | Typing would make the video jump on every letter. Search scrolls; a click on the word goes there. (A12) |
| Cuts drawn on the rail | The timeline shows cuts. The rail answers one question: where am I. |
| A width preset menu | Drag the divider; double-click puts it back to 320. |

## Layout
```
│ video (shrinks)          ┃ Transcript        [⌕ gonna   2/5 ˄ ˅] │
│                          ┃ 00:00                              ║ │
│                          ┃ So today I want to show you how…   ║ │ ← rail: 12 wide hit area, 2 pt track
│                          ┃                                    █ │ ← visible window (white 16 %, 6 wide)
│                          ┃ 00:42                              ━ │ ← playhead (accent, 10 × 2)
│                          ┃ The first thing is…                ║ │
     divider (8 wide hit area, 1 pt hairline; accent while dragging)
```

### 1. Blocks
- Each part's words split into blocks (`blocksOf`, `src/ui/blocks.js`). A new block starts:
  - after a pause ≥ **1.5 s**, or
  - after a sentence end (. ? !) once the block has **≥ 30 words**, or
  - after any pause ≥ 0.4 s once it has **≥ 80 words**, or at **120 words** (no punctuation, no pauses).
- Each block: its start time above it (`caption` 11 / medium, `textSecondary`, tabular digits, the part's own clock,
  like the timeline ruler), then the paragraph. 16 pt between blocks.
- Two parts: the "Part 1" / "Part 2" headings stay; blocks sit under them.
- Selection, ⌫, the fix field and dragging across blocks work as before: blocks only change the layout.

### 2. Width
- The divider is the panel's left edge: 8 pt wide hit area, a 1 pt hairline in it, `col-resize` cursor.
  Hairline turns accent while hovered or dragged. Drag → the panel widens, the video shrinks.
- Bounds: 260 pt … the window width minus 360 pt for the video (and never over 720).
- Remembered (localStorage `transcriptWidth`), clamped again when the window is smaller.
- Double-click → 320. Keyboard: it is a focusable `separator`; ← → change it by 16 pt.

### 3. The rail (mini-timeline)
- A 12 pt column on the right of the words, full height of the text area. A 2 pt track (`raised`) maps the whole
  recording top to bottom (two parts stack, a 4 pt gap between).
- **Visible window:** a 6 pt wide rounded bar (white 16 %) from the time of the first word on screen to the last.
- **Playhead:** a 10 × 2 accent mark at the playhead.
- Hover: a small time label next to the pointer ("04:12"). Click or drag: the playhead goes there (play/pause kept),
  the transcript scrolls there, the timeline shows it.
- Keyboard: a `slider` ("Position in video", value text "04:12"); ↑ ↓ move 5 s, PageUp/PageDown 30 s.

### 4. Search
- A field right of the "Transcript" title: magnifier, placeholder "Search", 28 tall, radius 6, `bg` fill, hairline.
  ⌘F focuses it.
- As you type: every match lights (white 14 % background), the current one stronger (accent 35 %). The count shows
  "2/5" (or "0/0"), then ˄ ˅ buttons.
- Enter / ↓ / ˅ → next, ⇧Enter / ↑ / ˄ → previous (both wrap). Each step scrolls the match into view.
- The first match is the first one at or after the playhead, so search starts where you are.
- Esc clears the search; Esc again (empty) gives focus back to the words.
- Matching ignores case and punctuation; a phrase matches across words ("going to"). Within one part only.
- Searching counts as scrolling by hand: playback won't pull the panel away from the match for 4 s.

### 5. Following seeks
- Any seek you make elsewhere — a click or scrub on the timeline, the rail, ← → — scrolls the transcript to that
  moment and lights the word there, **even if you scrolled the panel a moment ago**: the seek is your newer intent.
- Scrubbing scrolls instantly (no smooth lag); a single click scrolls smoothly (instant with Reduce Motion).
- Seek into a pause: nothing lit, the next word is brought into view.
- Playback following is unchanged: it pauses for 4 s after you scroll, select or search in the panel.

### 6. Generate and Regenerate (2026-11-24, update BETTER AUDIO SWAP)
Transcription no longer starts by itself: it starts when you ask. The reason is the mic users: a transcript of the
camera audio is wasted work once the better recording is in, and it's less accurate. So the panel is **always there
once a video is loaded** (it replaces "no empty panels": the panel is now where the transcript begins), and it never
looks empty: it holds the one thing to do.

**No transcript yet.** The words area shows, centred horizontally, 40 % down:
```
│ Transcript                          │
│                                     │
│       [  Generate transcript  ]     │ ← 32 tall, radius 10, `raised` fill, `text`, bodyStrong, 16 side padding
│   From the camera audio · on this Mac│ ← caption, `textSecondary`
```
- The line under it names the audio it will use: "From the camera audio" or "From shure-take.wav". It answers
  "which sound?" at the moment it matters, without instructions. "· on this Mac": nothing leaves the Mac.
- Not accent: ✦ Magic Cut stays the one filled primary. Alone in an empty panel, a raised button is unmissable.
- No search field, no rail, no divider handle change (the divider still works).
- **✦ Magic Cut without a transcript** still works in one press: it starts the transcript and queues itself
  ("Magic queued ✕", as in `design/main-screen.md` state 8). The straight line stays drop → Magic.

**Generating.** The button's place shows the progress (it's where you asked, and where the words will appear):
"Transcribing… 42 %" (`body`, `textSecondary`, tabular), a 96 pt bar under it, "about 3 min" (caption). First run:
"Downloading speech model · 465 MB · about 2 min" first, same place. The toolbar status line no longer shows
transcription (it still shows Magic's queue). Words appear when the part is done.

**Failed.** "Couldn't transcribe this part." and the same raised button, **Try again**. No banner: it's said in place.

**Two parts.** Generate makes every missing transcript, in order. A part added later shows its own heading ("Part 2")
with the same block under it, left aligned, after part 1's words. One part transcribing shows its progress there.

**New audio after a transcript** (a part's transcript was made from other audio than it uses now, `design/audio-swap.md`):
- **Hint**, once, right after the swap: a row under the header, 12 side margin, radius 10, `raised`, 36 tall:
  `New audio. A fresh transcript may be more accurate.   Regenerate   ✕`
  (text `body`; **Regenerate** a plain `bodyStrong` text button in `text`, not accent: accent means cut; ✕ dismisses). It goes away when you regenerate, dismiss
  it, or the audio goes back to what the transcript was made from (⌘Z, Use camera audio).
- **Icon**, for as long as the transcript is from other audio: a 28 × 28 ↻ (`arrow.clockwise`, 13 pt,
  `textSecondary`, `text` on hover) right of the search field. Tooltip "Regenerate transcript from the new audio".
  Gone when the transcript matches the audio again. Two parts: it regenerates every part that needs it.
- **While regenerating** the old words stay readable and editable; the hint row (shown again if dismissed) reads
  "Regenerating… 42 %" with its bar, no buttons. The ↻ is disabled.
- **Done:** the new words replace the old in one step ("Regenerated transcript", ⌘Z brings the old words back);
  status line "Transcript regenerated · ⌘Z to undo" for 3 s.
- **What stays:** cuts and notes (they're time, not words). **Words you fixed or wrote** (`fixed`) stay too: new words
  that overlap them are dropped. Everything else is the new transcript. Search re-runs on the new words.

## States
| State | Panel |
|---|---|
| Video loaded, no transcript | Generate transcript + which audio (§6) |
| Transcribing | Progress in place of the button (§6) |
| Transcription failed | "Couldn't transcribe this part." + Try again |
| Transcript from older audio | ↻ by search; hint row once after the swap (§6) |
| Regenerating | Old words stay; hint row shows progress |
| Words arriving | Blocks fill in; the rail grows with the parts' lengths |
| Search, no match | "0/0", arrows disabled, nothing lit |
| Search while words change (a fix, a new part) | Matches recomputed; the current index kept when it still exists |
| Narrow window | The saved width is clamped so the video keeps 360 pt |

## Accessibility
- Divider: `role=separator`, `aria-orientation=vertical`, `aria-valuenow` (width), label "Transcript width".
- Rail: `role=slider`, label "Position in video", `aria-valuetext` the playhead time.
- Search: `role=searchbox` label "Search transcript"; the count is a polite live region ("2 of 5").
- Block times are `aria-hidden` (each word already has its time as title); blocks are `role=group`.
- Generate: a real button, label "Generate transcript", described by its "From …" line. Progress: `role=progressbar`
  "Transcription progress" (moved here from the toolbar). Focus after Generate stays on the progress block's region,
  then moves to the words when they arrive only if focus was still there.
- Hint row: `role=status` (polite), so the swap's offer is heard once. ↻: `aria-label` "Regenerate transcript".

## Assumptions
- **A11** 1.5 s pauses and 30-word sentence groups make readable blocks for talking-head recordings. Check: open a
  20 min recording; blocks should be 2–6 lines most of the time.
- **A12** People expect search to scroll, not to move the playhead. Check: watch the first search; do they click the word?
- **A13** Nobody needs "cut all matches" yet.
