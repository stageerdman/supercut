// One cut on the timeline: hatch in its owner's colour, a solid line at each edge, drag handles when there's room.
// Spec: design/timeline.md (Cuts, Accessibility). The words for it (labels, colours) are pure and tested.
import { el } from './dom.js';

export const COLOR = { you: 'rgb(158 161 168 / 0.35)', magic: 'rgb(255 106 61 / 0.45)' };
const LINE = { you: 'rgb(158 161 168 / 0.9)', magic: 'rgb(255 106 61 / 0.9)' };
export const MIN_W = 2; // a cut is never invisible
export const HANDLES_W = 24; // room for both handles

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

/** The hatch: 45°, 6 pt, in the owner's colour, with a solid edge line. */
export const cutStyle = (by) =>
  `background: repeating-linear-gradient(45deg, ${COLOR[by]} 0 1.5px, transparent 1.5px 6px); ` +
  `box-shadow: inset 1px 0 ${LINE[by]}, inset -1px 0 ${LINE[by]};`;

/**
 * @param {{part:number,s:number,e:number,by:string,reason?:string}} c
 * @param {{left:number, width:number, selected:boolean, index:number}} o  position inside its part, in points
 */
export function cutView(c, { left, width, selected, index }) {
  const w = Math.max(MIN_W, width);
  const roomy = width >= HANDLES_W;
  const n = el('div', `absolute inset-y-0 z-[2] outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'ring-[1.5px] ring-accent' : ''}`);
  n.style.cssText = `left:${left}px;width:${w}px;${cutStyle(c.by)}`;
  n.tabIndex = 0;
  n.dataset.cut = index;
  n.setAttribute('role', 'button');
  n.setAttribute('aria-label', cutLabel(c));
  n.title = cutHover(c, roomy);
  if (roomy) for (const side of ['s', 'e']) n.append(edgeHandle(side, c[side], c.by));
  return n;
}

/** A 12 pt hit area at an edge; the 4 × 40 handle shows on hover or focus. role=slider, ← → nudge it. */
export function edgeHandle(side, t, by, bare = false) {
  const h = el('div', 'group/edge absolute inset-y-0 z-[3] w-3 cursor-ew-resize outline-none');
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
