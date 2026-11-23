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

const UNCHANGED = new Set(['kept', 'touched']);

/**
 * What cut review adds to a case (design/magic-trace.md, "No, then fixed"). Fixed: the red note is done or the
 * cut no longer stands as Magic left it, since people fix a cut and forget to tick its note.
 */
function reviewed(verdict, outcome, notes) {
  const note = verdict.note && notes.find((n) => n.id === verdict.note);
  const doneAt = note?.done ? note.doneAt ?? null : null;
  const { says, how, after, heard } = verdict;
  const fixed = says === 'no' && (doneAt != null || !UNCHANGED.has(outcome.kind));
  return { verdict: { says, ...(how && { how }), after }, heard, fixed, doneAt };
}

const proposalCase = (run, cuts, notes) => (proposal, outcome, verdict) => ({
  kind: 'proposal',
  proposal,
  outcome,
  lines: nearbyLines(run.lines, proposal, proposal.instead),
  cuts: cutsAround(cuts, proposal),
  ...(verdict && reviewed(verdict, outcome, notes)),
});

const missedCase = (run, cuts) => (span) =>
  ({ kind: 'missed', span, lines: nearbyLines(run.lines, span), cuts: cutsAround(cuts, span) });

/**
 * The log of one run: its record, every outcome and verdict, the missed cuts, and a case for each disagreement
 * (restored, adjusted, missed, or a "no" in cut review). Null when the user agreed with everything: such a run
 * isn't worth the disk space. `notes` are the edit's notes, for when a "fix later" note was ticked done.
 */
export function learningLog(run, cuts, present, notes = []) {
  const { outcomes, missed } = judged(run, cuts, present);
  const verdicts = run.verdicts ?? {};
  const toProposal = proposalCase(run, cuts, notes);
  const isCase = (i) => DISAGREED.has(outcomes[i].kind) || verdicts[i]?.says === 'no';
  const cases = [
    ...run.proposals.flatMap((p, i) => (isCase(i) ? [{ index: i, ...toProposal(p, outcomes[i], verdicts[i]) }] : [])),
    ...missed.map(missedCase(run, cuts)),
  ];
  const { frozen, verdicts: _v, ...record } = run;
  return cases.length ? { run: record, outcomes, verdicts, missed, cases } : null;
}

/** The clips a log needs: the window heard for every "no", named `<run id>-<proposal index>`. */
export const learningClips = (runId, log) =>
  (log?.cases ?? []).filter((c) => c.verdict?.says === 'no' && c.heard?.length).map((c) => ({ id: `${runId}-${c.index}`, heard: c.heard }));
