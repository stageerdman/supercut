// Transcription on demand (updates/2026-11-24 BETTER AUDIO SWAP - OPEN, design/transcript-panel.md §6): nothing
// starts when a video loads or its sound changes. A part is transcribed when something asks (Generate, Regenerate,
// Magic), one part at a time. Each transcript remembers the file it was heard from (`heard`): once the part plays
// other audio its words are stale, and stop being stale when the audio goes back (⌘Z, Use camera audio).
// No DOM, no Tauri. Tested in test/transcripts.test.mjs.
import { mediaOf } from './media.js';

/** Pure: the part has words, made from other audio than it plays now. */
export const stale = (p) => !!p.transcript && p.heard != null && p.heard !== mediaOf(p);

/** Pure: a request for this part is waiting or running. Magic waits while any is. */
export const owes = (p) => !!p.wanted;

/** Pure: anything asked for still on its way. */
export const transcribing = (parts) => parts.some(owes);

/**
 * Pure: what the panel shows for a part (transcript-panel.md §6):
 * 'generate' (no words yet) · 'working' (its first words on the way) · 'failed' · 'regenerating' (old words stay) ·
 * 'stale' (words from other audio) · 'ready'.
 */
export function wordsState(p) {
  if (!p.transcript) return p.wanted ? 'working' : p.error ? 'failed' : 'generate';
  if (p.wanted) return 'regenerating';
  return stale(p) ? 'stale' : 'ready';
}

/**
 * Pure: a regenerated part's words. Words you fixed or wrote (`fixed`) stay; new words that overlap one are
 * dropped; everything else is the new transcript. In time order.
 */
export function regenerated(old, fresh) {
  const kept = old.filter((w) => w.fixed);
  const clear = (w) => !kept.some((k) => w.s < k.e && k.s < w.e);
  return [...kept, ...fresh.filter(clear)].sort((a, b) => a.s - b.s);
}

/**
 * The queue. `run(id)` transcribes one part (it settles the part itself: transcript or error). `parts()` is the
 * project's parts, read again when a run's turn comes, so a part removed meanwhile is skipped (an undo puts it back
 * under a new id: ask again with that one).
 * @param {{parts: () => Array<{id:number, wanted?:boolean, transcript:object|null, error:string|null}>,
 *          run: (id:number) => Promise<void>}} deps
 */
export function createTranscripts(deps) {
  let queue = Promise.resolve();

  function ask(part, again) {
    if (part.wanted) return; // already on its way
    if (part.transcript && !(again && stale(part))) return;
    part.wanted = true;
    part.error = null;
    const { id } = part;
    queue = queue.then(() => (deps.parts().some((p) => p.id === id) ? deps.run(id) : undefined))
      .finally(() => { part.wanted = false; });
  }

  return {
    /** Words for parts that have none (all parts when no ids): Generate, Try again, Magic. Resolves when settled. */
    request(ids) {
      deps.parts().filter((p) => !ids || ids.includes(p.id)).forEach((p) => ask(p, false));
      return queue;
    },
    /** New words for parts whose words are from other audio (all such parts when no ids): Regenerate. */
    regenerate(ids) {
      deps.parts().filter((p) => !ids || ids.includes(p.id)).forEach((p) => ask(p, true));
      return queue;
    },
  };
}
