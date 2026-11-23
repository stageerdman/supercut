// The review bar: the one new element of cut review (design/cut-review.md, "The bar", v3). One slim row docked under
// the player, never over the video: ‹ › (previous / next cut), the count and the reason, the which-cuts menu, and
// ▶ Play · Fix later · Looks good with their key caps; or the end line. It has no way out: Stop review is the
// toolbar's. No state of its own beyond what's painted. Tested in test/review-bar.test.mjs.
import { el } from './dom.js';
import { NOTE_HEX } from './note-view.js';
import { popup as nativePopup } from './context-menu.js';

/** Below these row widths the reason goes, then the buttons' words (▶, key caps and names stay). */
export const NO_REASON = 720;
export const NO_WORDS = 560;

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const EDGE = { start: 'Start of video', end: 'End of video' };

/** The which-cuts choices, in menu order, by their names. */
export const CHOICE_NAMES = { all: 'All cuts', magic: 'Magic’s cuts', unapproved: 'Not approved yet' };

/** Pure: the which-cuts menu: ✓ on the current choice, a choice with no cuts dimmed. */
export const choiceMenu = (only, counts = {}) => Object.entries(CHOICE_NAMES).map(([id, text]) => ({
  id, text, checked: id === only, ...(counts[id] === 0 && { enabled: false }),
}));

/** The count: "Cut 7 of 38 · 1.2 s cut · Start of video"; the end line "All 38 checked" / "35 of 38 checked". */
export function barHead(v) {
  if (v.end && v.empty) return 'No cuts left';
  if (v.end) return v.checked === v.total ? `All ${v.total} checked` : `${v.checked} of ${v.total} checked`;
  return [v.count, v.removed, EDGE[v.edge]].filter(Boolean).join(' · ');
}

/** The reason: "Magic: Earlier take · kept “…” · +1 more" / "Your cut · start of the video"; the end line "3 cuts to fix". */
export function barReason(v) {
  if (v.end && v.empty) return '';
  if (v.end) return v.toFix ? `${plural(v.toFix, 'cut')} to fix` : 'Nothing to fix';
  const reason = v.by === 'you' ? v.reason || 'Your cut' : `Magic: ${v.reason}`;
  return v.more ? `${reason} · +${v.more} more` : reason;
}

/** What the screen reader hears on each stop: the full reason, not the truncated line. */
export function barAnnouncement(v) {
  if (v.end && v.empty) return 'No cuts left.';
  return v.end ? `${barHead(v)}. ${barReason(v)}.` : `${v.count}. ${barReason(v)}`;
}

/** Pure: what a row `width` points wide keeps: the reason, the buttons' words. */
export const barFit = (width) => ({ reason: width >= NO_REASON, words: width >= NO_WORDS });

const RING = 'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface';
const BTN = `flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 ${RING}`;
const KIND = {
  secondary: `${BTN} border border-hairline text-text hover:bg-raised`,
  primary: `${BTN} bg-accent font-semibold text-on-accent hover:brightness-110`,
};
const CAP = 'keycap rounded-[4px] border px-1 text-[11px] leading-4 font-normal tabular-nums';
const QUIET = `flex h-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:text-text ${RING}`;
// The chevron the transcript search's ↑ ↓ use, turned to point left / right.
const CHEVRON = (d) => `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" /></svg>`;
const LEFT = 'm15 6-6 6 6 6', RIGHT = 'm9 6 6 6-6 6';

/** An action: [glyph] word [key cap], the cap at the right end like a shortcut in a Mac menu. */
function button(kind, key, name, glyph = '') {
  const b = el('button', KIND[kind]);
  const word = el('span', '');
  const cap = el('kbd', `${CAP} ${kind === 'primary' ? 'border-on-accent/40' : 'border-hairline'}`, key);
  cap.setAttribute('aria-hidden', 'true');
  if (glyph) {
    const g = el('span', 'text-[10px]', glyph);
    g.setAttribute('aria-hidden', 'true');
    b.append(g);
  }
  b.append(word, cap);
  b.setAttribute('aria-label', name);
  b.title = name;
  b.type = 'button';
  return { b, cap, word };
}

/** ‹ or ›: a quiet icon button; dimmed (not disabled, so focus stays on it) when there's nowhere to go. */
function arrow(name, d) {
  const b = el('button', `${QUIET} w-7 aria-disabled:opacity-40 aria-disabled:hover:text-text-secondary`);
  b.innerHTML = CHEVRON(d);
  b.setAttribute('aria-label', name);
  b.title = name;
  b.type = 'button';
  return b;
}

/**
 * @param {HTMLElement} host  the player column: the bar is its last child, under the player
 * @param {{onYes:()=>void, onNo:()=>void, onPlay:()=>void, onPrev:()=>void, onNext:()=>void,
 *   onChoose:(only:string)=>void, popup?: typeof nativePopup}} o  popup: shows the which-cuts menu (native by default)
 */
