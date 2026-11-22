// The timeline's canvas: ruler ticks and each part's waveform, only the visible range. Spec: design/timeline.md.
// One canvas the size of the view, moved with the scroll (a 30-minute part zoomed in is far wider than a canvas can be).
import { tickStep, tickLabel } from './timeline-geometry.js';
import { cutsOf } from './cuts.js';
import { STRIP, stripPainter } from './strip-view.js';

export const RULER = { top: 8, h: 20 };
export { STRIP };
export const TRACK = { top: STRIP.top + STRIP.h + 4, h: 72 }; // under the transcript strip
const GREY = '158, 161, 168';
const BAR = 2; // points per bar, 1 pt gap

/** Columns of one part's waveform in view: [{ x, h, cut }] — x in view points, h 0‥1 of the half-track. Pure. */
export function bars(box, wf, cuts, scroll, width) {
  if (!wf?.peaks?.length) return [];
  const from = Math.max(box.x, scroll), to = Math.min(box.x + box.w, scroll + width);
  const sec = box.len / box.w;
  const top = wf.peaks.reduce((m, p) => Math.max(m, p), 1); // scale to the loudest moment of the part
  const mine = cutsOf(cuts, box.id);
  const out = [];
  for (let x = from - ((from - box.x) % BAR); x < to; x += BAR) {
    const t0 = (x - box.x) * sec, t1 = t0 + BAR * sec;
    const i0 = Math.floor(t0 * wf.perSecond), i1 = Math.max(i0 + 1, Math.ceil(t1 * wf.perSecond));
    let p = 0;
    for (let i = i0; i < i1 && i < wf.peaks.length; i++) p = Math.max(p, wf.peaks[i]);
    const mid = (t0 + t1) / 2;
    out.push({ x: x - scroll, h: p / top, cut: mine.some((c) => c.s <= mid && mid < c.e) });
  }
  return out;
}

/** Ticks of one part's ruler in view: [{ x, label }]. Each part's ruler starts at 0:00 (source time). Pure. */
export function ticks(box, scroll, width, pps) {
  const step = tickStep(pps);
  const out = [];
  const first = Math.max(0, Math.floor(((scroll - box.x) / box.w) * box.len / step) * step);
  for (let t = first; t <= box.len + 1e-9; t += step) {
    const x = box.x + (t / box.len) * box.w - scroll;
    if (x > width) break;
    if (x >= -60) out.push({ x, label: tickLabel(Math.round(t * 10) / 10) });
  }
  return out;
}

let fallback;

/**
 * Paint the view. `canvas` is moved to `scroll` and sized to `width` by the caller. `strip` is the timeline's word
 * painter (stripPainter()). Returns true while the words are still fading: paint again next frame.
 */
export function drawTimeline(canvas, { boxes, scroll, width, height, pps, waveforms, words, cuts, lengths, strip }) {
  const dpr = globalThis.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);
  g.font = '11px -apple-system, system-ui, sans-serif';
  g.textBaseline = 'middle';
  const mid = TRACK.top + TRACK.h / 2, half = TRACK.h / 2 - 6;

  for (const box of boxes) {
    if (box.x + box.w < scroll || box.x > scroll + width) continue;
    g.fillStyle = `rgba(${GREY}, 1)`;
    for (const { x, label } of ticks(box, scroll, width, pps)) {
      g.fillRect(Math.round(x), RULER.top + RULER.h - 5, 1, 5);
      g.fillText(label, Math.round(x) + 4, RULER.top + RULER.h / 2 - 2);
    }
    const wf = waveforms(box.id);
    const cols = bars(box, wf, cuts, scroll, width);
    if (!cols.length) {
      // No waveform (yet, or it failed): a flat line mid-track. Everything else works.
      g.fillStyle = `rgba(${GREY}, 0.6)`;
      const from = Math.max(box.x, scroll);
      g.fillRect(from - scroll, mid, Math.min(box.x + box.w, scroll + width) - from, 1);
      continue;
    }
    for (const { x, h, cut } of cols) {
      g.fillStyle = `rgba(${GREY}, ${cut ? 0.25 : 0.6})`;
      const y = Math.max(0.5, h * half);
      g.fillRect(x, mid - y, BAR - 1, y * 2);
    }
  }
  return words ? (strip ?? (fallback ??= stripPainter())).draw(g, { boxes, scroll, width, pps, words, cuts, lengths }) : false;
}
