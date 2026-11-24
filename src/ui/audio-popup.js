// The Replace audio popup (design/audio-swap.md, "Entry"): one drop area under the toolbar button. Drop an audio
// file (the window's drop does the work; this only lights up) or click the area to choose one. Esc or a click away
// closes it with no change. Paints and reports; main.js runs the swap. Tested in test/audio.test.mjs.

export const IDLE = { headline: 'Drop your mic recording', sub: 'or click to choose · WAV · M4A · MP3 · AIFF' };
export const OVER = { headline: 'Drop to replace audio', sub: 'Lines up by sound' };

/**
 * @param {{popup: HTMLElement, area: HTMLElement, headline: HTMLElement, sub: HTMLElement, anchor: HTMLElement}} els
 *   anchor: the toolbar button (a click on it toggles, it isn't "away")
 * @param {{onChoose: () => void}} o  the area was clicked: open the file picker
 */
export function createAudioPopup({ popup, area, headline, sub, anchor }, o) {
  const isOpen = () => !popup.classList.contains('hidden');

  function drag(kind) {
    const over = isOpen() && kind === 'audio';
    area.classList.toggle('border-dashed', !over);
    area.classList.toggle('border-hairline', !over);
    area.classList.toggle('border-solid', over);
    area.classList.toggle('border-accent', over);
    area.classList.toggle('bg-accent/8', over);
    const t = over ? OVER : IDLE;
    headline.textContent = t.headline;
    sub.textContent = t.sub;
  }

  function open() {
    if (isOpen()) return;
    drag(null);
    popup.classList.remove('hidden');
    anchor.setAttribute('aria-expanded', 'true');
    area.focus();
  }

  function close({ refocus = false } = {}) {
    if (!isOpen()) return;
    popup.classList.add('hidden');
    anchor.setAttribute('aria-expanded', 'false');
    if (refocus) anchor.focus();
  }

  area.onclick = () => { close(); o.onChoose(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close({ refocus: true }); }
  });
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !popup.contains(e.target) && !anchor.contains(e.target)) close();
  });

  return { open, close, drag, isOpen, toggle: () => (isOpen() ? close({ refocus: true }) : open()) };
}
