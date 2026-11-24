// Edit map: kept spans laid end to end ([{ part, s, e, at }]: span s‥e of `part` plays from `at` in the edit), and
// the two ways through it: a part's own time to the edit's time, and back. The preview's map comes from Rust (its
// spans are whole frames: src-tauri/src/preview/plan.rs). Pure. Tested in test/edit-map.test.mjs.

const EPS = 1e-6;

/** Spans in play order → the map. */
export function laidOut(spans) {
  let at = 0;
  return spans.map((k) => {
    const placed = { part: k.part, s: k.s, e: k.e, at };
    at += k.e - k.s;
    return placed;
  });
}

/** The edit's length. */
export const lengthOf = (map) => (map.length ? map.at(-1).at + map.at(-1).e - map.at(-1).s : 0);

/** Edit time of `part` at its time `t`; null when t is not kept (in a cut). `slack`: how far past a span still counts. */
export function toEdit(map, part, t, slack = 0) {
  const k = map.find((x) => x.part === part && x.s - EPS <= t && t < x.e + slack - EPS);
  return k ? k.at + Math.min(t, k.e) - k.s : null;
}

/** Where edit time T plays: { part, t }, clamped to the edit; null for an empty edit. */
export function fromEdit(map, T) {
  if (!map.length) return null;
  let k = map[0];
  for (const x of map) if (x.at <= T + EPS) k = x;
  return { part: k.part, t: Math.max(k.s, Math.min(k.e, k.s + T - k.at)) };
}
