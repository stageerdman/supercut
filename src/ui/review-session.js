// Cut review session (design/cut-review.md): where the user is, and what Y, N, ⌫, ↑/↓, ⌘Z and Esc do to the edit,
// the trace and the player. No DOM: the bar and the keys (review-bar.js, main.js) call it and paint `view()`.
// Magic's verdicts go into the trace (outside undo); verdicts on your own cuts live only in this session.
// Tested in test/review-session.test.mjs.
import { restoreRange } from './cuts.js';
import { addFixLater, dropFixLater } from './notes.js';
import { withVerdict, withoutVerdict } from './trace.js';
import { reviewCuts, stops, reviewWindow, openingStop, nextUnchecked, step, progress, stopCount, removed } from './review.js';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const duration = (s) => (s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);

/**
 * @param {{ edit: () => object, commit: (edit:object, label:string) => void, undo: () => void,
 *           trace: () => object, setTrace: (t:object) => void, parts: () => Array<{id, duration}>,
 *           play: ReturnType<import('./review-play.js').createWindowPlay>, say: (text:string) => void,
 *           now?: () => string, id?: () => string }} deps
 */
export function createReviewSession(deps) {
  const now = deps.now ?? (() => new Date().toISOString());
  let on = false;
  let at = -1; // the current stop; -1 on the end line
  let runId = null; // the run being reviewed (null: your own cuts)
  let own = {}; // verdicts on your own cuts, by item key
  let last = null; // the last verdict, for ⌘Z: { key, before: { trace verdicts, own }, editAfter, edited }

  const run = () => deps.trace().runs.at(-1);
  const verdicts = () => ({ ...(runId != null && run()?.verdicts), ...own });
  const items = () => reviewCuts(deps.trace(), deps.edit().cuts, deps.parts());
  const list = () => stops(items(), deps.parts(), deps.edit().cuts);
  const stopAt = (i) => list()[i];
  const keyOf = (stop) => stop.items[0].key;

  function go(i) {
    at = i;
    const stop = stopAt(i);
    if (stop) deps.play.play(reviewWindow(stop, deps.parts(), deps.edit().cuts));
  }

  /** The stop now holding `key`, after an edit may have regrouped them (or -1). */
  const indexOf = (key) => list().findIndex((s) => s.items.some((i) => i.key === key));

  return {
    get on() { return on; },
    get at() { return at; },

    /** Review cuts / R. False when there's nothing to review. */
    start() {
      const runNow = run();
      runId = runNow && items().some((i) => i.by === 'magic') ? runNow.id : null;
      const i = openingStop(list(), verdicts());
      if (i < 0) return false;
      on = true;
      last = null;
      go(i);
      return true;
    },

    /** Esc / ✕: playback pauses where it is; progress stays. */
    leave(quiet = false) {
      if (!on) return;
      on = false;
      last = null;
      deps.play.stop();
      const { checked, total } = progress(items(), verdicts());
      if (!quiet) deps.say(`${checked} of ${total} checked · R to go on`);
    },

    /** True when Magic ran again (or its run is no longer the one reviewed): the caller leaves review. */
    stale: () => on && runId != null && run()?.id !== runId,

    yes() { return this.verdict('yes'); },
    no() { return this.verdict('no'); },
    putBack() { return this.verdict('restored'); },

    /** A verdict on the current stop, then on to the next unchecked one (or the end line). */
    verdict(kind) {
      const stop = stopAt(at);
      if (!on || !stop) return;
      const key = keyOf(stop);
      const given = verdicts();
      const magic = runId == null ? [] : stop.items.filter((i) => i.by === 'magic').map((i) => [i.index, given[i.key]]);
      const before = { magic, own };
      const edited = apply(kind, stop);
      last = { key, before, edited, editAfter: deps.edit() };
      if (kind === 'no') deps.say('Noted, fix later');
      if (kind === 'restored') deps.say('Put back');
      this.next(key);
    },

    /** From the stop holding `key` to the next unchecked one; none left → the end line, or close with no Nos. */
    next(key) {
      const i = nextUnchecked(list(), verdicts(), Math.max(indexOf(key), at - 1));
      if (i >= 0) return go(i);
      at = -1;
      deps.play.stop();
      const p = progress(items(), verdicts());
      if (p.toFix) return; // the end line: "3 cuts to fix · ⌥→"
      on = false;
      deps.say(p.checked === p.total ? `All ${plural(p.total, 'cut')} checked` : `${p.checked} of ${p.total} checked`);
    },

    /** ↓ (1) / ↑ (-1), no verdict and no wrap. */
    move(dir) {
      if (!on || at < 0) return;
      const r = step(list(), at, dir);
      if (r.edge) deps.say(r.edge === 'last' ? 'Last cut' : 'First cut');
      last = null;
      go(r.i);
    },

    /** Clicking a cut that is a stop. */
    goTo(key) {
      const i = indexOf(key);
      if (!on || i < 0) return false;
      last = null;
      go(i);
      return true;
    },

    replay() { if (on && at >= 0) deps.play.replay(); },
    toggle() { if (on && at >= 0) deps.play.toggle(); },

    /** ⌘Z right after a verdict: undo it (and its note or restore) and go back to it. False: the usual undo. */
    undoLast() {
      if (!last || deps.edit() !== last.editAfter) return false;
      const { key, before, edited } = last;
      last = null;
      if (edited) deps.undo();
      let trace = deps.trace();
      for (const [index, v] of before.magic) {
        trace = v ? withVerdict(trace, runId, [index], v) : withoutVerdict(trace, runId, [index]);
      }
      if (before.magic.length) deps.setTrace(trace);
      own = before.own;
      on = true;
      go(indexOf(key));
      return true;
    },

    /** Progress over the cuts review would open on now (the toolbar's primary state), on or off. */
    progress() {
      const r = run();
      const id = on ? runId : r && items().some((i) => i.by === 'magic') ? r.id : null;
      return { ...progress(items(), { ...(id != null && r?.verdicts), ...own }), magic: id != null, stops: list().length };
    },

    /** The stops as they are now (the caller finds a clicked cut's stop, or rings the current one). */
    stops: () => list(),

    /** What the bar shows. Null when review is off. */
    view() {
      if (!on) return null;
      const all = items();
      const p = progress(all, verdicts());
      const stop = stopAt(at);
      if (!stop) return { end: true, ...p };
      const given = verdicts()[keyOf(stop)];
      const w = reviewWindow(stop, deps.parts(), deps.edit().cuts);
      return {
        end: false,
        ...p,
        count: stopCount(stop, all.length),
        removed: `${duration(removed(stop))} cut`,
        edge: w.edge,
        reason: stop.items[0].reason,
        by: stop.items[0].by,
        more: stop.items.length - 1,
        chosen: given ? given.says : null,
      };
    },
  };

  /** Writes a verdict on every cut of the stop. Returns true when it changed the edit (a history step). */
  function apply(kind, stop) {
    const says = kind === 'yes' ? 'yes' : 'no';
    const given = verdicts();
    const oldNotes = stop.items.map((i) => given[i.key]?.note).filter(Boolean);
    let edit = deps.edit(), label = '';
    let notes = [];
    if (kind === 'yes') ({ edit, label } = dropFixLater(edit, oldNotes));
    if (kind === 'no' && !oldNotes.length) ({ edit, notes, label } = addFixLater(edit, stop.items, deps.id ? { id: deps.id } : {}));
    if (kind === 'restored') {
      edit = { ...edit, cuts: stop.items.reduce((cuts, i) => restoreRange(cuts, i), edit.cuts) };
      label = 'Review: put back';
    }
    const noteOf = (item) => notes.find((n) => n.part === item.part)?.id ?? given[item.key]?.note;
    const verdictOf = (item) => ({
      says,
      ...(kind === 'restored' && { how: 'restored' }),
      at: now(),
      after: +deps.play.after.toFixed(2),
      heard: deps.play.window?.spans ?? [],
      ...(says === 'no' && noteOf(item) && { note: noteOf(item) }),
    });
    record(stop, verdictOf);
    if (edit === deps.edit()) return false;
    deps.commit(edit, label);
    return true;
  }

  function record(stop, verdictOf) {
    let trace = deps.trace();
    const mine = {};
    for (const item of stop.items) {
      if (item.by === 'magic' && runId != null) trace = withVerdict(trace, runId, [item.index], verdictOf(item));
      else mine[item.key] = verdictOf(item);
    }
    if (trace !== deps.trace()) deps.setTrace(trace);
    own = { ...own, ...mine };
  }
}
