// The review bar: the one new element of cut review (design/cut-review.md, "The bar"). It floats over the bottom of
// the player, where a note card sits, and paints the session's `view()`: the count and the which-cuts menu, the
// reason, and ▶ Play · Fix later · Looks good with their key caps; or the two-line end line. It has no way out:
// Stop review is the toolbar's. No state of its own beyond what's painted. Tested in test/review-bar.test.mjs.
import { el } from './dom.js';
import { NOTE_HEX } from './note-view.js';
import { popup as nativePopup } from './context-menu.js';

export const BAR_W = 480;
const INSET = 16; // the bar keeps this far inside the player on each side
const NARROW = 400; // below this width the action buttons keep only ▶ and their key caps

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const EDGE = { start: 'Start of video', end: 'End of video' };

/** The which-cuts choices, in menu order, by their names. */
export const CHOICE_NAMES = { all: 'All cuts', magic: 'Magic’s cuts', unapproved: 'Not approved yet' };

/** Pure: the which-cuts menu: ✓ on the current choice, a choice with no cuts dimmed. */
export const choiceMenu = (only, counts = {}) => Object.entries(CHOICE_NAMES).map(([id, text]) => ({
  id, text, checked: id === only, ...(counts[id] === 0 && { enabled: false }),
}));

/** Line 1: "Cut 7 of 38 · 1.2 s cut · Start of video"; the end line "All 38 checked" / "35 of 38 checked". */
export function barHead(v) {
  if (v.end && v.empty) return 'No cuts left';
  if (v.end) return v.checked === v.total ? `All ${v.total} checked` : `${v.checked} of ${v.total} checked`;
  return [v.count, v.removed, EDGE[v.edge]].filter(Boolean).join(' · ');
}

/** Line 2: "Magic: Earlier take · kept “…” · +1 more" / "Your cut · start of the video"; the end line "3 cuts to fix". */
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

/** The bar's width in a player `host` points wide. */
export const barWidth = (host) => Math.max(0, Math.min(BAR_W, host - 2 * INSET));

const BTN = 'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-raised';
const KIND = {
  secondary: `${BTN} border border-hairline text-text hover:bg-surface`,
  primary: `${BTN} bg-accent font-semibold text-on-accent hover:brightness-110`,
};
const CAP = 'keycap rounded-[4px] border px-1 text-[11px] leading-4 font-normal tabular-nums';

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

/**
 * @param {HTMLElement} host  the player's box (position: relative)
 * @param {{onYes:()=>void, onNo:()=>void, onPlay:()=>void, onChoose:(only:string)=>void,
 *   popup?: typeof nativePopup}} o  popup: shows the which-cuts menu (the native one by default)
 */
export function createReviewBar(host, o) {
  const popup = o.popup ?? nativePopup;
  const bar = el('div', 'absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 rounded-[10px] border border-hairline bg-raised p-3 shadow-lg outline-none');
  bar.id = 'review-bar';
  bar.tabIndex = -1; // focus rests here on the end line, where there is nothing to press
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cut review');

  // Line 1: the count; the which-cuts menu sits at its right (after the actions in the DOM: last in Tab order).
  const head = el('p', 'min-w-0 truncate pr-32 text-[11px] leading-4 text-text-secondary tabular-nums');
  const reason = el('p', 'mt-1 truncate text-[13px] text-text');

  const play = button('secondary', 'R', 'Play (R)', '▶');
  play.word.textContent = 'Play';
  const no = button('secondary', 'N', 'Fix later (N)');
  const yes = button('primary', 'Y', 'Looks good (Y)');
  const gap = el('span', 'flex-1');
  const actions = el('div', 'mt-3 flex items-center gap-2');
  actions.append(play.b, gap, no.b, yes.b);

  const which = el('button', 'absolute top-1.5 right-1.5 flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent');
  which.type = 'button';
  which.setAttribute('aria-haspopup', 'menu');
  const whichName = el('span', '');
  const chevron = el('span', 'text-[9px]', '⌄');
  chevron.setAttribute('aria-hidden', 'true');
  which.append(whichName, chevron);

  const live = el('span', 'sr-only');
  live.setAttribute('aria-live', 'polite');

  bar.append(head, reason, actions, which, live);
  host.append(bar);

  play.b.onclick = () => o.onPlay();
  no.b.onclick = () => o.onNo();
  yes.b.onclick = () => o.onYes();
  which.onclick = () => openMenu();
  // Clicks don't take focus away from where it is, so the keys keep working after one.
  for (const b of [play.b, no.b, yes.b, which]) b.addEventListener('mousedown', (e) => e.preventDefault());

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
    const w = barWidth(host.clientWidth || BAR_W + 2 * INSET);
    bar.style.width = `${w}px`;
    const narrow = w < NARROW;
    for (const x of [play, no, yes]) x.word.classList.toggle('hidden', narrow);
  }

  /** Paint a session view (null hides the bar). Focus goes to Looks good when the bar first shows. */
  function paint(v) {
    if (!v) return hide();
    const first = !shown;
    shown = true;
    view = v;
    bar.classList.remove('hidden');
    layout();
    head.textContent = barHead(v);
    const why = barReason(v);
    reason.textContent = why;
    reason.title = why;
    reason.classList.toggle('hidden', !why);
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
    bar.classList.add('hidden');
    if (had) document.activeElement.blur?.();
  }

  globalThis.addEventListener?.('resize', () => shown && layout());

  return {
    paint,
    hide,
    get shown() { return shown; },
    contains: (n) => bar.contains(n),
    el: bar,
  };
}