export function createReviewBar(host, o) {
  const popup = o.popup ?? nativePopup;
  const bar = el('div', 'hidden h-10 shrink-0 items-center gap-2 border-t border-hairline bg-surface px-3 outline-none');
  bar.id = 'review-bar';
  bar.tabIndex = -1; // focus rests here on the end line, where there is nothing to press
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cut review');

  const prev = arrow('Previous cut (←)', LEFT);
  const next = arrow('Next cut (→)', RIGHT);
  const nav = el('div', '-ml-1 flex shrink-0 items-center');
  nav.append(prev, next);

  // The count never truncates; the reason takes the free space and ends in "…".
  const text = el('p', 'flex min-w-0 flex-1 items-baseline gap-3');
  const head = el('span', 'shrink-0 text-[11px] text-text-secondary tabular-nums');
  const reason = el('span', 'min-w-0 truncate text-[13px] text-text');
  text.append(head, reason);

  const which = el('button', `${QUIET} gap-1 px-1.5 text-[11px]`);
  which.type = 'button';
  which.setAttribute('aria-haspopup', 'menu');
  const whichName = el('span', '');
  const chevron = el('span', 'text-[9px]', '⌄');
  chevron.setAttribute('aria-hidden', 'true');
  which.append(whichName, chevron);

  const play = button('secondary', 'R', 'Play (R)', '▶');
  play.word.textContent = 'Play';
  const no = button('secondary', 'N', 'Fix later (N)');
  const yes = button('primary', 'Y', 'Looks good (Y)');
  const actions = el('div', 'flex shrink-0 items-center gap-2');
  actions.append(play.b, no.b, yes.b);

  const live = el('span', 'sr-only');
  live.setAttribute('aria-live', 'polite');

  bar.append(nav, text, which, actions, live);
  host.append(bar);

  prev.onclick = () => o.onPrev();
  next.onclick = () => o.onNext();
  play.b.onclick = () => o.onPlay();
  no.b.onclick = () => o.onNo();
  yes.b.onclick = () => o.onYes();
  which.onclick = () => openMenu();
  // Clicks don't take focus away from where it is, so the keys keep working after one.
  for (const b of [prev, next, play.b, no.b, yes.b, which]) b.addEventListener('mousedown', (e) => e.preventDefault());

  let said = '';
  let shown = false;
  let end = false; // the end line is showing
  let view = null;

  function openMenu() {
    if (!view) return;
    const r = which.getBoundingClientRect?.();
    const handlers = Object.fromEntries(Object.keys(CHOICE_NAMES).map((id) => [id, () => o.onChoose(id)]));
    popup(choiceMenu(view.only, view.counts), handlers, r ? { x: r.left, y: r.top + r.height + 4 } : null);
  }

  function layout() {
    const fit = barFit(host.clientWidth || NO_REASON);
    reason.classList.toggle('hidden', !fit.reason || !reason.textContent);
    for (const x of [play, no, yes]) x.word.classList.toggle('hidden', !fit.words);
  }

  const dim = (b, off) => (off ? b.setAttribute('aria-disabled', 'true') : b.removeAttribute('aria-disabled'));

  /** Paint a session view (null hides the bar). Focus goes to Looks good when the bar first shows. */
  function paint(v) {
    if (!v) return hide();
    const first = !shown;
    shown = true;
    view = v;
    bar.classList.remove('hidden');
    bar.classList.add('flex');
    head.textContent = barHead(v);
    const why = barReason(v);
    reason.textContent = why;
    reason.title = why;
    layout();
    dim(prev, !v.hasPrev);
    dim(next, !v.hasNext);
    const name = CHOICE_NAMES[v.only] ?? CHOICE_NAMES.all;
    whichName.textContent = name;
    which.setAttribute('aria-label', `Which cuts: ${name}`);
    which.title = `Which cuts: ${name}`;
    actions.classList.toggle('hidden', v.end);
    if (!v.end) {
      yes.word.textContent = v.chosen === 'yes' ? '✓ Looks good' : 'Looks good';
      no.word.textContent = v.chosen === 'no' ? 'Noted' : 'Fix later';
      no.word.style.color = v.chosen === 'no' ? NOTE_HEX.red : '';
      yes.b.setAttribute('aria-pressed', String(v.chosen === 'yes'));
      no.b.setAttribute('aria-pressed', String(v.chosen === 'no'));
    }
    const say = (first ? `Reviewing ${plural(v.total, 'cut')}. Stop review is in the toolbar. ` : '') + barAnnouncement(v);
    if (say !== said) live.textContent = said = say;
    // Focus enters on Looks good (Return is Yes). On the end line it rests on the bar: nothing there to press by accident.
    const modeChanged = end !== v.end;
    end = v.end;
    const holds = bar.contains(document.activeElement) || !document.activeElement;
    if (first || (modeChanged && holds)) (v.end ? bar : yes.b).focus({ preventScroll: true });
  }

  function hide() {
    if (!shown) return;
    shown = false;
    end = false;
    said = '';
    view = null;
    const had = bar.contains(document.activeElement);
    bar.classList.remove('flex');
    bar.classList.add('hidden');
    if (had) document.activeElement.blur?.();
  }

  // The row follows the player column's width: the window, and the transcript divider being dragged.
  if (globalThis.ResizeObserver) new ResizeObserver(() => shown && layout()).observe(host);
  else globalThis.addEventListener?.('resize', () => shown && layout());

  return {
    paint,
    hide,
    get shown() { return shown; },
    contains: (n) => bar.contains(n),
    el: bar,
  };
}
