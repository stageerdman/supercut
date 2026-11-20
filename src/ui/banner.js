// Banner: the one pattern for every error. One sentence, at most one action, ✕.
// Never blocks the screen; a new message replaces the old one.
import { $ } from './dom.js';

export function showBanner(text, action) {
  $('banner-text').textContent = text;
  const btn = $('banner-action');
  btn.classList.toggle('hidden', !action);
  if (action) {
    btn.textContent = action.label;
    btn.onclick = action.run;
  }
  $('banner').classList.replace('hidden', 'flex');
}

export const hideBanner = () => $('banner').classList.replace('flex', 'hidden');

$('banner-close').onclick = hideBanner;
