// Transcription on demand (updates/2026-11-24 BETTER AUDIO SWAP - OPEN): nothing starts when a video loads. A part
// is transcribed when something asks for it (Magic, the Transcribe control), one part at a time. A swapped sound
// makes the words stale: they stay on screen until the new ones arrive. No DOM, no Tauri. Tested in
// test/transcripts.test.mjs.

/** Pure: this part still owes words someone asked for (none yet, or stale after a swap), and hasn't failed. */
export const owes = (p) => !!p.wanted && !p.error && (!p.transcript || !!p.stale);

/** Pure: anything asked for still on its way. Magic waits while this is true. */
export const transcribing = (parts) => parts.some(owes);

/** Pure: the part's sound changed (a swap): its words are now from the old sound. */
export function markStale(part) {
  if (part.transcript) part.stale = true;
  part.error = null;
}

/**
 * The queue. `run(id)` transcribes one part (it settles the part itself: transcript or error). `parts()` is the
 * project's parts, read again when a run's turn comes, so a part removed meanwhile is skipped (an undo puts it back
 * under a new id: ask again with that one).
 * @param {{parts: () => Array<{id:number, wanted?:boolean, stale?:boolean, transcript:object|null, error:string|null}>,
 *          run: (id:number) => Promise<void>}} deps
 */
export function createTranscripts(deps) {
  let queue = Promise.resolve();
  const queued = new Set(); // ids waiting or running: a second ask doesn't queue them twice

  function ask(part) {
    part.wanted = true;
    if (!owes(part) || queued.has(part.id)) return;
    queued.add(part.id);
    const { id } = part;
    queue = queue.then(() => (deps.parts().some((p) => p.id === id) ? deps.run(id) : undefined))
      .finally(() => queued.delete(id));
  }

  return {
    /** Ask for these parts' words (all parts when no ids). Returns when they have all settled. */
    request(ids) {
      deps.parts().filter((p) => !ids || ids.includes(p.id)).forEach(ask);
      return queue;
    },
  };
}
