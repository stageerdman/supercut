# Timeline words by zoom — wiki

Lessons and principles from this update (durable knowledge, not status).

- **A clipped word is worse than no word.** The first strip clipped each word to its slot; zoomed out that made
  letter fragments that read as noise. Text on a timeline is drawn whole or not at all.
- **Measure zoom in the unit the content lives in.** For words that's points per word, not points per second: it
  follows how fast the person talks.
- **Thresholds need hysteresis.** A pinch that rests on a threshold otherwise flips the whole strip every frame.
- **One sign per meaning.** A cut was shown three ways (track hatch, struck words, hatched pauses). One block above
  everything says it once and is easier to click.
- **Per-frame layout must be pointer-walked, not scanned.** Checking every label against every pause and cut was
  5 ms a frame on a 20-minute part in the phrases level. Caching kept/phrase data per words list (keyed by the cuts
  list) and walking the obstacles with one pointer brought it to 0.4 ms. Pinch frames are what this code runs in.
- **Lay out past the edges.** Labels are laid out a screen beyond each side, so a label scrolling in is already
  known and doesn't fade in as if it were new.
