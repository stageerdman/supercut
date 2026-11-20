// TranscriptPanel: every word seeks the player to its start. The word being spoken is lit.
// Cutting: click a word (⇧-click or drag for more), Backspace cuts it. Cut words stay visible, struck through,
// so you can see what goes; select them and Backspace again to bring them back.
// The panel only exists once there are words (no empty panels, ever).
import { $, el, clock } from './dom.js';
import { isCut, cutAt } from './cuts.js';

export { isCut };

/** Pure: a word's hover text. Magic's cuts say why. Tested in test/ui.test.mjs. */
export function cutTitle(cut, s) {
  if (!cut) return clock(s);
  return `${cut.reason ? `Magic Cut: ${cut.reason}` : `Cut · ${clock(s)}`} · Backspace brings it back`;
}

const CUT = ['text-text-secondary', 'line-through', 'decoration-accent', 'decoration-2'];

/**
 * @param {{parts: Array<{id:number, transcript: {words: Array<{w:string,s:number,e:number}>}|null}>,
 *          cuts: Array<{part:number, s:number, e:number}>, onSeek: (i:number, t:number)=>void}} s
 */
export function renderTranscript({ parts, cuts = [], onSeek }) {
  const done = parts.some((p) => p.transcript);
  const panel = $('transcript-panel');
  panel.classList.toggle('hidden', !done);
  panel.classList.toggle('flex', done);
  const box = $('transcript');
  box.replaceChildren();
  lit = null;
  anchor = null;

  parts.forEach((p, i) => {
    if (!p.transcript) return;
    if (parts.length > 1) box.append(el('h3', 'mt-3 mb-1 text-[11px] font-medium text-text-secondary first:mt-0', `Part ${i + 1}`));
    const para = el('p');
    if (!p.transcript.words.length) para.append(el('span', 'text-text-secondary', 'No speech found.'));
    for (const w of p.transcript.words) {
      const span = el('span', 'cursor-pointer rounded hover:bg-raised', w.w);
      span.dataset.part = i;
      span.dataset.id = p.id;
      span.dataset.s = w.s;
      span.dataset.e = w.e;
      span.onclick = (e) => {
        select(span, e.shiftKey);
        onSeek(i, w.s);
      };
      para.append(span, ' ');
    }
    box.append(para);
  });
  paintCuts(cuts);
}

/** Strike through the cut words, in place (keeps the selection and scroll). */
export function paintCuts(cuts) {
  for (const span of words()) {
    const w = { s: +span.dataset.s, e: +span.dataset.e };
    const cut = cutAt(w, cuts.filter((c) => c.part === +span.dataset.id));
    CUT.forEach((c) => span.classList.toggle(c, !!cut));
    span.title = cutTitle(cut, w.s);
  }
}

/**
 * The selected words, grouped by part: [{ part: id, words: [{s, e}] }]. Empty when nothing in the transcript is selected.
 */
export function selectedWords() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return [];
  const range = sel.getRangeAt(0);
  const groups = new Map();
  for (const span of words()) {
    if (!range.intersectsNode(span.firstChild)) continue;
    const id = +span.dataset.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ s: +span.dataset.s, e: +span.dataset.e });
  }
  return [...groups].map(([part, words]) => ({ part, words }));
}

const words = () => $('transcript').querySelectorAll('span[data-id]');

let anchor = null;
/** Click selects one word; ⇧-click extends from the last clicked word. */
function select(span, extend) {
  const sel = getSelection();
  const range = document.createRange();
  if (extend && anchor?.isConnected) {
    const first = anchor.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING ? anchor : span;
    range.setStartBefore(first);
    range.setEndAfter(first === anchor ? span : anchor);
  } else {
    range.selectNodeContents(span);
    anchor = span;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

let lit = null;
/** Light the word under the playhead of part `i` at time `t`. */
export function highlightWord(i, t) {
  let hit = null;
  for (const s of $('transcript').querySelectorAll(`span[data-part="${i}"]`)) {
    if (+s.dataset.s <= t && t < +s.dataset.e + 0.05) { hit = s; break; }
  }
  if (hit === lit) return;
  lit?.classList.remove('text-accent');
  hit?.classList.add('text-accent');
  lit = hit;
}
