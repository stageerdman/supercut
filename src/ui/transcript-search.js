// The search field by the "Transcript" title: type to light every match, "2/5", ˄ ˅ (or Enter / ⇧Enter, ↑ ↓) to
// step through them, Esc clears (Esc again: back to the words). The matching lives in search.js and transcript.js.
// Spec: design/transcript-panel.md § Search. Tested in test/panel.test.mjs.
import { countText } from './search.js';

/** Pure: what a key in the field does. */
export function searchKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'Enter') return e.shiftKey ? 'prev' : 'next';
  if (e.key === 'ArrowDown') return 'next';
  if (e.key === 'ArrowUp') return 'prev';
  if (e.key === 'Escape') return 'escape';
  return null;
}

/**
 * @param {{input: HTMLInputElement, count: HTMLElement, prev: HTMLButtonElement, next: HTMLButtonElement,
 *          tools: HTMLElement}} ui  tools: the count and arrows, shown only with a query
 * @param {{search: (q:string) => {k:number,n:number}, step: (d:number) => {k:number,n:number}, focus: () => void}} transcript
 */
export function mountSearch(ui, transcript) {
  const paint = ({ k, n }) => {
    const has = ui.input.value.trim() !== '';
    ui.tools.classList.toggle('hidden', !has);
    ui.tools.classList.toggle('flex', has);
    ui.count.textContent = countText(k, n);
    ui.count.setAttribute('aria-label', n ? `${k + 1} of ${n}` : 'No matches');
    ui.prev.disabled = ui.next.disabled = n === 0;
  };
  const step = (d) => paint(transcript.step(d));

  ui.input.addEventListener('input', () => paint(transcript.search(ui.input.value)));
  ui.input.addEventListener('keydown', (e) => {
    const act = searchKey(e);
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();
    if (act === 'next') return step(1);
    if (act === 'prev') return step(-1);
    if (ui.input.value) { ui.input.value = ''; paint(transcript.search('')); }
    else { ui.input.blur(); transcript.focus(); }
  });
  ui.prev.addEventListener('click', () => step(-1));
  ui.next.addEventListener('click', () => step(1));

  return {
    /** ⌘F: into the field, its text selected so you can type over it. */
    focus() { ui.input.focus(); ui.input.select(); },
  };
}
