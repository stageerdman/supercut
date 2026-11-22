// One cut on the timeline: a block over the strip and the track, above words and pauses. A dimming base, the hatch
// in its owner's colour, a border all round, its length when there's room, drag handles when there's room.
// Spec: design/timeline-words-by-zoom.md (Cut blocks), design/timeline.md (Accessibility). Labels are pure and tested.
import { el } from './dom.js';

// The hatch is drawn at 78 % (100 % on hover), so these read as 35 % / 45 % at rest and +10 % on hover.
export const COLOR = { you: 'rgb(158 161 168 / 0.45)', magic: 'rgb(255 106 61 / 0.58)' };
const LINE = { you: 'rgb(158 161 168 / 0.9)', magic: 'rgb(255 106 61 / 0.9)' };
const BASE = 'rgb(23 24 27 / 0.72)'; // `surface` at 72 %: the words and waveform under it become a ghost
export const MIN_W = 2; // a cut is never invisible
export const HANDLES_W = 24; // room for both handles
export const LABEL_W = 40; // room for "2.4 s"
export const HIT_W = 12; // a thin cut still gets a finger-sized target

/** "0:42.3" */
export const at = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
export const secs = (c) => `${(c.e - c.s).toFixed(1)} s`;
const spoken = (c) => `${(c.e - c.s).toFixed(1)} seconds`;

/** What VoiceOver reads for a cut. */
export const cutLabel = (c) =>
  `Cut, ${at(c.s)} to ${at(c.e)}, ${spoken(c)}, ${c.by === 'magic' ? `by Magic Cut: ${c.reason}` : 'yours'}. Backspace restores.`;

/** The hover text: Magic's reason (also on a Magic cut you changed), else the length. */
export const cutHover = (c, roomy) =>
  `${c.reason ? `Magic Cut: ${c.reason}` : `Cut · ${secs(c)}`}${roomy ? '' : ' · Zoom in to drag'}`;

/** What VoiceOver reads for an edge. */
export const edgeText = (side, t) => `${side === 's' ? 'Start' : 'End'} of cut, ${at(t)}`;

/** The hatch: 45°, 6 pt, in the owner's colour. */
export const hatch = (by) => `background: repeating-linear-gradient(45deg, ${COLOR[by]} 0 1.5px, transparent 1.5px 6px);`;

/** The block's own look: the dimming base and a 1 pt border all round in the owner's line colour. */
export const cutStyle = (by, w) =>
  `background:${BASE};box-shadow:inset 0 0 0 1px ${LINE[by]};border-radius:${w < 8 ? 2 : 4}px;`;

/**
 * A cut block. It fills its layer's height (the strip row on top, the track under it).
 * @param {{part:number,s:number,e:number,by:string,reason?:string}} c
 * @param {{left:number, width:number, selected:boolean, index:number, row?:number}} o  position inside its part, in
 *   points; `row` is the strip row's height (the length label is centred on it)
 */
export function cutView(c, { left, width, selected, index, row = 20 }) {
  const w = Math.max(MIN_W, width);
  const roomy = width >= HANDLES_W;
  const n = el('div', `group/cut pointer-events-auto absolute inset-y-0 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg ${selected ? 'ring-[1.5px] ring-accent ring-offset-1 ring-offset-bg' : ''}`);
  n.style.cssText = `left:${left}px;width:${w}px;${cutStyle(c.by, w)}`;
  n.tabIndex = 0;
  n.dataset.cut = index;
  n.setAttribute('role', 'button');
  n.setAttribute('aria-label', cutLabel(c));
  n.title = cutHover(c, roomy);
  const h = el('div', 'pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.78] group-hover/cut:opacity-100');
  h.style.cssText = hatch(c.by);
  h.dataset.hatch = '';
  n.append(h);
  if (w < HIT_W) { // invisible, centred: a thin cut is still easy to click
    const hit = el('div', 'absolute inset-y-0');
    hit.style.cssText = `left:${(w - HIT_W) / 2}px;width:${HIT_W}px`;
    hit.dataset.hit = '';
    n.append(hit);
  }
  if (width >= LABEL_W) {
    const label = el('span', `pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center text-[11px] tabular-nums ${c.by === 'magic' ? 'text-accent' : 'text-text-secondary'}`, secs(c));
    label.style.height = `${row}px`;
    label.setAttribute('aria-hidden', 'true'); // the block's own label says it
    n.append(label);
  }
  if (roomy) for (const side of ['s', 'e']) n.append(edgeHandle(side, c[side], c.by));
  return n;
}

/** A 12 pt hit area at an edge; the 4 × 40 handle shows on hover or focus. role=slider, ← → nudge it. */
export function edgeHandle(side, t, by, bare = false) {
  const h = el('div', 'group/edge pointer-events-auto absolute inset-y-0 z-[3] w-3 cursor-ew-resize outline-none');
  h.style[side === 's' ? 'left' : 'right'] = '-6px';
  h.dataset.edge = side;
  h.tabIndex = 0;
  h.setAttribute('role', 'slider');
  h.setAttribute('aria-valuetext', bare ? `${side === 's' ? 'Start' : 'End'} of part, ${at(t)}` : edgeText(side, t));
  h.setAttribute('aria-valuenow', t.toFixed(2));
  const grip = el('div', 'pointer-events-none absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100');
  grip.style.background = bare ? 'var(--color-accent)' : LINE[by];
  h.append(grip);
  return h;
}
