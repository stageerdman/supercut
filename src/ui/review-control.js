// Cut review on the screen (design/cut-review.md): the keys, entering and leaving, the bar, and the transcript and
// timeline following the current stop: each new stop frames itself on the timeline. The session
// (review-session.js) decides; this routes and paints. Only `leave()` (the toolbar's Stop review) ends review.
// No DOM of its own: the bar, the views and the status line are passed in. Tested in test/review-control.test.mjs.
const EPS = 1e-6;

/**
 * Pure: what a key does while review is on, or null (the app's own meaning). Review keys win even with words
 * selected; only a text field takes them (the caller doesn't ask then). No key leaves review: Esc keeps its app
 * meaning, R plays the clip.
 */
export function reviewKey(e) {
  const k = e.key;
  if (e.metaKey && !e.shiftKey && !e.altKey && k.toLowerCase() === 'z') return 'undo';
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (k === ' ') return 'toggle'; // even on a focused bar button: Space never gives a verdict
  if (k === 'Enter') return e.target?.closest?.('button') ? null : 'yes'; // a button: Return presses it
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
 * Pure: the toolbar's Review cuts / Stop review button (design/cut-review.md, "Toolbar states").
 * Off: shown when there's a stop and Magic isn't busy; the primary after a Magic run until every cut is checked.
 * On: "Stop review", the primary once there is nothing left to do (`end`: the end line or no cuts left).
 * @param {{stops:number, checked:number, total:number, magic:boolean}} p  session.progress()
 */
export function reviewButton(p, { on = false, busy = false, end = false } = {}) {
  if (on) return { visible: true, label: 'Stop review', primary: end };
  const visible = !busy && p.stops > 0;
  return { visible, label: 'Review cuts', primary: visible && p.magic && p.checked < p.total };
}

// The actions that bring a new stop: the timeline frames it.
const NEW_STOP = new Set(['yes', 'no', 'putBack', 'down', 'up']);

/**
 * @param {{ session: ReturnType<import('./review-session.js').createReviewSession>,
 *   bar: {paint:(v:object|null)=>void},
 *   timeline: {select:(s:object|null)=>void, reveal:(i:number,t:number)=>void, selection:object|null,
 *     frame?:(r:object)=>void, inView?:(r:object)=>boolean},
 *   transcript: {reveal:(part:number,s:number)=>void},
 *   cuts: () => Array, parts: () => Array<{id:number}>,
 *   closeCard: () => void, undo: () => void,
 *   flash: (text:string, ms?:number) => void, paint: () => void }} o
 *   paint: the toolbar (Review cuts / Stop review and ✦ Magic) after review starts, ends or moves
 */
export function createReviewControl(o) {
  const s = o.session;
  let following = false; // our own selection of the current cut: not a click on a stop
  let shownAt = null;

  /** Repaint the bar and the toolbar. `frame`: a new stop, so the timeline frames it (else it's left alone). */
  function paint(frame = false) {
    const v = s.view();
    o.bar.paint(v);
    if (s.on && (frame || s.at !== shownAt)) follow(frame);
    if (frame && v?.stretch) o.timeline.frame?.(v.stretch);
    if (!s.on) shownAt = null;
    o.paint();
  }

  /** The transcript (and, when not framing, the timeline) bring the stop into view; its first cut is ringed. */
  function follow(framing) {
    shownAt = s.at;
    const stop = s.stops()[s.at];
    if (!stop) return;
    const order = o.parts().map((p) => p.id);
    const item = stop.items.find((i) => !i.restored) ?? stop.items[0];
    const cut = o.cuts().find((c) => c.part === item.part && Math.abs(c.s - item.s) < EPS && Math.abs(c.e - item.e) < EPS);
    following = true;
    try { o.timeline.select(cut ? { part: cut.part, s: cut.s, e: cut.e, cut: true } : null); } finally { following = false; }
    if (!framing) o.timeline.reveal(order.indexOf(item.part), item.s);
    o.transcript.reveal(item.part, item.s);
  }

  /** ▶ Play, R, Space after the end: the clip from its start; re-framed only if you scrolled it out of view. */
  function replayed() {
    const v = s.view();
    if (v?.stretch && o.timeline.inView && !o.timeline.inView(v.stretch)) o.timeline.frame?.(v.stretch);
  }

  const actions = {
    yes: () => s.yes(),
    no: () => s.no(),
    putBack: () => s.putBack(),
    replay: () => { s.replay(); replayed(); },
    toggle: () => { if (s.toggle()) replayed(); },
    down: () => s.move(1),
    up: () => s.move(-1),
    undo: () => (s.undoLast() ? 'back' : o.undo()),
  };

  return {
    get on() { return s.on; },

    /** Review cuts / R: drop the selection and any open card, then the first unchecked stop frames and plays. */
    start() {
      if (s.on) return true;
      o.timeline.select(null);
      o.closeCard();
      if (!s.start()) { o.flash('Nothing to review', 2000); return false; }
      paint(true);
      return true;
    },

    /** Stop review: the one way out. The clip pauses where it is; the zoom stays. */
    leave() {
      if (!s.on) return;
      s.leave();
      paint();
    },

    /** A keydown while review is on. True when review took it (the caller prevents the default). */
    key(e) {
      if (!s.on) return false;
      const a = reviewKey(e);
      if (!a) return false;
      const r = actions[a]();
      paint(NEW_STOP.has(a) || r === 'back');
      return true;
    },

    /** The bar's buttons. */
    yes: () => { actions.yes(); paint(true); },
    no: () => { actions.no(); paint(true); },
    play: () => { actions.replay(); paint(); },
    /** The which-cuts menu: the set changes, its next unchecked stop frames and plays. */
    choose(only) {
      if (s.choose(only)) paint(true);
    },

    /** The one selection changed (a click in either view): a click on a stop's cut makes it the current stop. */
    selected(sel) {
      if (!s.on || following || !sel) return;
      const mid = (sel.s + sel.e) / 2;
      const i = s.stops().findIndex((st) => st.items.some((it) => it.part === sel.part && it.s - EPS <= mid && mid <= it.e + EPS));
      if (i < 0 || i === s.at) return;
      const key = s.stops()[i].items[0].key;
      if (!s.goTo(key)) return;
      shownAt = s.at; // the click already selected the cut
      const v = s.view();
      o.bar.paint(v);
      if (v?.stretch) o.timeline.frame?.(v.stretch);
      o.paint();
    },

    /** After an edit or undo outside review's own keys: repaint the count. Never leaves, never moves the view. */
    changed() {
      if (!s.on) return o.paint();
      o.bar.paint(s.view());
      o.paint();
    },

    /** The window ended or the player moved: the bar stays as it is; nothing moves on its own. */
    paint: () => paint(),
  };
}
