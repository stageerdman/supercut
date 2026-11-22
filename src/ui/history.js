// Undo / redo over the whole edit (cuts and words). One user gesture = one step, each with a short label.
// Pure, no DOM. Rules: design/edit-model.md (History). Tested in test/edit.test.mjs.
import { emptyEdit, renamePart } from './edit.js';

/**
 * A step is { edit, label, removed? }. `removed: { part, index }` marks "Removed part N": `part` is the removed
 * part's record (path, name, transcript…) so undo can add the same file back.
 */
export function createHistory(initial = emptyEdit()) {
  let past = [], now = { edit: initial, label: '' }, future = [];
  const all = (fn) => {
    past = past.map(fn);
    now = fn(now);
    future = future.map(fn);
  };

  return {
    get edit() { return now.edit; },
    /** Record a new edit. Same edit → no step (returns null). Clears redo. */
    push(edit, label, extra = {}) {
      if (edit === now.edit) return null;
      past.push(now);
      now = { ...extra, edit, label };
      future = [];
      return now;
    },
    /** Step back. Returns the step it undid ({ label, removed? }), or null when there's nothing to undo. */
    undo() {
      if (!past.length) return null;
      const undone = now;
      future.push(now);
      now = past.pop();
      return undone;
    },
    /** Step forward again. Returns the step it redid, or null. */
    redo() {
      if (!future.length) return null;
      past.push(now);
      now = future.pop();
      return now;
    },
    /** Change every state, past and future, without a step (e.g. a transcript arrived). */
    everywhere(fn) {
      all((step) => ({ ...step, edit: fn(step.edit) }));
    },
    /** A re-added part got a new id: swap it everywhere, also in "Removed part" steps. */
    rename(from, to) {
      all((step) => ({
        ...step,
        edit: renamePart(step.edit, from, to),
        ...(step.removed?.part.id === from && { removed: { ...step.removed, part: { ...step.removed.part, id: to } } }),
      }));
    },
  };
}

const sameCut = (a, b) => a.part === b.part && a.s === b.s && a.e === b.e && a.by === b.by;
const sameWord = (a, b) => a.w === b.w && a.s === b.s && a.e === b.e;

/** The time spans that differ between two cut lists: cuts in one and not the other. */
const cutSpans = (a, b) => [...a.filter((x) => !b.some((y) => sameCut(x, y))), ...b.filter((y) => !a.some((x) => sameCut(x, y)))];

/** The words that differ between two word maps, by trimming the equal words off both ends. */
function wordSpans(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => {
    const x = a[k] ?? [], y = b[k] ?? [];
    if (x === y) return [];
    let i = 0, j = x.length - 1, m = y.length - 1;
    while (i <= j && i <= m && sameWord(x[i], y[i])) i++;
    while (j >= i && m >= i && sameWord(x[j], y[m])) { j--; m--; }
    return [...x.slice(i, j + 1), ...y.slice(i, m + 1)].map((w) => ({ part: +k, s: w.s, e: w.e }));
  });
}

/** What changed between two edits, as one { part, s, e } (the first part that differs), or null. Undo scrolls to it. */
export function changed(a, b) {
  const spans = [...cutSpans(a.cuts, b.cuts), ...wordSpans(a.words, b.words)];
  if (!spans.length) return null;
  const part = spans[0].part;
  const mine = spans.filter((x) => x.part === part);
  return { part, s: Math.min(...mine.map((x) => x.s)), e: Math.max(...mine.map((x) => x.e)) };
}
