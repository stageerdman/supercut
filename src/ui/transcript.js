// TranscriptPanel: every word seeks the player to its start. The word being spoken is lit.
// AI results land here too: words inside a cut stay visible, struck through, so you can see what goes.
// The panel only exists once there are words (no empty panels, ever).
import { $, el, clock } from './dom.js';

/** Pure: is this word inside one of the cuts for its part? A word counts when its middle is cut. */
export function isCut(word, cuts) {
  const mid = (word.s + word.e) / 2;
  return cuts.some((c) => c.s <= mid && mid < c.e);
}

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

  parts.forEach((p, i) => {
    if (!p.transcript) return;
    if (parts.length > 1) box.append(el('h3', 'mt-3 mb-1 text-[11px] font-medium text-text-secondary first:mt-0', `Part ${i + 1}`));
    const para = el('p');
    if (!p.transcript.words.length) para.append(el('span', 'text-text-secondary', 'No speech found.'));
    const mine = cuts.filter((c) => c.part === p.id);
    for (const w of p.transcript.words) {
      const cut = mine.length && isCut(w, mine);
      const span = el('span', `cursor-pointer rounded hover:bg-raised ${cut ? 'text-text-secondary line-through decoration-accent' : ''}`, w.w);
      span.dataset.part = i;
      span.dataset.s = w.s;
      span.dataset.e = w.e;
      span.title = cut ? `Cut · ${clock(w.s)}` : clock(w.s);
      span.onclick = () => onSeek(i, w.s);
      para.append(span, ' ');
    }
    box.append(para);
  });
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
