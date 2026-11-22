// The fix field: type over selected words to fix them, or into the time between words to add some. Inline, in
// place of the words (or between them), no label, no button. Return or a click away commits (one undo step), Esc
// cancels. Spec: design/transcript-editing.md, design/missed-words.md ("Where you type").
import { el } from './dom.js';
import { writeWords } from './fix.js';

/**
 * Pure: the step a fix of words[from..to] makes. Same text or empty text → null (no step).
 * @returns {{words: Array, label: string} | null}  label: 'Fixed “gonna”'
 */
export function fixStep(words, from, to, text) {
  return writeWords(words, { s: words[from].s, e: words[to].e }, text);
}

/**
 * Open the field over `spans` (the selected word elements, in order), or, with no spans, empty at `place`.
 * @param {{text: string, selectAll: boolean, onDone: (text: string|null) => void,
 *   place?: (field: HTMLElement) => void}} o  onDone(null) = cancelled; place puts the field in the panel
 */
export function openFixField(spans, { text, selectAll, onDone, place }) {
  const field = el('span', 'inline-block min-w-[1ch] rounded-md bg-bg px-0.5 outline outline-1 outline-accent', text);
  field.contentEditable = 'plaintext-only';
  field.setAttribute('role', 'textbox');
  field.setAttribute('aria-label', spans.length ? `Fix words, ${spans.map((s) => s.dataset.w).join(' ')}` : 'Write words here');
  if (spans.length) spans[0].before(field);
  else place(field);
  spans.forEach((s) => s.classList.add('hidden'));

  let done = false;
  const finish = (value) => {
    if (done) return;
    done = true;
    spans.forEach((s) => s.classList.remove('hidden'));
    field.remove();
    onDone(value);
  };
  field.addEventListener('keydown', (e) => {
    e.stopPropagation(); // letters, ⌫, Space and ← → belong to the field here
    if (e.key === 'Enter') { e.preventDefault(); finish(field.textContent); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
  });
  field.addEventListener('blur', () => finish(field.textContent));

  field.focus();
  const range = document.createRange();
  range.selectNodeContents(field);
  if (!selectAll) range.collapse(false); // caret after the typed letter
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return { field, close: () => finish(field.textContent) };
}
