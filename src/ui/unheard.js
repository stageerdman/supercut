// Unheard speech: talking the transcript has no word for. The audio's speech runs minus the time words cover,
// derived (never stored), like pauses. Pure, no DOM. Spec: design/missed-words.md ("What unheard speech is").
// Tested in test/write.test.mjs.

export const MIN_UNHEARD = 0.3; // seconds: shorter pieces are word edges running long, not missed speech

const memo = new WeakMap();

/**
 * [{ s, e }] in time order. No speech runs (an old transcript, or the detector failed) → [].
 * @param {Array<{s:number,e:number}>} [speech]  the part's speech runs (transcript.speech)
 * @param {Array<{s:number,e:number}>} words  the part's words, in order
 */
export function unheard(speech, words = []) {
  if (!speech?.length) return [];
  const hit = memo.get(words);
  if (hit?.speech === speech) return hit.list;
  const list = [];
  for (const run of speech) {
    let at = run.s;
    for (const w of words) {
      if (w.e <= at || w.s >= run.e) continue;
      if (w.s - at >= MIN_UNHEARD - 1e-9) list.push({ s: at, e: w.s });
      at = Math.max(at, w.e);
    }
    if (run.e - at >= MIN_UNHEARD - 1e-9) list.push({ s: at, e: run.e });
  }
  memo.set(words, { speech, list });
  return list;
}
