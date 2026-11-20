// MagicButton: paints a magicView() into the toolbar's #magic button.
// Ready = filled accent button. Queued / running = quiet pill with a ✕ to cancel.
import { $ } from './dom.js';
import { magicView } from './magic.js';

const FILLED = 'h-8 rounded-[10px] bg-accent px-3 font-semibold text-on-accent hover:brightness-110';
const PILL = 'h-8 rounded-full border border-accent px-3 text-text';

export function paintMagic(state) {
  const btn = $('magic');
  const v = magicView(state);
  btn.classList.toggle('hidden', !v.visible);
  if (!v.visible) return;
  btn.className = `flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${v.pill ? PILL : FILLED}`;
  btn.replaceChildren(document.createTextNode(v.label));
  if (v.pill) {
    const x = document.createElement('span');
    x.className = 'text-text-secondary';
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '✕';
    btn.append(x);
  }
  btn.setAttribute('aria-label', v.pill ? `${v.label} ${v.cancel}` : 'Magic (⌘↩)');
  btn.title = v.pill ? v.cancel : 'Cut the video with AI (⌘↩)';
}
