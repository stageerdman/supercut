// MagicButton: paints a magicView() into the toolbar's #magic button, and the Review cuts button beside it.
// Ready = filled accent button (plain while Review cuts is the primary). Queued / running = quiet pill with a ✕.
import { $ } from './dom.js';
import { magicView } from './magic.js';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const FILLED = 'h-8 rounded-[10px] bg-accent px-3 font-semibold text-on-accent hover:brightness-110';
export const PLAIN = 'h-8 rounded-[10px] border border-hairline px-3 text-text hover:bg-raised';
const PRESSED = 'h-8 rounded-[10px] border border-hairline bg-raised px-3 text-text';
const PILL = 'h-8 rounded-full border border-accent px-3 text-text';

/** `plain`: another button (Review cuts) is the toolbar's primary right now. */
export function paintMagic(state, { plain = false } = {}) {
  const btn = $('magic');
  const v = magicView(state);
  btn.classList.toggle('hidden', !v.visible);
  if (!v.visible) return;
  btn.className = `flex items-center gap-2 ${FOCUS} ${v.pill ? PILL : plain ? PLAIN : FILLED}`;
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

/** Review cuts: a reviewButton() view (review-control.js). */
export function paintReview(v) {
  const btn = $('review');
  btn.classList.toggle('hidden', !v.visible);
  if (!v.visible) return;
  btn.className = `mr-2 flex items-center ${FOCUS} ${v.pressed ? PRESSED : v.primary ? FILLED : PLAIN}`;
  btn.setAttribute('aria-pressed', String(v.pressed));
}
