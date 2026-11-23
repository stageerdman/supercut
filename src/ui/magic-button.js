// MagicButton: paints a magicView() into the toolbar's #magic button, and the Review cuts button after it (far right).
// Ready = filled accent button (plain while Review cuts is the primary). Queued / running = quiet pill with a ✕.
// Hidden while reviewing (design/cut-review.md): a Magic run can't start mid-review.
import { $ } from './dom.js';
import { magicView } from './magic.js';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const FILLED = 'h-8 rounded-[10px] bg-accent px-3 font-semibold text-on-accent hover:brightness-110';
export const PLAIN = 'h-8 rounded-[10px] border border-hairline px-3 text-text hover:bg-raised';
const PILL = 'h-8 rounded-full border border-accent px-3 text-text';
// Review cuts and Stop review share one width (the wider label, semibold, plus padding): the button never resizes.
const REVIEW_W = 'w-[108px] shrink-0 justify-center';

/**
 * `plain`: another button (Review cuts) is the toolbar's primary right now. `hidden`: reviewing.
 * `gap`: Review cuts follows it, so it keeps 8 pt from it.
 */
export function paintMagic(state, { plain = false, hidden = false, gap = false } = {}) {
  const btn = $('magic');
  const v = magicView(state);
  btn.classList.toggle('hidden', hidden || !v.visible);
  if (hidden || !v.visible) return;
  btn.className = `flex items-center gap-2 ${gap ? 'mr-2' : ''} ${FOCUS} ${v.pill ? PILL : plain ? PLAIN : FILLED}`;
  btn.replaceChildren(document.createTextNode(v.label));
  if (v.pill) {
    const x = document.createElement('span');
    x.className = 'text-text-secondary';
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '✕';
    btn.append(x);
  }
  btn.setAttribute('aria-label', v.pill ? `${v.label} ${v.cancel}` : 'Magic Cut (⌘↩)');
  btn.title = v.pill ? v.cancel : 'Cut the video with AI (⌘↩)';
}

/** Review cuts / Stop review: a reviewButton() view (review-control.js). Its name is its label. */
export function paintReview(v) {
  const btn = $('review');
  btn.classList.toggle('hidden', !v.visible);
  if (!v.visible) return;
  btn.className = `flex items-center ${REVIEW_W} ${FOCUS} ${v.primary ? FILLED : PLAIN}`;
  btn.textContent = v.label;
  btn.title = v.label === 'Review cuts' ? 'Review cuts (R)' : 'Stop review';
  btn.setAttribute('aria-label', btn.title);
  btn.removeAttribute('aria-pressed');
}
