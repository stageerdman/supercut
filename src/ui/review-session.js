// Cut review session (design/cut-review.md): where the user is, which cuts are in the set, and what Y, N, ⌫, ↑/↓,
// ⌘Z, ▶ Play and the which-cuts choice do to the edit, the trace and the player. No DOM: the bar and the keys
// (review-bar.js, review-control.js) call it and paint `view()`. Only `leave()` ends review.
// Magic's verdicts go into the trace (outside undo); verdicts on your own cuts live only in this session.
// Tested in test/review-session.test.mjs.
import { restoreRange } from './cuts.js';
import { addFixLater, dropFixLater } from './notes.js';
import { withVerdict, withoutVerdict } from './trace.js';
import {
  reviewCuts, inSet, setCounts, stops, reviewWindow, stretchOf, openingStop, nextUnchecked, nearestUnchecked, step,
  progress, stopCount, removed,
} from './review.js';

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
  let runId = null; // the run being reviewed (null: no Magic cuts)
  let own = {}; // verdicts on your own cuts, by item key
  let kept = []; // your cuts put back with ⌫ in this review: still items, checked, until it stops
  let only = 'all'; // the which-cuts choice
  let taken = null; // the keys "Not approved yet" took when chosen
  let last = null; // the last verdict, for ⌘Z: { key, before: { magic, own, kept }, editAfter, edited }

  const run = () => deps.trace().runs.at(-1);
  const verdicts = () => ({ ...(runId != null && run()?.verdicts), ...own });
  const everyCut = () => reviewCuts(deps.trace(), deps.edit().cuts, deps.parts(), kept);
  const items = () => inSet(everyCut(), only, verdicts(), taken);
  const list = () => stops(items(), deps.parts(), deps.edit().cuts);
  const stopAt = (i) => list()[i];
  const keyOf = (stop) => stop.items[0].key;
  const windowOf = (stop) => reviewWindow(stop, deps.parts(), deps.edit().cuts);

  /** To stop i (its window plays from the start, as the edit is now), or the end line when there is none. */
  function go(i) {
    const stop = stopAt(i);
    at = stop ? i : -1;
    if (stop) deps.play.play(windowOf(stop));
    else deps.play.stop();
  }

  /** The stop now holding `key`, after an edit may have regrouped them (or -1). */
  const indexOf = (key) => list().findIndex((s) => s.items.some((i) => i.key === key));

  return {
    get on() { return on; },
    get at() { return at; },
    get only() { return only; },

    /** Review cuts / R: always All cuts, at the first unchecked stop. False when there's nothing to review. */
    start() {
      only = 'all';
      taken = null;
      kept = [];
      const runNow = run();
      runId = runNow && everyCut().some((i) => i.by === 'magic') ? runNow.id : null;
      const i = openingStop(list(), verdicts());
      if (i < 0) return false;
      on = true;
      last = null;
      go(i);
      return true;
    },

    /** Stop review: playback pauses where it is; progress stays, put-back cuts of yours leave the count. */
    leave(quiet = false) {
      if (!on) return;
      on = false;
      last = null;
      deps.play.stop();
      const { checked, total, toFix } = progress(everyCut(), verdicts());
      kept = [];
      if (quiet) return;
      deps.say(toFix ? `${plural(toFix, 'cut')} to fix · ⌥→ for the first` : `${checked} of ${total} checked · R to go on`);
    },

    /** True when Magic ran again (or its run is no longer the one reviewed). */
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
      const before = { magic, own, kept };
      const edited = apply(kind, stop);
      last = { key, before, edited, editAfter: deps.edit() };
      if (kind === 'no') deps.say('Noted, fix later');
      if (kind === 'restored') deps.say('Put back');
      this.next(key);
    },

    /** From the stop holding `key` to the next unchecked one; none left → the end line, which waits. */
    next(key) {
      go(nextUnchecked(list(), verdicts(), Math.max(indexOf(key), at - 1)));
    },

    /** ↓ (1) / ↑ (-1), no verdict and no wrap. ↑ on the end line: the last stop. */
    move(dir) {
      if (!on) return;
      last = null;
      if (at < 0) {
        if (dir < 0 && list().length) go(list().length - 1);
        return;
      }
      const r = step(list(), at, dir);
      if (r.edge) deps.say(r.edge === 'last' ? 'Last cut' : 'First cut');
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

    /**
     * The which-cuts menu: narrow the set and go to its first unchecked stop at or after where you are (else from
     * the start, else its end line). "Not approved yet" is taken now. False for a choice with no cuts (dimmed).
     */
    choose(next) {
      if (!on) return false;
      const all = everyCut(), given = verdicts();
      const set = inSet(all, next, given);
      if (!set.length) return false;
      const from = stopAt(at)?.joins[0] ?? 0;
      only = next;
      taken = next === 'unapproved' ? new Set(set.map((i) => i.key)) : null;
      last = null;
      go(nearestUnchecked(list(), given, from));
      return true;
    },

    /** ▶ Play / R: the current clip from its start, as the edit is now. Never a verdict. */
    replay() { if (on && at >= 0) go(at); },
    /** Space: pause / play; after the clip ended, play it again (true then: a replay). */
    toggle() {
      if (!on || at < 0) return false;
      if (!deps.play.ended) { deps.play.toggle(); return false; }
      go(at);
      return true;
    },

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
      kept = before.kept;
      go(indexOf(key));
      return true;
    },

    /** Progress over every cut review would open on now (the toolbar's primary state), on or off. */
    progress() {
      const r = run();
      const all = everyCut();
      const id = on ? runId : r && all.some((i) => i.by === 'magic') ? r.id : null;
      const p = progress(all, { ...(id != null && r?.verdicts), ...own });
      return { ...p, magic: id != null, stops: stops(all, deps.parts(), deps.edit().cuts).length };
    },

    /** The stops of the chosen set as they are now (the caller finds a clicked cut's stop, or rings the current one). */
    stops: () => list(),

    /**
     * What the bar shows. Null when review is off. Always: `only`, `counts` (a choice at 0 is dimmed) and the set's
     * progress. The end line: `end`, and `empty` when the set has no cuts left. A stop: its lines, and `stretch`,
     * the range the timeline frames.
     */
    view() {
      if (!on) return null;
      const set = items();
      const given = verdicts();
      const base = { only, counts: setCounts(everyCut(), given), ...progress(set, given) };
      const stop = stopAt(at);
      if (!stop) return { end: true, empty: !set.length, ...base };
      const w = windowOf(stop);
      return {
        end: false,
        ...base,
        count: stopCount(stop, set.length),
        removed: `${duration(removed(stop))} cut`,
        edge: w.edge,
        reason: stop.items[0].reason,
        by: stop.items[0].by,
        more: stop.items.length - 1,
        chosen: given[keyOf(stop)]?.says ?? null,
        stretch: stretchOf(w, deps.parts()),
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
      kept = [...kept, ...stop.items.filter((i) => i.by === 'you').map((i) => ({ ...i, restored: true }))];
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
