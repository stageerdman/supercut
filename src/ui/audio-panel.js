// The toolbar's Replace audio button and the Audio panel under it (design/audio-swap.md). Before any swap the
// button reports onPick (main.js opens the drop-or-choose popup, audio-popup.js); after, it reads the file name and opens the panel: one row per part (its sound and, for
// mic rows, a one-frame nudge), Replace… and Use camera audio. Esc or a click away closes it. Paints and reports
// intents; main.js does the work. Tested in test/audio.test.mjs (with test/fake-dom.mjs).
import { el } from './dom.js';
import { audioButton, sourceText, nudgeText, nudgeSpoken, FRAME } from './audio.js';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const STEP = `flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-raised hover:text-text ${FOCUS}`;
const WAVE = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h0"/></svg>';

/** The nudge of a mic row: its change from where it was matched (seconds). */
export const nudgeOf = (part) => (part.swap ? part.swap.offset - (part.swap.matched ?? part.swap.offset) : 0);

/**
 * @param {{button: HTMLElement, panel: HTMLElement, rows: HTMLElement, replace: HTMLElement, camera: HTMLElement}} els
 * @param {{parts: () => Array, onPick: () => void, onCamera: () => void, onNudge: (id:number, offset:number) => void,
 *          onClose: () => void}} o  onNudge: the part's new offset; onClose: the panel closed (end of a nudge step)
 */
export function createAudioControl({ button, panel, rows, replace, camera }, o) {
  const isOpen = () => !panel.classList.contains('hidden');

  function paint({ hidden = false, busy = false } = {}) {
    const parts = o.parts();
    const v = audioButton(parts);
    button.classList.toggle('hidden', hidden || !parts.length);
    button.classList.toggle('flex', !hidden && !!parts.length);
    button.disabled = busy;
    button.innerHTML = WAVE;
    button.append(el('span', 'max-w-[160px] truncate', v.text));
    button.classList.toggle('text-text', v.swapped);
    button.classList.toggle('text-text-secondary', !v.swapped);
    button.title = v.title;
    button.setAttribute('aria-label', v.label);
    button.setAttribute('aria-haspopup', 'dialog'); // the drop-or-choose popup, or after a swap the panel
    button.setAttribute('aria-controls', v.swapped ? 'audio-panel' : 'audio-popup');
    if ((hidden || busy || !v.swapped) && isOpen()) close();
    if (isOpen()) paintRows();
  }

  function paintRows() {
    const parts = o.parts();
    const focused = document.activeElement?.dataset?.nudge;
    rows.replaceChildren(...parts.map((p, i) => {
      const row = el('div', 'flex h-8 items-center gap-3');
      if (parts.length > 1) row.append(el('span', 'w-12 shrink-0 text-text-secondary', `Part ${i + 1}`));
      row.append(el('span', `min-w-0 flex-1 truncate ${p.swap ? 'text-text' : 'text-text-secondary'}`, sourceText(p)));
      if (p.swap) row.append(nudge(p, i, parts.length));
      return row;
    }));
    if (focused) rows.querySelector(`[data-nudge="${focused}"]`)?.focus();
  }

  /** ‹ 0.00 s ›: a spinbutton; ← → / ↑ ↓ one frame. */
  function nudge(p, i, count) {
    const d = nudgeOf(p);
    const box = el('div', `flex items-center rounded-md tabular-nums outline-none ${FOCUS}`);
    box.tabIndex = 0;
    box.dataset.nudge = String(p.id);
    box.setAttribute('role', 'spinbutton');
    box.setAttribute('aria-label', count > 1 ? `Audio timing, part ${i + 1}` : 'Audio timing');
    box.setAttribute('aria-valuenow', d.toFixed(3));
    box.setAttribute('aria-valuetext', nudgeSpoken(d));
    const move = (frames) => o.onNudge(p.id, p.swap.offset + frames * FRAME);
    const earlier = el('button', STEP, '‹');
    earlier.tabIndex = -1;
    earlier.setAttribute('aria-label', 'One frame earlier');
    earlier.onclick = () => move(-1);
    const later = el('button', STEP, '›');
    later.tabIndex = -1;
    later.setAttribute('aria-label', 'One frame later');
    later.onclick = () => move(1);
    for (const b of [earlier, later]) b.addEventListener('mousedown', (e) => e.preventDefault());
    box.onkeydown = (e) => {
      const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!k) return;
      e.preventDefault();
      e.stopPropagation(); // not the playhead
      move(k);
    };
    box.append(earlier, el('span', 'w-14 text-center', nudgeText(d)), later);
    return box;
  }

  function open() {
    panel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    paintRows();
    (rows.querySelector('[data-nudge]') ?? replace).focus();
  }

  function close({ refocus = false } = {}) {
    if (!isOpen()) return;
    panel.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
    o.onClose();
  }

  button.onclick = () => {
    if (!audioButton(o.parts()).swapped) return o.onPick();
    if (isOpen()) close({ refocus: true });
    else open();
  };
  replace.onclick = () => { close(); o.onPick(); };
  camera.onclick = () => { close({ refocus: true }); o.onCamera(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close({ refocus: true }); }
  });
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !button.contains(e.target)) close();
  });

  return { paint, close, get open() { return isOpen(); }, repaint: () => isOpen() && paintRows() };
}
