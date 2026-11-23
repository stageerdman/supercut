// Magic Trace learning logs (design/magic-trace.md): a run the user disagreed with, as one replayable test case.
// Pure, no DOM. Rust writes it (`save_learning_log`). Tested in test/learning.test.mjs.
import { judged } from './trace.js';

const DISAGREED = new Set(['restored', 'adjusted']);
const AROUND = 5; // seconds of final cuts kept around a case: enough to see what the user ended with there

/** The lines around a range: those it overlaps, one either side, and the take kept instead. */
function nearbyLines(lines, { part, s, e }, instead) {
  const hit = lines.flatMap((l, i) => (l.part === part && l.s < e && s < l.e ? [i] : []));
  const around = hit.length ? lines.slice(Math.max(0, hit[0] - 1), hit.at(-1) + 2) : [];
  const kept = lines.find((l) => l.id === instead);
  return kept && !around.includes(kept) ? [...around, kept] : around;
}

const cutsAround = (cuts, { part, s, e }) =>
  cuts.filter((c) => c.part === part && c.e > s - AROUND && c.s < e + AROUND).map((c) => ({ part: c.part, s: c.s, e: c.e, by: c.by }));

const proposalCase = (run, cuts) => (proposal, outcome) =>
  ({ kind: 'proposal', proposal, outcome, lines: nearbyLines(run.lines, proposal, proposal.instead), cuts: cutsAround(cuts, proposal) });

const missedCase = (run, cuts) => (span) =>
  ({ kind: 'missed', span, lines: nearbyLines(run.lines, span), cuts: cutsAround(cuts, span) });

/**
 * The log of one run: its record, every outcome, the missed cuts, and a case for each disagreement (restored,
 * adjusted, missed). Null when the user agreed with everything: such a run isn't worth the disk space.
 */
export function learningLog(run, cuts, present) {
  const { outcomes, missed } = judged(run, cuts, present);
  const toProposal = proposalCase(run, cuts);
  const cases = [
    ...run.proposals.flatMap((p, i) => (DISAGREED.has(outcomes[i].kind) ? [toProposal(p, outcomes[i])] : [])),
    ...missed.map(missedCase(run, cuts)),
  ];
  const { frozen, ...record } = run;
  return cases.length ? { run: record, outcomes, missed, cases } : null;
}
