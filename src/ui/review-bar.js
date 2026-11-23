// The review bar: the one new element of cut review (design/cut-review.md, "The bar"). It floats over the bottom of
// the player, where a note card sits, and paints the session's `view()`: the count, the reason, and the three
// actions with their key caps; or the end line. No state of its own beyond what's painted. Tested in
// test/review-bar.test.mjs.
import { el } from './dom.js';
import { NOTE_HEX } from './note-view.js';

export const BAR_W = 480;
const INSET = 16; // the bar keeps this far inside the player on each side
const NARROW = 400; // below this width the action buttons keep only their key caps

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const EDGE = { start: 'Start of video', end: 'End of video' };

/** Line 1: "Cut 7 of 38 · 1.2 s cut · Start of video"; on the end line, "All 38 checked" / "35 of 38 checked". */
export function barHead(v) {
  if (v.end) return v.checked === v.total ? `All ${v.total} checked` : `${v.checked} of ${v.total} checked`;
  return [v.count, v.removed, EDGE[v.edge]].filter(Boolean).join(' · ');
}

/** Line 2: "Magic: Earlier take · kept “…” · +1 more" / "Your cut"; on the end line, "3 cuts to fix". */
export function barReason(v) {
  if (v.end) return `${plural(v.toFix, 'cut')} to fix`;
  const reason = v.by === 'you' ? 'Your cut' : `Magic: ${v.reason}`;
  return v.more ? `${reason} · +${v.more} more` : reason;
}

/** What the screen reader hears on each stop: the full reason, not the truncated line. */
export const barAnnouncement = (v) => (v.end ? `${barHead(v)}. ${barReason(v)}.` : `${v.count}. ${barReason(v)}`);

/** The bar's width in a player `host` points wide. */
export const barWidth = (host) => Math.max(0, Math.min(BAR_W, host - 2 * INSET));

const BTN = 'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-raised';
const KIND = {
  quiet: `${BTN} text-text-secondary hover:text-text`,
  secondary: `${BTN} border border-hairline text-text hover:bg-surface`,
  primary: `${BTN} bg-accent font-semibold text-on-accent hover:brightness-110`,
};
const CAP = 'keycap rounded-[4px] border px-1 text-[11px] leading-4 font-normal tabular-nums';

function button(kind, key, name) {
  const b = el('button', KIND[kind]);
  const cap = el('kbd', `${CAP} ${kind === 'primary' ? 'border-on-accent/40' : 'border-hairline'}`, key);
  cap.setAttribute('aria-hidden', 'true');
  const word = el('span', '');
  b.append(cap, word);
  b.setAttribute('aria-label', name);
  b.title = name;
  b.type = 'button';
  return { b, cap, word };
}

/**
 * @param {HTMLElement} host  the player's box (position: relative)
 * @param {{onYes:()=>void, onNo:()=>void, onReplay:()=>void, onClose:()=>void, onFixFirst:()=>void}} o
 */
export function createReviewBar(host, o) {
  const bar = el('div', 'absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 rounded-[10px] border border-hairline bg-raised p-3 shadow-lg');
  bar.id = 'review-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cut review');

  const head = el('span', 'min-w-0 flex-1 truncate text-[11px] text-text-secondary tabular-nums');
  const x = el('button', 'flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent', '✕');
  x.setAttribute('aria-label', 'Stop reviewing (Escape)');
  x.title = 'Stop reviewing (Esc)';
  const top = el('div', '-mt-1.5 -mr-1.5 flex items-center');
  top.append(head, x);

  const reason = el('p', 'mt-0.5 truncate text-[13px] text-text');

  const replay = button('quiet', 'R', 'Replay (R)');
  const no = button('secondary', 'N', 'Fix later (N)');
  const yes = button('primary', 'Y', 'Looks good (Y)');
  const fixFirst = button('primary', '⌥→', 'Fix the first (Option Right Arrow)');
  const gap = el('span', 'flex-1');
  const actions = el('div', 'mt-3 flex items-center gap-2');
  actions.append(replay.b, gap, no.b, yes.b, fixFirst.b);

  const live = el('span', 'sr-only');
  live.setAttribute('aria-live', 'polite');

  bar.append(top, reason, actions, live);
  host.append(bar);

  x.onclick = () => o.onClose();
  replay.b.onclick = () => o.onReplay();
  no.b.onclick = () => o.onNo();
  yes.b.onclick = () => o.onYes();
  fixFirst.b.onclick = () => o.onFixFirst();
  // Clicks don't take focus away from where it is, so the keys keep working after one.
  for (const b of [x, replay.b, no.b, yes.b, fixFirst.b]) b.addEventListener('mousedown', (e) => e.preventDefault());

  let said = '';
  let shown = false;
  let end = false; // the end line is showing

  function layout() {
    const w = barWidth(host.clientWidth || BAR_W + 2 * INSET);
    bar.style.width = `${w}px`;
    const narrow = w < NARROW;
    yes.word.classList.toggle('hidden', narrow);
    no.word.classList.toggle('hidden', narrow);
    fixFirst.word.classList.toggle('hidden', narrow);
  }

  /** Paint a session view (null hides the bar). Focus goes to the primary when the bar first shows. */
  function paint(v) {
    if (!v) return hide();
    const first = !shown;
    shown = true;
    bar.classList.remove('hidden');
    layout();
    head.textContent = barHead(v);
    const why = barReason(v);
    reason.textContent = why;
    reason.title = why;
    for (const n of [replay.b, gap, no.b, yes.b]) n.classList.toggle('hidden', v.end);
    fixFirst.b.classList.toggle('hidden', !v.end || !v.toFix);
    if (!v.end) {
      yes.word.textContent = v.chosen === 'yes' ? '✓ Looks good' : 'Looks good';
      no.word.textContent = v.chosen === 'no' ? 'Noted' : 'Fix later';
      no.word.style.color = v.chosen === 'no' ? NOTE_HEX.red : '';
      yes.b.setAttribute('aria-pressed', String(v.chosen === 'yes'));
      no.b.setAttribute('aria-pressed', String(v.chosen === 'no'));
    }
    fixFirst.word.textContent = 'Fix the first';
    const say = barAnnouncement(v);
    if (say !== said) live.textContent = said = say;
    // Focus enters on the primary (so Return is Yes), and moves to the end line's primary when that shows.
    const modeChanged = end !== v.end;
    end = v.end;
    const target = v.end ? (v.toFix ? fixFirst.b : x) : yes.b;
    if (first || (modeChanged && (bar.contains(document.activeElement) || !document.activeElement))) {
      target.focus({ preventScroll: true });
    }
  }

  function hide() {
    if (!shown) return;
    shown = false;
    end = false;
    said = '';
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
