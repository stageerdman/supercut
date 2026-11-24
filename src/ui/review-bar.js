// The review bar (design/cut-review.md, "The bar", v4). One slim row docked under the player, never over the video,
// in three zones: the which-cuts filter (a segmented control) · ‹ ▶ ✓ › · "2 of 10". Icons only, each named in its
// tooltip. An approved cut shows a green ✓ in the controls; going through every cut ends on "All done". It has no
// way out: Stop review is the toolbar's. No state of its own beyond what's painted. Tested in test/review-bar.test.mjs.
import { el } from './dom.js';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The which-cuts choices, in order, by their names. */
export const CHOICE_NAMES = { all: 'All', magic: 'Magic', unapproved: 'Unapproved' };
const CHOICE_HINTS = { all: 'Every cut', magic: 'Only Magic’s cuts', unapproved: 'Cuts not approved yet' };

/** The counter: "2 of 10" / "2–3 of 10" (close cuts are one stop). */
export function barCount(v) {
  return v.first === v.last ? `${v.first} of ${v.total}` : `${v.first}–${v.last} of ${v.total}`;
}

/** The end: { title, line }. "All done" once every cut has been gone through, else "End of cuts". */
export function barEnd(v) {
  if (v.empty) return { title: 'No cuts left', line: '' };
  const line = v.approved === v.total ? `${v.total === 1 ? 'The cut is' : `All ${v.total} cuts`} approved` : `${v.approved} of ${v.total} approved`;
  return { title: v.checked === v.total ? 'All done' : 'End of cuts', line };
}

/** The reason, for the counter's hover and the screen reader: "Magic: Earlier take · +1 more" / "Your cut". */
export function barReason(v) {
  const reason = v.by === 'you' ? v.reason || 'Your cut' : `Magic: ${v.reason}`;
  return v.more ? `${reason} · +${v.more} more` : reason;
}

/** What the screen reader hears on each stop, or at the end. */
export function barAnnouncement(v) {
  if (v.end) {
    const { title, line } = barEnd(v);
    return line ? `${title}. ${line}.` : `${title}.`;
  }
  return `Cut ${barCount(v)}. ${barReason(v)}${v.chosen === 'yes' ? '. Approved' : ''}.`;
}

const svg = (body, size = 14) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const ICON = {
  prev: svg('<path d="m15 6-6 6 6 6" />'),
  next: svg('<path d="m9 6 6 6-6 6" />'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke-width="1.5" />'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5" />'),
  badge: svg('<path d="m6.5 12.5 3.5 3.5 7.5-8" stroke-width="3" />', 10),
};

const RING = 'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface';
const ICON_BTN = `flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${RING}`;
const QUIET = `${ICON_BTN} text-text-secondary hover:bg-raised hover:text-text aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-secondary`;
const YES = `${ICON_BTN} w-9 rounded-full bg-accent text-on-accent hover:brightness-110`; // the one primary; green once approved
/** A small green check in a circle: "approved", in the bar and on the timeline's cuts. */
export const BADGE = 'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-ok text-on-accent';

/** An icon button, named in its tooltip and for the screen reader. */
function iconButton(cls, name, icon) {
  const b = el('button', cls);
  b.innerHTML = icon;
  b.setAttribute('aria-label', name);
  b.title = name;
  b.type = 'button';
  return b;
}

/** The green ✓ badge (aria-hidden: the words around it say "approved"). */
export function badge() {
  const n = el('span', BADGE);
  n.innerHTML = ICON.badge;
  n.setAttribute('aria-hidden', 'true');
  return n;
}

/**
 * @param {HTMLElement} host  the player column: the bar is its last child, under the player
 * @param {{onYes:()=>void, onPlay:()=>void, onPrev:()=>void, onNext:()=>void, onChoose:(only:string)=>void}} o
 */
