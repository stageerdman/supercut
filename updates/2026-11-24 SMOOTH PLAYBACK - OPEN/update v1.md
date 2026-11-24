# Smooth playback: update v1

## Goal
Playing over cuts is truly smooth: no lag, no freeze at any cut (short kept parts included), the playhead never
steps back, and the sound stays in sync. Follows `2026-11-23 SEAMLESS CUTS` (one twin video, 16 of 20 runs clean,
fails on kept parts under ~0.85 s).

## Root cause (to confirm in phase 1)
- **Freeze:** anything that seeks or starts a video at a cut stalls WebKit's picture ~0.3 s. The twin hides the seek,
  but needs ~0.85 s to settle, so a short kept part has no time to hide it. Not fixable by tuning: it is the engine.
- **Playhead back and forth:** the playhead follows the video's own `currentTime`. At a swap it takes the twin's
  clock as is (the glide clock is reset), and that clock lands up to 0.1 s off and stands still while it settles.

## Phases
1. **Spike: a preview of the edit (research).** Render the kept parts back to back into one small video with the
   bundled ffmpeg (VideoToolbox), then play that one file: nothing seeks or starts at a cut, ever. Measure the render
   time on a long clip and the frames in WebKit (`spike/`). Findings in `wiki.md`.
2. **Preview render (Rust).** A `preview` module: each kept part is its own cached clip (frame-exact, same frame
   rate), joined without re-encoding; the sound is cut from the source in one pass to the same frame-exact lengths.
   It returns the file and its map (where each kept part starts in the preview). Tests: the plan (pure), and one real
   render whose length matches the map.
3. **Play the preview.** The player plays the preview whenever it matches the current cuts; the playhead is the
   preview's time mapped back through the map, so it only moves forward. Pausing shows the source at the same frame;
   playing from inside a cut (you asked to hear it) or before the preview is ready plays the source as before.
   Tests: the map (pure), and a playhead that never steps back over cuts.
4. **Measure and ship.** 20+ runs in WebKit over all cuts, short ones included: no hold, playhead monotonic, sound
   in sync. Rebuild, install in Applications, push.

## Status
- Phase 1: started.
