// Cut review on the screen (design/cut-review.md): the keys, entering and leaving, the bar, and the transcript and
// timeline following the current stop. The session (review-session.js) decides; this routes and paints.
// No DOM of its own: the bar, the views and the status line are passed in. Tested in test/review-control.test.mjs.
import { openNotes } from './notes.js';

const EPS = 1e-6;
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Pure: what a key does while review is on, or null (the app's own meaning). Review keys win even with words
 * selected; only a text field takes them (the caller doesn't ask then). `end`: the end line is showing.
 */
export function reviewKey(e, { end = false } = {}) {
  const k = e.key;
  if (e.metaKey && !e.shiftKey && !e.altKey && k.toLowerCase() === 'z') return 'undo';
  if (e.altKey && !e.metaKey && !e.ctrlKey && k === 'ArrowRight') return end ? 'fixFirst' : null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (k === ' ') return 'toggle'; // even on a focused bar button: Space never gives a verdict
  if (k === 'Enter') return e.target?.closest?.('button') ? null : end ? 'fixFirst' : 'yes'; // a button: Return presses it
  if (k === 'Escape') return 'leave';
  if (k === 'ArrowDown') return 'down';
  if (k === 'ArrowUp') return 'up';
  if (k === 'Backspace' || k === 'Delete') return 'putBack';
  switch (k.toLowerCase()) {
    case 'y': return 'yes';
    case 'n': case 'm': return 'no';
    case 'r': return 'replay';
    default: return null;
  }
}

/**
 * Pure: the toolbar's Review cuts button. Shown when there's a stop and Magic isn't busy; the primary after a Magic
 * run until every stop is checked (✦ Magic is plain meanwhile); pressed while reviewing.
 * @param {{stops:number, checked:number, total:number, magic:boolean}} p  session.progress()
 */
export function reviewButton(p, { on = false, busy = false } = {}) {
  const visible = !busy && (on || p.stops > 0);
  return { visible, pressed: on, primary: visible && p.magic && p.checked < p.total };
}

/** Pure: the open red "fix later" notes in play order, first first. */
export function fixLaterNotes(notes, order) {
  return openNotes(notes)
    .filter((n) => n.color === 'red' && n.about && order.includes(n.part))
    .sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part) || a.s - b.s);
}

/**
 * @param {{ session: ReturnType<import('./review-session.js').createReviewSession>,
 *   bar: {paint:(v:object|null)=>void},
 *   timeline: {select:(s:object|null)=>void, reveal:(i:number,t:number)=>void, selection:object|null},
 *   transcript: {reveal:(part:number,s:number)=>void},
 *   cuts: () => Array, parts: () => Array<{id:number}>, notes: () => Array,
 *   closeCard: () => void, openNote: (id:string) => void, undo: () => void,
 *   flash: (text:string, ms?:number) => void, paint: () => void }} o
 *   paint: the toolbar (Review cuts and ✦ Magic) after review starts, ends or moves
 */
export function createReviewControl(o) {
  const s = o.session;
  let following = false; // our own selection of the current cut: not a click on a stop
  let shownAt = null;

  function paint() {
    o.bar.paint(s.view());
    if (s.on && s.at !== shownAt) follow();
    if (!s.on) shownAt = null;
    o.paint();
  }

  /** The transcript and the timeline bring the stop into view and ring its first cut (still cut). */
  function follow() {
    shownAt = s.at;
    const stop = s.stops()[s.at];
    if (!stop) return;
    const order = o.parts().map((p) => p.id);
    const item = stop.items.find((i) => !i.restored) ?? stop.items[0];
    const cut = o.cuts().find((c) => c.part === item.part && Math.abs(c.s - item.s) < EPS && Math.abs(c.e - item.e) < EPS);
    following = true;
    try { o.timeline.select(cut ? { part: cut.part, s: cut.s, e: cut.e, cut: true } : null); } finally { following = false; }
    o.timeline.reveal(order.indexOf(item.part), item.s);
    o.transcript.reveal(item.part, item.s);
  }

  function fixFirst() {
    const [first] = fixLaterNotes(o.notes(), o.parts().map((p) => p.id));
    leave(true);
    if (first) o.openNote(first.id);
  }

  function leave(quiet = false) {
    if (!s.on) return;
    s.leave(quiet);
    paint();
  }

  const actions = {
    yes: () => s.yes(),
    no: () => s.no(),
    putBack: () => s.putBack(),
    replay: () => s.replay(),
    toggle: () => s.toggle(),
    down: () => s.move(1),
    up: () => s.move(-1),
    leave: () => s.leave(),
    fixFirst,
    undo: () => { if (!s.undoLast()) o.undo(); },
  };

  return {
    get on() { return s.on; },

    /** Review cuts / R: drop the selection and any open card, then the first unchecked stop plays. */
    start() {
      if (s.on) return leave();
      o.timeline.select(null);
      o.closeCard();
      if (!s.start()) { o.flash('Nothing to review', 2000); return false; }
      paint();
      return true;
    },
    leave,

    /** A keydown while review is on. True when review took it (the caller prevents the default). */
    key(e) {
      if (!s.on) return false;
      const a = reviewKey(e, { end: s.at < 0 });
      if (!a) return false;
      if (a === 'fixFirst' && s.view()?.end && !s.view().toFix) return false;
      actions[a]();
      if (a !== 'fixFirst') paint();
      return true;
    },

    /** The bar's buttons. */
    yes: () => { actions.yes(); paint(); },
    no: () => { actions.no(); paint(); },
    replay: () => { actions.replay(); paint(); },
    fixFirst,

    /** The one selection changed (a click in either view): a click on a stop's cut makes it the current stop. */
    selected(sel) {
      if (!s.on || following || !sel) return;
      const mid = (sel.s + sel.e) / 2;
      const i = s.stops().findIndex((st) => st.items.some((it) => it.part === sel.part && it.s - EPS <= mid && mid <= it.e + EPS));
      if (i < 0 || i === s.at) return;
      const key = s.stops()[i].items[0].key;
      if (s.goTo(key)) { shownAt = s.at; o.bar.paint(s.view()); o.paint(); }
    },

    /** After an edit or undo outside review's own keys: leave if Magic ran again, else repaint the count. */
    changed() {
      if (!s.on) return o.paint();
      const list = s.stops();
      const magicGone = s.progress().magic && list[0]?.items[0].by !== 'magic'; // its step was undone
      if (s.stale() || magicGone || !list.length) {
        s.leave(true);
        const p = s.progress();
        const left = p.total - p.checked;
        o.flash(left ? `Magic ran again · ${plural(left, 'cut')} to review` : 'Nothing left to review', 3000);
        return paint();
      }
      o.bar.paint(s.view());
      o.paint();
    },

    /** The window ended or the player moved: the bar stays as it is; nothing moves on its own. */
    paint,
  };
}
