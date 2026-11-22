// The fix field: type over selected words to fix them or add some. Inline, in place of the words, no label, no
// button. Return or a click away commits (one undo step), Esc cancels. Spec: design/transcript-editing.md.
import { el } from './dom.js';
import { fixWords } from './fix.js';

const said = (words) => words.map((w) => w.w).join(' ');
const short = (text) => {
  const w = text.split(' ');
  return w.length > 3 ? `${w.slice(0, 3).join(' ')}…` : text;
};

/**
 * Pure: the step a fix makes. Same text or empty text → null (no step).
 * @returns {{words: Array, label: string} | null}  label: 'Fixed “gonna”'
 */
export function fixStep(words, from, to, text) {
  const before = said(words.slice(from, to + 1));
  const typed = text.trim().split(/\s+/).filter(Boolean).join(' ');
  if (!typed || typed === before) return null;
  return { words: fixWords(words, from, to, typed), label: `Fixed “${short(before)}”` };
}

/**
 * Open the field over `spans` (the selected word elements, in order).
 * @param {{text: string, selectAll: boolean, onDone: (text: string|null) => void}} o  onDone(null) = cancelled
 */
export function openFixField(spans, { text, selectAll, onDone }) {
  const field = el('span', 'rounded-md bg-bg px-0.5 outline outline-1 outline-accent', text);
  field.contentEditable = 'plaintext-only';
  field.setAttribute('role', 'textbox');
  field.setAttribute('aria-label', `Fix words, ${spans.map((s) => s.dataset.w).join(' ')}`);
  spans[0].before(field);
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
  return { close: () => finish(field.textContent) };
}
