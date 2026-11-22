// Playback: what plays (the kept spans) and where to jump next. Source time in, edited time out for the readout.
// Pure, no DOM. Rules: design/edit-model.md (Playback). Tested in test/edit.test.mjs.
//   parts: [{ id, duration }] in play order; cuts: normalized (cuts.js).
import { FRAME } from './bit.js';
import { cutsOf } from './cuts.js';

const EPS = 1e-6;
const same = (a, b) => !!a && !!b && a.part === b.part && a.s === b.s && a.e === b.e;

/** The kept spans in play order: [{ part, s, e }]. Export will read the same list. */
export function keptSpans(parts, cuts) {
  return parts.flatMap(({ id, duration: len = 0 }) => {
    const out = [];
    let at = 0;
    for (const c of cutsOf(cuts, id)) {
      if (c.s > at + EPS) out.push({ part: id, s: at, e: Math.min(c.s, len) });
      at = Math.max(at, c.e);
    }
    if (len > at + EPS) out.push({ part: id, s: at, e: len });
    return out.filter((k) => k.e - k.s > EPS);
  });
}

/** The cut of that part at time t (s ≤ t < e), or undefined. */
export const cutHere = (cuts, part, t) => cutsOf(cuts, part).find((c) => c.s <= t + EPS && t < c.e - EPS);

/** Where a part starts playing: its first kept time, or null when it's all cut. */
export function firstKept(cuts, part, len) {
  let at = 0;
  for (const c of cutsOf(cuts, part)) if (c.s <= at + EPS) at = Math.max(at, c.e);
  return at < len - EPS ? at : null;
}

/**
 * Where to be next frame while playing part `part` (of length `len`) at time t.
 * → null: keep playing · { t }: jump there in this part · { end: true }: the rest of this part is cut.
 * `through` is a cut you started playing inside of: it plays, the next ones skip.
 */
export function skipTarget(part, t, cuts, len, through = null) {
  const c = cutsOf(cuts, part).find((x) => x.s <= t + FRAME && t < x.e - EPS && !same(x, through));
  if (!c) return null;
  return c.e >= len - EPS ? { end: true } : { t: c.e };
}

/** Kept seconds of one part before time t (inside a cut: up to the join). */
function keptBefore(cuts, part, t) {
  let cut = 0;
  for (const c of cutsOf(cuts, part)) if (c.s < t) cut += Math.min(c.e, t) - c.s;
  return t - cut;
}

/** Edited time (the finished video's clock) at part index i, source time t. */
export function editedTime(parts, cuts, i, t) {
  const before = parts.slice(0, i).reduce((sum, p) => sum + keptBefore(cuts, p.id, p.duration || 0), 0);
  return before + (parts[i] ? keptBefore(cuts, parts[i].id, Math.min(t, parts[i].duration || t)) : 0);
}

/** The finished video's length. */
export const editedLength = (parts, cuts) => editedTime(parts, cuts, parts.length, 0);
