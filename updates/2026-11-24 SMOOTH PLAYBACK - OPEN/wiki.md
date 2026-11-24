# Smooth playback: what we learned

## Root cause (confirmed)
- **Freeze at cuts:** WebKit freezes the picture about 0.3 s whenever a playing video seeks or starts. The twin
  player hid the seek on a second video, but that video needs about 0.85 s to settle, so kept parts shorter than that
  (e.g. 17.3–18 s) still froze. This is the engine, not a tuning problem.
- **Playhead back and forth:** two causes. The glide clock was reset at every twin swap, so the playhead took the new
  video's clock as is (up to 0.1 s off). And the play clock ran ahead up to 0.5 s, then took a backward reading over
  0.25 s as a seek and jumped back.

## The fix
- **Play a preview of the edit.** Rust `preview` renders the kept parts back to back into one small video (each
  part a cached clip, frame-exact, joined without re-encoding; the sound cut from the source to the same frame-exact
  lengths). While playing, the app plays that one file: nothing seeks or starts at a cut, ever. The playhead is the
  preview's time mapped back to the source through the edit map (`src/ui/edit-map.js`).
- **Forward-only play clock** (`src/ui/play-clock.js`): while playing it never goes back; only a real seek
  (`reset()`) or a new part does. The glide clock is no longer reset at a swap.
- **Sound:** it comes from the same preview file as the picture, so WebKit keeps them in step. A Rust test checks the
  rendered video and sound lengths match. A headless browser can't measure sound directly, so this is checked by
  construction, not by ear.

## Known limits
- The first Play after an edit uses the old twin player until the preview is rendered (~0.4 s wait, then the
  render; 0.6 s for the 20 s test clip, cached clips make re-renders fast).
- Editing while playing hands back to the source until the next Play.
- The playhead trails the picture by 0.1–0.25 s (the clock glides rather than jumps). It never steps back.

## Results (WebKit, headless, 1080p30 20 s test clip, cuts incl. 0.5 s and 0.7 s kept parts)
| Way | Runs | Clean | Notes |
|---|---|---|---|
| Twin (old) | 20 | 16 | holds of ~0.3 s on short kept parts |
| Preview, machine under heavy load (18 on 8 cores) | 24 | 19 | holds mid-part, not at cuts; contention |
| Preview | 24 | **24** | every cut within one frame (+17–35 ms), playhead never back |

Not measured on the user's own video: it was not reachable from the project folder and the user chose the test clip.

## How to measure
```
cd "updates/2026-11-24 SMOOTH PLAYBACK - OPEN/measure" && npm install   # once
RUNS=24 node "updates/2026-11-24 SMOOTH PLAYBACK - OPEN/measure/measure.mjs"
```
Env: `SRC=<video>` to use another video, `OFFSET=<s>` to shift the cuts, `TWIN=1` for the old way. The preview is
rendered by the ignored cargo test `render_for_measure` (`src-tauri/src/preview/mod.rs`).
