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

/** "Your cut", naming a head or tail trim: its window plays what the viewer hears first or last. */
function yourReason(c, len) {
  if (c.s <= EPS) return 'Your cut · start of the video';
  if (c.e >= len - EPS) return 'Your cut · end of the video';
  return 'Your cut';
}

/** Every cut no Magic item covers, trims included. A cut Magic agreed with is yours. */
function yourItems(cuts, parts, magic) {
  const len = Object.fromEntries(parts.map((p) => [p.id, p.duration || Infinity]));
  return cuts
    .filter((c) => c.part in len && !magic.some((m) => overlaps(m, c)))
    .map((c) => ({ key: yourKey(c), index: null, part: c.part, s: c.s, e: c.e, by: 'you', reason: yourReason(c, len[c.part]), restored: false }));
}

/** An own cut's key: where it starts, so it outlives edits elsewhere. */
export const yourKey = (c) => `you:${c.part}:${c.s.toFixed(3)}`;

/**
 * Every cut to review, in play order: Magic's from the latest run while any of them is still cut (put back ones
 * stay, counted as checked, so "Cut 7 of 38" holds), then each cut of yours no Magic item overlaps, head and tail trims included. `kept`: your
 * cuts put back during this review, still items (restored) until it stops, unless cut again.
 * @returns {Array<{key:string, index:number|null, part, s, e, by:'magic'|'you', reason:string, restored:boolean}>}
 */
export function reviewCuts(trace, cuts, parts, kept = []) {
  const order = parts.map((p) => p.id);
  const run = trace.runs.at(-1);
  const fromRun = run ? magicItems(run, cuts, parts).filter((i) => order.includes(i.part)) : [];
  const magic = fromRun.some((i) => !i.restored) ? fromRun : []; // its step undone as a whole: no Magic cuts
  const yours = yourItems(cuts, parts, magic);
  const back = kept.filter((k) => order.includes(k.part) && !yours.some((y) => y.key === k.key));
  return [...magic, ...yours, ...back].sort(byPlay(order));
}

// ── the which-cuts choice (design/cut-review.md, "Which cuts are reviewed") ──

export const CHOICES = ['all', 'magic', 'unapproved'];

/** Still a cut and no "Looks good" yet: unchecked ones and Nos. */
const unapproved = (item, verdicts) => !item.restored && verdicts[item.key]?.says !== 'yes';

/**
 * The items a choice reviews. `taken`: the keys "Not approved yet" took when it was chosen (a Y doesn't make the
 * cut vanish under you); without it, the set as it is now.
 */
export function inSet(items, only, verdicts, taken = null) {
  if (only === 'magic') return items.filter((i) => i.by === 'magic');
  if (only === 'unapproved') return items.filter((i) => (taken ? taken.has(i.key) : unapproved(i, verdicts)));
  if (only === 'all') return items;
  throw new RangeError(`review: no such choice "${only}"`);
}

/** How many cuts each choice would review now (a choice with none is dimmed). */
export const setCounts = (items, verdicts) =>
  Object.fromEntries(CHOICES.map((only) => [only, inSet(items, only, verdicts).length]));

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

/**
 * What the timeline frames for a window: the source extent from its first played span's start to its last one's
 * end, cuts inside included. `{ i0, t0, i1, t1 }` (part index, source time), plus `seconds` of source it covers and
 * the part `gaps` it crosses, for the zoom (timeline-geometry.js zoomFor).
 */
export function stretchOf(window, parts) {
  const first = window.spans[0], last = window.spans.at(-1);
  const i0 = parts.findIndex((p) => p.id === first.part), i1 = parts.findIndex((p) => p.id === last.part);
  if (i0 < 0 || i1 < 0) throw new RangeError('review: a window outside the parts');
  let seconds = last.e - first.s;
  for (let i = i0; i < i1; i++) seconds += parts[i].duration;
  return { i0, t0: first.s, i1, t1: last.e, seconds, gaps: i1 - i0 };
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

/** After a new choice: the first unchecked stop whose join is at or after `fromTime` (edited s), else the first
 * unchecked from the start, else -1 (the end line). */
export function nearestUnchecked(list, verdicts, fromTime) {
  const open = (s) => !checked(s, verdicts);
  const i = list.findIndex((s) => open(s) && s.joins[0] >= fromTime - EPS);
  return i >= 0 ? i : list.findIndex(open);
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
