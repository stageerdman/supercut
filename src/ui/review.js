// Cut review (design/cut-review.md): which cuts are stops, how close ones group, the window each one plays, and
// where the user is. Pure, no DOM. Times: `s`/`e` are source time in a part; `from`/`to`/`join` are edited time
// (what the viewer hears). parts: [{ id, duration }] in play order; cuts: normalized (cuts.js).
// Tested in test/review.test.mjs.
import { outcomes, chainExtent } from './trace.js';
import { keptReason } from './magic.js';
import { keptSpans, editedTime, editedLength } from './playback.js';

const EPS = 1e-6;
export const LEAD = 3; // s of edited time played before a join
export const TAIL = 3; // … and after it
export const CLOSE = 3; // s of edited time: a join this soon after the last one joins its stop
export const MAX_GROUP = 3; // cuts in one stop, at most
const STILL_CUT = new Set(['kept', 'touched', 'adjusted']);
const STOPS = new Set([...STILL_CUT, 'restored']); // agreed and gone are no joins to judge

const byPlay = (order) => (a, b) => order.indexOf(a.part) - order.indexOf(b.part) || a.s - b.s;
const overlaps = (a, b) => a.part === b.part && a.s < b.e && b.s < a.e;

/** The reason line: Magic's reason naming the kept take, then a check note Magic left on that stretch. */
function magicReason(run, p) {
  const check = run.checks.find((c) => overlaps(c, p) && c.text);
  const reason = keptReason(p, run.lines);
  return check ? `${reason} · ${check.text}` : reason;
}

function magicItems(run, cuts, parts) {
  const told = outcomes(run, cuts, parts.map((p) => p.id));
  return run.proposals.flatMap((p, index) => {
    const kind = told[index].kind;
    if (!STOPS.has(kind)) return [];
    const restored = kind === 'restored';
    const span = restored ? p : chainExtent(cuts, p);
    return [{ key: String(index), index, part: p.part, s: span.s, e: span.e, by: 'magic', reason: magicReason(run, p), restored }];
  });
}

/** Your cuts, minus head and tail trims: they're deliberate and have no join to judge. */
function yourItems(cuts, parts) {
  const len = Object.fromEntries(parts.map((p) => [p.id, p.duration || Infinity]));
  return cuts
    .filter((c) => c.part in len && c.s > EPS && c.e < len[c.part] - EPS)
    .map((c) => ({ key: `you:${c.part}:${c.s.toFixed(3)}`, index: null, part: c.part, s: c.s, e: c.e, by: 'you', reason: 'Your cut', restored: false }));
}

/**
 * The cuts to review, in play order: Magic's from the latest run while any of them is still cut, else your own.
 * A Magic cut put back stays an item (counted as checked), so "Cut 7 of 38" holds while you work.
 * @returns {Array<{key:string, index:number|null, part, s, e, by:'magic'|'you', reason:string, restored:boolean}>}
 */
export function reviewCuts(trace, cuts, parts) {
  const order = parts.map((p) => p.id);
  const run = trace.runs.at(-1);
  const magic = run ? magicItems(run, cuts, parts).filter((i) => order.includes(i.part)) : [];
  const items = magic.some((i) => !i.restored) ? magic : yourItems(cuts, parts);
  return items.sort(byPlay(order));
}

/** Where a cut's join is heard, in edited time. */
function joinOf(item, parts, cuts) {
  return editedTime(parts, cuts, parts.findIndex((p) => p.id === item.part), item.s);
}

/**
 * Items grouped into stops: a join within CLOSE s of the one before joins its stop, at most MAX_GROUP cuts.
 * `first`/`last` number the cuts (1-based) for "Cuts 7–8 of 38".
 */
export function stops(items, parts, cuts) {
  const out = [];
  items.forEach((item, k) => {
    const join = joinOf(item, parts, cuts);
    const last = out.at(-1);
    if (last && last.items.length < MAX_GROUP && join - last.joins.at(-1) <= CLOSE + EPS) {
      last.items.push(item);
      last.joins.push(join);
      last.last = k + 1;
    } else out.push({ items: [item], joins: [join], first: k + 1, last: k + 1 });
  });
  return out;
}

/** "Cut 7 of 38" / "Cuts 7–8 of 38". */
export const stopCount = (stop, total) =>
  stop.first === stop.last ? `Cut ${stop.first} of ${total}` : `Cuts ${stop.first}–${stop.last} of ${total}`;

/** Seconds a stop removes (its cuts as they are now). */
export const removed = (stop) => stop.items.reduce((sum, i) => sum + (i.e - i.s), 0);

/** The kept source spans that play edited time [from, to), in play order. */
export function spansBetween(parts, cuts, from, to) {
  const out = [];
  let at = 0;
  for (const k of keptSpans(parts, cuts)) {
    const len = k.e - k.s;
    const s = Math.max(from, at), e = Math.min(to, at + len);
    if (e - s > EPS) out.push({ part: k.part, s: k.s + (s - at), e: k.s + (e - at) });
    at += len;
    if (at >= to - EPS) break;
  }
  return out;
}

/**
 * The window a stop plays: LEAD s before its first join to TAIL s after its last, in edited time, shifted to keep
 * its full length at the video's start or end. `edge` says which ('start' | 'end' | null). `spans` are what plays.
 */
export function reviewWindow(stop, parts, cuts) {
  const total = editedLength(parts, cuts);
  const want = stop.joins.at(-1) + TAIL - (stop.joins[0] - LEAD);
  let from = stop.joins[0] - LEAD, to = stop.joins.at(-1) + TAIL, edge = null;
  if (from < -EPS) [from, to, edge] = [0, Math.min(total, want), 'start'];
  else if (to > total + EPS) [from, to, edge] = [Math.max(0, total - want), total, 'end'];
  return { from, to, edge, spans: spansBetween(parts, cuts, from, to) };
}

// ── where the user is. `verdicts` = { [item.key]: { says, how? } } ──

const itemChecked = (item, verdicts) => item.restored || !!verdicts[item.key];

/** A stop is checked when every cut in it has a verdict or was put back. */
export const checked = (stop, verdicts) => stop.items.every((i) => itemChecked(i, verdicts));

/** Where review opens: the first unchecked stop, else the first (a second pass). -1 when there are none. */
export function openingStop(list, verdicts) {
  const i = list.findIndex((s) => !checked(s, verdicts));
  return i >= 0 ? i : list.length ? 0 : -1;
}

/** After a verdict: the next unchecked stop after `i`, or -1 (the end line), even if earlier ones were skipped. */
export function nextUnchecked(list, verdicts, i) {
  const k = list.slice(i + 1).findIndex((s) => !checked(s, verdicts));
  return k >= 0 ? i + 1 + k : -1;
}

/** ↓ (1) / ↑ (-1), no verdict and no wrap: `{ i, edge }`, edge 'last' / 'first' when it couldn't move. */
export function step(list, i, dir) {
  const to = i + dir;
  if (to >= list.length) return { i, edge: 'last' };
  if (to < 0) return { i, edge: 'first' };
  return { i: to, edge: null };
}

/** Counted in cuts: checked (verdict or put back), all of them, and the "fix later" Nos. */
export function progress(items, verdicts) {
  const toFix = items.filter((i) => verdicts[i.key]?.says === 'no' && !verdicts[i.key].how && !i.restored).length;
  return { checked: items.filter((i) => itemChecked(i, verdicts)).length, total: items.length, toFix };
}
