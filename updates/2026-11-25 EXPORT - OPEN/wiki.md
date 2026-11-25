# Export — lessons

- **Count in frames, not seconds.** Snap each span's edges to the frame grid (`k = round(s·fps)`,
  `n = round(e·fps) − k`) so a shared edge lands on the same frame from both sides; the total length is then the sum
  of `n`, and seconds are derived from it, never added up as floats.
- **Seek a quarter frame early.** An accurate seek to exactly `k/fps` can land on `k−1` or `k+1` from rounding;
  seeking to `(k − ¼)/fps` and keeping `n` frames always starts on frame `k`.
- **Encode the picture once.** Segments are encoded at full quality; the join copies them (`-c:v copy`). Sound is cut
  fresh in the join from each part's media, sample-exact to the segment's length, with a few-ms fade on each side of
  every join: that is what stops the pops.
- **Cancel per progress line.** ffmpeg is run with `-progress pipe:1`; each line is a chance to check the cancel flag
  and kill the process. The join needs `-progress` too, or a cancel during it waits for the end.
- **Write beside, then rename.** The join writes `.<name>.partial` next to `out` and renames it, so the user's folder
  never shows a half file, and a failure or cancel removes the temp.
- **Swapped audio needs nothing extra.** `Part::media()` is already the remux with the mic sound.
