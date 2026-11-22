// The one selection on the screen, shared by the timeline and the transcript: { part, s, e, words?, cut? } in
// source time, one part, or null. From the transcript it is the words' span (`words: true`); from the timeline the
// dragged range; a selected cut has `cut: true`, a pause from the timeline strip `pause: true`. Pure, no DOM. Rules: design/edit-model.md (Selection).
// Tested in test/transcript.test.mjs.
import { toggleWords, toggleRange } from './cuts.js';

/** The words whose middle is inside the selection, as indexes { from, to } into `words`, or null. */
export function wordsIn(sel, words) {
  if (!sel) return null;
  let from = -1, to = -1;
  words.forEach((w, i) => {
    const mid = (w.s + w.e) / 2;
    if (sel.s <= mid && mid <= sel.e) { if (from < 0) from = i; to = i; }
  });
  return from < 0 ? null : { from, to };
}

/** Words from..to of one part as the shared selection. */
export const wordSelection = (part, words, from, to) => {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { part, s: words[a].s, e: words[b].e, words: true };
};

/**
 * ⌫ on the selection, the one toggle rule. Words → the pause-midpoint range (`toggleWords`); a time range or a cut →
 * the range as it is (`toggleRange`). @returns {{cuts: Array, label: string}}
 */
export function toggleSelection(cuts, sel, words, lengths = {}) {
  if (sel.words) {
    const hit = wordsIn(sel, words);
    if (!hit) return { cuts, label: '' };
    return toggleWords(cuts, sel.part, words.slice(hit.from, hit.to + 1), words, lengths);
  }
  const r = toggleRange(cuts, sel, lengths);
  const what = sel.pause ? ' pause' : sel.cut ? ' cut' : ''; // "Cut 0.8 s pause", "Restored 2.4 s cut"
  return { ...r, label: `${r.label}${what}` };
}

const EPS = 1e-6;

/**
 * What stays selected after ⌫ (or an undo of that ⌫). A cut or a time range keeps its ends, so ⌫ again toggles the
 * same spot back: a cut when one cut now spans exactly that range (⌫ restores it), else a time range (⌫ cuts it).
 * Words and pauses: nothing (as before). Spec: design/timeline-words-by-zoom.md (Interactions).
 */
export function keptSelection(sel, cuts) {
  if (!sel || sel.words || sel.pause) return null;
  const { part, s, e } = sel;
  const exact = cuts.some((c) => c.part === part && Math.abs(c.s - s) < EPS && Math.abs(c.e - e) < EPS);
  return exact ? { part, s, e, cut: true } : { part, s, e };
}
