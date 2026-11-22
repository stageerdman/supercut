# Editing in the transcript

Author: Jony · 2026-11-22 · Status: ready to build (Phase 6). Model: `design/edit-model.md`. Panel layout: `design/main-screen.md` (320 pt, right of the player).
Checked against `design/user-model.md`: the first thing people try with a transcript is select + Backspace (observed);
Descript habit "text = video".

## User goal
"Read what I said, strike what I don't want, and fix the words it heard wrong." Cutting is the frequent job;
fixing is the occasional one. So cutting needs no mode, and fixing needs one gesture.

## What I removed, and why
| Removed | Why |
|---|---|
| A free-text editor (the whole panel `contenteditable`) | Then ⌫ means "delete letters" in one place and "cut video" in another. Here ⌫ always cuts; letters are only edited inside the fix field. |
| An Edit / Correct mode switch | Typing over selected words *is* fixing. No mode to remember. |
| Insert-a-word caret between words | Fix a neighbour and type the extra word ("gonna" → "going to"). Same field, no new gesture. |
| Marks on fixed words | Fixed text is just the text. |
| Folding long cut runs ("⋯ 48 words cut") | Not until struck text proves hard to read (assumption A9). |
| Click-to-play | Clicking a word moves the playhead and keeps play/pause as it was; selecting words to cut shouldn't start the sound. Space plays. |

## Interactions
| Do | Result |
|---|---|
| Click a word | Playhead to its start; the word is selected (shared selection, so the timeline shows it) |
| ⇧-click / drag across words | Extend the selection |
| ⌫ / Delete | The one toggle rule: cut the words (half the pause each side goes too), or bring them back if they're all cut |
| Type a letter with words selected (focus in the panel) | The fix field opens over them, holding that letter |
| Double-click a word, or Return on a selection | The fix field opens with the words' text, all selected |
| Return, or click away | Commit the fix: one undo step "Fixed “gonna”" |
| Esc | In the field: cancel. Outside: clear the selection |
| ⌘Z / ⇧⌘Z | Outside the field: the app's undo. Inside: the field's own text undo |
| Space, ← → | As everywhere (play, one bit). Inside the field they type / move the caret |

### The fix field
- Inline, in place of the selected words: same font (15 / 1.5), `bg` fill, 1 pt accent outline, radius 6, grows with
  the text and wraps with the paragraph. No label, no button.
- Commit splits the text on spaces into words that share the old words' time (by letter count,
  `fixWords` in the model). Empty text = no change.
- A cut word stays cut after a fix; the strike shows again on commit.
- Fixed words reach Magic on its next run: it reads the text you see.

## Look
| Word | Style |
|---|---|
| Kept | `text` |
| Cut by you | `textSecondary`, struck through in `textSecondary` 2 pt |
| Cut by Magic | `textSecondary`, struck through in `accent` 2 pt |
| Under the playhead | `accent` text (today's lit word); in a cut it keeps the strike |
| Selected | `accent` 20 % background, radius 4 |
| Hover | `raised` background; title: kept → time; cut → "Cut · 0:42 · Backspace brings it back"; Magic → "Magic Cut: earlier take · Backspace brings it back" (today's `cutTitle`) |

Same two colours as the timeline hatch, so "grey = mine, coral = Magic" reads the same in both places.

## Following the playhead
- The lit word follows playback (today) and the panel **scrolls to keep it in view**, placed about a third from the
  top, smooth (instant with Reduce Motion).
- You scrolled the panel yourself (wheel, drag, keys) → following pauses for **4 s** after the last scroll, then
  picks up at the next word. While the fix field is open it never scrolls.
- Seeking from the timeline while paused also brings the word into view.
- Undo/redo scroll the changed words into view.

## Shared selection
Selecting words shows the range on the timeline; a time range on the timeline selects the words whose middle is
inside it (highlighted here). ⌫ works on it from either place. One selection, never two.

## States
| State | Panel |
|---|---|
| No transcript yet | No panel (as today) |
| Words arriving | Panel slides in, fills as they come; cutting already works on what's there |
| No speech in a part | "No speech found." (today) |
| Magic running | Everything works; results strike in when they land |
| Two parts | "Part 1" / "Part 2" headings (today). A selection stays in the part where it began: dragging or ⇧-clicking into the other part stops at the last word of the first (same clamp as the timeline, `selection.js`). This replaces today's per-part grouping in `selectedWords()` |

## Accessibility
- Words are reachable with the keyboard: with focus in the panel, ← → move the selection one word (⇧ extends),
  Return fixes, ⌫ cuts. Global ← → still step the playhead when focus is elsewhere.
- Each word's accessible name includes its state: "gonna, cut by Magic". The fix field: "Fix words, gonna".
- Contrast: struck `textSecondary` on `surface` ≈ 7:1; the strike line is 2 pt.