export function createReviewBar(host, o) {
  const bar = el('div', 'hidden h-10 shrink-0 items-center gap-3 border-t border-hairline bg-surface px-3 outline-none');
  bar.id = 'review-bar';
  bar.tabIndex = -1; // focus rests here at the end, where there is nothing to press
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cut review');

  // Left: the filter, a segmented control. The left and right zones share the free space, so the centre is centred.
  const left = el('div', 'flex min-w-0 flex-1 basis-0 items-center');
  const seg = el('div', 'flex h-7 shrink-0 items-center rounded-md bg-raised p-0.5');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Which cuts');
  const choices = Object.entries(CHOICE_NAMES).map(([id, name]) => {
    const b = el('button', `h-6 rounded-[5px] px-2.5 text-[11px] text-text-secondary hover:text-text aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-text aria-disabled:opacity-40 aria-disabled:hover:text-text-secondary ${RING}`, name);
    b.type = 'button';
    b.title = CHOICE_HINTS[id];
    b.dataset.only = id;
    b.onclick = () => b.getAttribute('aria-disabled') !== 'true' && o.onChoose(id);
    return b;
  });
  seg.append(...choices);
  left.append(seg);

  // Centre: ‹ ▶ ✓ ›, or at the end ‹ and the end message.
  const centre = el('div', 'flex shrink-0 items-center gap-1');
  const prev = iconButton(QUIET, 'Previous cut (←)', ICON.prev);
  const play = iconButton(QUIET, 'Play (R)', ICON.play);
  const yes = iconButton(YES, 'Looks good (Y)', ICON.check);
  const next = iconButton(QUIET, 'Next cut (→)', ICON.next);
  const done = el('div', 'hidden items-center gap-2 pl-1');
  const doneTitle = el('span', 'text-[13px] font-semibold text-text');
  const doneLine = el('span', 'text-[11px] text-text-secondary tabular-nums');
  const doneBadge = badge();
  done.append(doneBadge, doneTitle, doneLine);
  centre.append(prev, play, yes, next, done);

  // Right: the counter, with the green ✓ when this cut is approved. Its hover is the reason.
  const right = el('div', 'flex min-w-0 flex-1 basis-0 items-center justify-end gap-1.5');
  const mark = badge();
  const count = el('span', 'shrink-0 text-[11px] text-text-secondary tabular-nums');
  right.append(mark, count);

  const live = el('span', 'sr-only');
  live.setAttribute('aria-live', 'polite');

  bar.append(left, centre, right, live);
  host.append(bar);

  prev.onclick = () => o.onPrev();
  next.onclick = () => o.onNext();
  play.onclick = () => o.onPlay();
  yes.onclick = () => o.onYes();
  // Clicks don't take focus away from where it is, so the keys keep working after one.
  for (const b of [prev, next, play, yes, ...choices]) b.addEventListener('mousedown', (e) => e.preventDefault());

  let said = '';
  let shown = false;
  let end = false; // the end is showing

  const dim = (b, off) => (off ? b.setAttribute('aria-disabled', 'true') : b.removeAttribute('aria-disabled'));
  const show = (n, on, as = 'flex') => { n.classList.toggle('hidden', !on); n.classList.toggle(as, on); };

  /** Paint a session view (null hides the bar). Focus goes to ✓ when the bar first shows. */
  function paint(v) {
    if (!v) return hide();
    const first = !shown;
    shown = true;
    show(bar, true);
    for (const b of choices) {
      b.setAttribute('aria-pressed', String(b.dataset.only === v.only));
      dim(b, v.counts?.[b.dataset.only] === 0);
    }
    dim(prev, !v.hasPrev);
    dim(next, !v.hasNext);
    for (const b of [play, yes, next]) show(b, !v.end);
    show(done, v.end);
    show(right, !v.end);
    if (v.end) {
      const e = barEnd(v);
      doneTitle.textContent = e.title;
      doneLine.textContent = e.line;
      show(doneBadge, e.title === 'All done');
    } else {
      const approved = v.chosen === 'yes';
      yes.classList.toggle('bg-accent', !approved);
      yes.classList.toggle('bg-ok', approved);
      yes.setAttribute('aria-pressed', String(approved));
      yes.title = approved ? 'Approved · Y for the next cut' : 'Looks good (Y)';
      count.textContent = barCount(v);
      count.title = barReason(v);
      show(mark, approved);
    }
    const say = (first ? `Reviewing ${plural(v.total, 'cut')}. Stop review is in the toolbar. ` : '') + barAnnouncement(v);
    if (say !== said) live.textContent = said = say;
    // Focus enters on ✓ (Return is Yes). At the end it rests on the bar: nothing there to press by accident.
    const modeChanged = end !== v.end;
    end = v.end;
    const holds = bar.contains(document.activeElement) || !document.activeElement;
    if (first || (modeChanged && holds)) (v.end ? bar : yes).focus({ preventScroll: true });
  }

  function hide() {
    if (!shown) return;
    shown = false;
    end = false;
    said = '';
    const had = bar.contains(document.activeElement);
    show(bar, false);
    if (had) document.activeElement.blur?.();
  }

  return {
    paint,
    hide,
    get shown() { return shown; },
    contains: (n) => bar.contains(n),
    el: bar,
  };
}
