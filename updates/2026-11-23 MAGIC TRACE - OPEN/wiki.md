# Magic Trace: what this update taught us

- **Work out what the user did; don't record it.** `src/ui/trace.js` compares a run's proposals with the cuts as
  they are now. Merges, splits, edge drags, undo and re-runs need no wiring, and the answer can't drift from the edit.
- **Judge against the expected extent, not the proposal.** `withMagic` subtracts your cuts from Magic's, and
  `normalize` joins touching cuts. So a proposal can sit in pieces around your own cut, or run into it. The
  outcome compares the chain of cuts around the proposal with the chain `normalize([...before, proposal])` would
  give. Then "split" and "joined" read as kept, and only real edge moves read as adjusted.
- **"Touched" is told apart by `by`.** An edge drag makes a Magic cut yours (`moveEdge`). A proposal whose extent is
  unchanged but which now holds a cut of yours that wasn't there at run time was touched and left as it was.
- **Freeze on replace.** A newer run replaces the old run's cuts, so the old run's outcomes are judged by the cuts
  just before the new run lands, then frozen. The trace is outside undo: undoing the Magic step shows every
  proposal as restored, the clearest "no".
- **A log is written only on disagreement** (restored, adjusted, missed), when a run is replaced and when the
  window closes (`onCloseRequested` needs `core:window:allow-destroy`, because the handler closes the window
  itself). Same run id, same file: writing twice is harmless.
- **The atomic save is shared** (`src-tauri/src/atomic.rs`): rules and learning logs use the same
  temp-and-rename write.
- **One thing reaches the user:** a dropped take's reason gets "· kept “…”" (at most 70 characters). The hovers
  already read `reason`, so no view changed.
