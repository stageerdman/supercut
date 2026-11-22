// The transcript strip on top of the timeline: each word at its time (drawn on the timeline's canvas, clipped to its
// slot, so zoomed out you see fragments) and each pause as a block you can select (a DOM element: click, Tab, ⌫).
// Spec: design/timeline-strip.md. Layout and labels are pure and tested in test/timeline.test.mjs.
import { el } from './dom.js';
import { cutAt, cutsOf } from './cuts.js';
import { cutStyle, at } from './cut-view.js';
import { BREATH } from './pauses.js';

export const STRIP = { top: 32, h: 20 };
const TEXT = '242, 242, 243';
const GREY = '158, 161, 168';
const LINE = { you: `rgba(${GREY}, 0.9)`, magic: 'rgba(255, 106, 61, 0.9)' };
const MIN_SLOT = 4; // narrower than this, a word draws nothing (the pauses still show where speech is)
const LABEL_W = 36; // a pause this wide says its length

/** Index of the first word that ends after t (words in order). */
function firstAfter(words, t) {
  let lo = 0, hi = words.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (words[m].e <= t) lo = m + 1; else hi = m;
  }
  return lo;
}

/**
 * The words of one part in view: [{ x, w, text, by }] in view points. `w` is the word's slot (to the next word, or a
 * breath past its end before a pause); `by` is the owner of the cut it's in, or null. Pure.
 */
export function stripWords(box, words = [], cuts, scroll, width) {
  const k = box.w / box.len;
  const mine = cutsOf(cuts, box.id);
  const out = [];
  for (let i = firstAfter(words, (scroll - box.x) / k); i < words.length; i++) {
    const wd = words[i];
    const x = box.x + wd.s * k - scroll;
    if (x > width) break;
    const end = Math.min(words[i + 1]?.s ?? box.len, wd.e + BREATH, box.len);
    const w = (end - wd.s) * k;
    if (w >= MIN_SLOT) out.push({ x, w, text: wd.w, by: cutAt(wd, mine)?.by ?? null });
  }
  return out;
}

/** Paint the strip's words for every part in view. `g` is the timeline canvas' context, already scaled. */
export function drawStrip(g, { boxes, scroll, width, words, cuts }) {
  const y = STRIP.top + STRIP.h / 2;
  for (const box of boxes) {
    if (box.x + box.w < scroll || box.x > scroll + width) continue;
    for (const { x, w, text, by } of stripWords(box, words(box.id), cuts, scroll, width)) {
      g.save();
      g.beginPath();
      g.rect(x, STRIP.top, w - 1, STRIP.h);
      g.clip();
      g.fillStyle = by ? `rgba(${GREY}, 0.5)` : `rgba(${TEXT}, 0.9)`;
      g.fillText(text, x + 1, y);
      if (by) {
        g.fillStyle = LINE[by];
        g.fillRect(x, y, Math.min(w - 1, g.measureText(text).width + 2), 1);
      }
      g.restore();
    }
  }
}

const spoken = (p) => `${(p.e - p.s).toFixed(1)} seconds`;

/** What VoiceOver reads for a pause. */
export const pauseLabel = (p, cut) =>
  `Pause, ${spoken(p)}, at ${at(p.s)}${cut ? ', cut. Backspace restores.' : '. Backspace cuts it.'}`;

/**
 * One pause block in its part's strip lane. Kept: a quiet grey block; cut: the cut's hatch in its owner's colour.
 * @param {{s:number,e:number}} p
 * @param {{left:number, width:number, selected:boolean, index:number, cut?:{by:string}}} o
 */
export function pauseView(p, { left, width, selected, index, cut }) {
  const n = el('div', `absolute inset-y-0.5 z-[2] flex items-center justify-center overflow-hidden rounded-[3px] text-[11px] tabular-nums text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'ring-[1.5px] ring-accent' : ''}`,
    !cut && width >= LABEL_W ? `${(p.e - p.s).toFixed(1)} s` : '');
  n.style.cssText = `left:${left}px;width:${Math.max(2, width)}px;${cut ? cutStyle(cut.by) : `background:rgba(${GREY}, 0.14)`}`;
  n.tabIndex = 0;
  n.dataset.pause = index;
  n.setAttribute('role', 'button');
  n.setAttribute('aria-label', pauseLabel(p, cut));
  n.title = `Pause · ${(p.e - p.s).toFixed(1)} s`;
  return n;
}
