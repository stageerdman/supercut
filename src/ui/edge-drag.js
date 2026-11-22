// Dragging (or nudging) one cut edge: pure, no DOM. Spec: design/timeline.md (Dragging an edge).
// Every move starts again from the drag-start list (moveEdge), so nothing accumulates; the end is one undo step.
import { moveEdge, cutsOf } from './cuts.js';
import { snap } from './timeline-geometry.js';

const EPS = 1e-9;

/**
 * @param {{cuts:Array, cut?:object, part:number, side:'s'|'e', lengths:object, targets?:number[], pps:number}} o
 *   `cut` from `cuts` (found by identity). No `cut` = a trim from a part's outer edge: start edge → a cut from 0,
 *   end edge → a cut to the end.
 */
export function startEdgeDrag({ cuts, cut, part, side, lengths, targets = [], pps }) {
  let base = cuts;
  let moving = cut;
  if (!moving) {
    const at = side === 's' ? 0 : lengths[part];
    // A part's start edge moves the end of a new cut that begins at 0 (and the other way round).
    moving = { part, s: at, e: at, by: 'you' };
    side = side === 's' ? 'e' : 's';
    base = [...cuts, moving];
  }
  if (!base.includes(moving)) throw new RangeError('startEdgeDrag: that cut is not in this list');
  let t = moving[side];
  let live = cuts;

  /** The moved cut in a list, by its moved edge (gone → undefined). */
  const find = (list) => cutsOf(list, part).find((c) => Math.abs(c[side] - t) < EPS) ??
    cutsOf(list, part).find((c) => c.s <= t + EPS && t <= c.e + EPS);

  return {
    get side() { return side; },
    get t() { return t; },
    /** Move the edge to source time `to`; snaps unless `free`. Returns the live cut list. */
    move(to, free = false) {
      t = Math.min(lengths[part] ?? Infinity, Math.max(0, snap(to, targets, pps, free)));
      live = moveEdge(base, moving, side, t, lengths);
      return live;
    },
    /** Nudge by `d` seconds (keyboard). */
    nudge(d) { return this.move(t + d, true); },
    /** The cut as it is now (for the length chip), or undefined when it closed. */
    get cut() { return find(live); },
    /** Release: the final list, its history label, and where the join is (so the playhead can wait before it). */
    end() {
      const changed = live !== cuts && JSON.stringify(live) !== JSON.stringify(cuts); // dragged back = no step
      const c = find(live);
      return { cuts: live, changed, label: cut ? 'Changed a cut' : 'Trimmed a part', join: c ? c.s : t };
    },
  };
}
