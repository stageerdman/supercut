// Magic Trace: every Magic run's record, kept beside the edit and outside undo (design/magic-trace.md).
// Pure, no DOM. What the user did with a proposal is never recorded: it's worked out by comparing the run's
// proposals with the cuts as they are now, so merges, splits, undo and re-runs can't put it out of step.
// Tested in test/trace.test.mjs.
import { FRAME } from './bit.js';
import { normalize, restoreRange, covered, cutsOf } from './cuts.js';

const EPS = 1e-9;
const ms = (t) => Math.round(t * 1000) / 1000;
const near = (a, b) => Math.abs(a - b) <= FRAME + EPS;
const overlaps = (c, { part, s, e }) => c.part === part && c.s < e && s < c.e;
const sameCut = (a, b) => a.part === b.part && Math.abs(a.s - b.s) < EPS && Math.abs(a.e - b.e) < EPS;

export const emptyTrace = () => ({ runs: [] });

/**
 * One run's record from auto_cut's result: Rust's `run` (app, model, rules, custom, lines, groups, answer), the
 * proposed cuts, Magic's check notes, and your own cuts at run time (`before`, so "you'd cut it already" is known).
 */
export function newRun(result, { id, at, before }) {
  return { id, at, ...result.run, proposals: result.cuts, checks: result.notes ?? [], before };
}

/** The span the cuts make around `range`: the cuts overlapping it, plus neighbours joined within a frame. */
export function chainExtent(cuts, range) {
  const mine = cutsOf(cuts, range.part).sort((a, b) => a.s - b.s);
  const hit = mine.filter((c) => overlaps(c, range));
  if (!hit.length) return null;
  let i = mine.indexOf(hit[0]);
  let j = mine.indexOf(hit.at(-1));
  while (i > 0 && mine[i].s - mine[i - 1].e <= FRAME + EPS) i -= 1;
  while (j < mine.length - 1 && mine[j + 1].s - mine[j].e <= FRAME + EPS) j += 1;
  return { s: mine[i].s, e: mine[j].e };
}

const cutInside = (cuts, p) =>
  cutsOf(cuts, p.part).reduce((sum, c) => sum + Math.max(0, Math.min(c.e, p.e) - Math.max(c.s, p.s)), 0);

/**
 * What became of one proposal. `before` are your cuts at run time; `present` the part ids still in the project.
 * @returns {{kind:'gone'|'agreed'|'restored'|'kept'|'touched'} | {kind:'adjusted', ds:number, de:number, hole?:true}}
 */
export function outcome(p, cuts, before, present) {
  if (!present.includes(p.part)) return { kind: 'gone' };
  const slack = Math.min(FRAME, (p.e - p.s) / 4); // a tiny proposal still needs most of it covered
  if (covered(before, { part: p.part, s: p.s + slack, e: p.e - slack })) return { kind: 'agreed' };
  if (cutInside(cuts, p) < FRAME - EPS) return { kind: 'restored' };
  const now = chainExtent(cuts, p);
  const expected = chainExtent(normalize([...before, { ...p, by: 'you' }]), p);
  const hole = !covered(cuts, { part: p.part, s: Math.max(p.s, now.s), e: Math.min(p.e, now.e) });
  if (!hole && near(now.s, expected.s) && near(now.e, expected.e)) {
    const yours = cuts.some((c) => overlaps(c, p) && c.by === 'you' && !before.some((b) => sameCut(b, c)));
    return { kind: yours ? 'touched' : 'kept' };
  }
  return { kind: 'adjusted', ds: ms(now.s - expected.s), de: ms(now.e - expected.e), ...(hole && { hole: true }) };
}

export const outcomes = (run, cuts, present) => run.proposals.map((p) => outcome(p, cuts, run.before, present));

/** Cuts you made in the run's parts that Magic didn't propose and you hadn't made before (edge moves don't count). */
export function missed(run, cuts) {
  const parts = new Set(run.lines.map((l) => l.part));
  const known = [...run.proposals, ...run.before];
  const left = known.reduce((rest, k) => restoreRange(rest, k), cuts.filter((c) => parts.has(c.part)));
  const touchesProposal = (c) => run.proposals.some((p) => p.part === c.part && c.s <= p.e + FRAME + EPS && p.s - FRAME - EPS <= c.e);
  return left.filter((c) => !touchesProposal(c)).map(({ part, s, e }) => ({ part, s, e }));
}

/** A run's outcomes: final once frozen, else as the cuts stand now. */
export const judged = (run, cuts, present) =>
  run.frozen ?? { outcomes: outcomes(run, cuts, present), missed: missed(run, cuts) };

const freeze = (run, cuts, present) => (run.frozen ? run : { ...run, frozen: judged(run, cuts, present) });

/** A new run joins the trace. The run before it is frozen first, against the cuts it was judged by (before this run). */
export function withRun(trace, run, cuts, present) {
  const runs = trace.runs.map((r, i) => (i === trace.runs.length - 1 ? freeze(r, cuts, present) : r));
  return { runs: [...runs, run] };
}

/** A copy of one run, changed by `change(run)`. An unknown run id is a bug in the caller. */
function withRunChanged(trace, runId, change) {
  if (!trace.runs.some((r) => r.id === runId)) throw new RangeError(`trace: there is no run "${runId}"`);
  return { runs: trace.runs.map((r) => (r.id === runId ? change(r) : r)) };
}

/**
 * Cut review's verdict on proposals `indices` of a run (design/magic-trace.md, "Verdicts"), overwriting any given.
 * `verdict` = { says: 'yes'|'no', how?: 'restored', at, after, heard: [{ part, s, e }], note? }. Outside undo.
 */
export const withVerdict = (trace, runId, indices, verdict) =>
  withRunChanged(trace, runId, (r) => ({ ...r, verdicts: { ...r.verdicts, ...Object.fromEntries(indices.map((i) => [i, verdict])) } }));

/** Takes those verdicts back (⌘Z of a verdict in review). */
export const withoutVerdict = (trace, runId, indices) =>
  withRunChanged(trace, runId, (r) => {
    const verdicts = { ...r.verdicts };
    for (const i of indices) delete verdicts[i];
    return { ...r, verdicts };
  });

/** Mirrors renamePart: a part put back with a new id keeps its trace. */
export function renameTracePart(trace, from, to) {
  const rename = (list = []) => list.map((x) => (x.part === from ? { ...x, part: to } : x));
  const renameVerdicts = (v) => Object.fromEntries(Object.entries(v).map(([i, x]) => [i, { ...x, heard: rename(x.heard) }]));
  const renameRun = (r) => ({
    ...r,
    lines: rename(r.lines),
    proposals: rename(r.proposals),
    checks: rename(r.checks),
    before: rename(r.before),
    ...(r.verdicts && { verdicts: renameVerdicts(r.verdicts) }),
    ...(r.frozen && { frozen: { ...r.frozen, missed: rename(r.frozen.missed) } }),
  });
  return { runs: trace.runs.map(renameRun) };
}
