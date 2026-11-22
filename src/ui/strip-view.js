// The transcript strip on top of the timeline: the words that fit this zoom (drawn on the timeline's canvas: every
// word, the first words of each phrase, or none; always whole, never overlapping) and each pause as a block you can
// select (a DOM element: click, Tab, ⌫). Spec: design/timeline-words-by-zoom.md (words), design/timeline-strip.md
// (pauses). Which words go where: word-levels.js. Tested in test/word-levels.test.mjs and test/timeline.test.mjs.
import { el } from './dom.js';
import { at } from './cut-view.js';
import { pauses } from './pauses.js';
import { secondsPerWord, levelFor, layoutLabels } from './word-levels.js';

export const STRIP = { top: 32, h: 20 };
const TEXT = '242, 242, 243';
const GREY = '158, 161, 168';
const LABEL_W = 36; // a pause this wide says its length
export const FADE_IN = 120; // ms: a label that appears inside a level
export const CROSSFADE = 150; // ms: the old level's labels out, the new one's in
const easeOut = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
const media = (q) => () => !!globalThis.matchMedia?.(q).matches;

/**
 * The strip's word painter. It keeps the level shown (for the hysteresis) and when each label appeared (for the
 * fades), so make one per timeline. `now`, `reduceMotion` and `moreContrast` are passed in by tests.
 */
export function stripPainter({
  now = () => globalThis.performance?.now() ?? Date.now(),
  reduceMotion = media('(prefers-reduced-motion: reduce)'),
  moreContrast = media('(prefers-contrast: more)'),
} = {}) {
  let level; // the level shown
  let from = null; // { level, at }: the level fading out
  let born = new Map(); // key → when it appeared (ms)
  const widths = new Map(); // text → drawn width, per word string (one font)

  /**
   * Paint the words of every part in view. `g` is the timeline canvas' context, already scaled, font set.
   * `words(id)` a part's words, `lengths` { [id]: seconds } where known, `pps` points per second.
   * @returns {boolean} still fading: paint again next frame
   */
  function draw(g, { boxes, scroll, width, pps, words, cuts, lengths = {} }) {
    const t = now();
    const still = reduceMotion();
    const measure = (s) => {
      let w = widths.get(s);
      if (w == null) {
        if (widths.size > 20000) widths.clear();
        widths.set(s, (w = g.measureText(s).width));
      }
      return w;
    };
    const spw = secondsPerWord(boxes.map((b) => words(b.id)));
    const next = levelFor(spw == null ? null : pps * spw, level);
    if (level !== undefined && next !== level && !still) from = { level, at: t };
    level = next;
    const p = from && !still ? easeOut((t - from.at) / CROSSFADE) : 1;
    if (p >= 1) from = null;

    // Lay out a screen beyond each side too, so a label scrolling into view is one we already know (no fade).
    const lay = (lvl) => boxes.flatMap((box) => {
      if (box.x + box.w < scroll - width || box.x > scroll + 2 * width) return [];
      const ws = words(box.id);
      return layoutLabels({
        box, words: ws, cuts, pauses: pauses(ws, lengths[box.id] ?? box.len),
        scroll: scroll - width, width: 3 * width, level: lvl, measure,
      }).map((l) => ({ ...l, x: l.x - width }));
    });

    const alpha = moreContrast() ? 1 : 0.9;
    const y = STRIP.top + STRIP.h / 2;
    const paint = (labels, a) => {
      for (const l of labels) {
        if (a <= 0 || l.x > width || l.x + measure(l.text) < 0) continue;
        g.fillStyle = `rgba(${TEXT}, ${+(alpha * a).toFixed(3)})`;
        g.fillText(l.text, l.x, y);
      }
    };

    let fading = !!from;
    if (from) paint(lay(from.level), 1 - p);
    const shown = lay(level);
    const seen = new Map();
    for (const l of shown) {
      // During a crossfade the new set fades in together; after it, they count as shown.
      const b = still || from ? -Infinity : born.get(l.key) ?? t;
      seen.set(l.key, b);
      const a = from ? p : easeOut((t - b) / FADE_IN);
      if (a < 1) fading = true;
      paint([l], a);
    }
    born = seen; // a label that no longer fits goes at once
    return fading;
  }

  return { draw, level: () => level };
}

const spoken = (p) => `${(p.e - p.s).toFixed(1)} seconds`;

/** What VoiceOver reads for a pause. */
export const pauseLabel = (p) => `Pause, ${spoken(p)}, at ${at(p.s)}. Backspace cuts it.`;

/**
 * One pause block in its part's strip lane: a quiet grey block. A pause all inside a cut isn't made (the cut block
 * covers it: `pauseCut`); one half inside is, and the block covers its cut half.
 * @param {{s:number,e:number}} p
 * @param {{left:number, width:number, selected:boolean, index:number}} o
 */
export function pauseView(p, { left, width, selected, index }) {
  const n = el('div', `absolute inset-y-0.5 z-[2] flex items-center justify-center overflow-hidden rounded-[3px] text-[11px] tabular-nums text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'ring-[1.5px] ring-accent' : ''}`,
    width >= LABEL_W ? `${(p.e - p.s).toFixed(1)} s` : '');
  n.style.cssText = `left:${left}px;width:${Math.max(2, width)}px;background:rgba(${GREY}, 0.14)`;
  n.tabIndex = 0;
  n.dataset.pause = index;
  n.setAttribute('role', 'button');
  n.setAttribute('aria-label', pauseLabel(p));
  n.title = `Pause · ${(p.e - p.s).toFixed(1)} s`;
  return n;
}
