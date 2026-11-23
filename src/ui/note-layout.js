// Where one part's notes sit in the notes lane at this zoom: pills (moments), bars (sections), clusters (markers too
// close to tell apart), their labels (whole words or nothing, never into the next note), stacking and hit areas.
// Pure, no DOM. Spec: design/notes.md ("The lane"). Tested in test/note-layout.test.mjs.
import { fitPhrase, GAP } from './word-levels.js';

export const PILL_W = 6; // a moment note
export const BADGE_W = 14; // a Magic moment (✦ inside) or a done one (✓ inside)
export const CLUSTER_W = 18;
export const MERGE = 12; // markers whose centres are closer than this merge; sections narrower than this can merge
export const HIT_MIN = 12;
export const MARGIN = 1.15; // a cluster click zooms until the closest two are MERGE · MARGIN apart

const ELLIPSIS = '…';
const isMoment = (n) => n.s === n.e;
const centre = (n) => (n.s + n.e) / 2;

/** The first line of the note's text, trimmed ('' for none). */
export const firstLine = (text = '') => text.trim().split('\n')[0].trim();

function marker(n, pps) {
  const done = !!n.done;
  if (isMoment(n)) {
    const w = n.by === 'magic' || done ? BADGE_W : PILL_W;
    const cx = n.s * pps;
    return { kind: 'moment', ids: [n.id], x: cx - w / 2, w, cx, color: n.color, by: n.by, done, s: n.s };
  }
  const x = n.s * pps, w = Math.max(PILL_W, (n.e - n.s) * pps);
  return { kind: 'section', ids: [n.id], x, w, cx: x + w / 2, color: n.color, by: n.by, done, s: n.s };
}

const small = (m) => m.kind === 'moment' || m.w < MERGE;

/** Runs of small markers whose neighbouring centres are under MERGE apart become one cluster. */
function cluster(list) {
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    if (small(list[i])) while (j + 1 < list.length && small(list[j + 1]) && list[j + 1].cx - list[j].cx < MERGE) j++;
    if (j === i) { out.push(list[i]); i++; continue; }
    const run = list.slice(i, j + 1);
    const cx = (run[0].cx + run.at(-1).cx) / 2;
    const colors = new Set(run.map((m) => m.color));
    out.push({
      kind: 'cluster', ids: run.flatMap((m) => m.ids), x: cx - CLUSTER_W / 2, w: CLUSTER_W, cx,
      color: colors.size === 1 ? run[0].color : null, by: null, done: run.every((m) => m.done), s: run[0].s,
    });
    i = j + 1;
  }
  return out;
}

/** The label that fits `room`: whole words, then "…" if more follows; '' if not even the first word fits. */
function fitLabel(text, room, measure) {
  const words = text.split(/\s+/).filter(Boolean).map((w) => ({ w }));
  if (!words.length || room <= 0) return '';
  return fitPhrase(words, 0, words.length, room, { measure, space: measure(' '), dots: measure(ELLIPSIS) });
}

/**
 * One part's lane items in time order (the DOM and Tab order), in points from the part's start.
 * @param {{notes: Array, len: number, pps: number, measure: (t:string) => number, showDone?: boolean}} o
 *   notes: this part's notes only
 * @returns {Array<{kind:'moment'|'section'|'cluster', ids:string[], x:number, w:number, cx:number, color:string|null,
 *   by:string|null, done:boolean, label:string, labelX:number, hit:{x:number,w:number}, z:number}>}
 */
export function layoutNotes({ notes = [], len, pps, measure, showDone = false }) {
  const shown = notes.filter((n) => showDone || !n.done).sort((a, b) => a.s - b.s || a.e - b.e);
  const items = cluster(shown.map((n) => marker(n, pps)).sort((a, b) => a.cx - b.cx || a.s - b.s));
  items.sort((a, b) => a.s - b.s || a.x - b.x);
  const byId = new Map(shown.map((n) => [n.id, n]));
  const end = len * pps;
  // Stacking: the longest section lowest, shorter ones above it, then every moment and cluster.
  const sections = items.filter((m) => m.kind === 'section').sort((a, b) => b.w - a.w);
  const top = sections.length + 1;
  return items.map((m, k) => {
    const z = m.kind === 'section' ? sections.indexOf(m) + 1 : top;
    const hw = Math.max(HIT_MIN, m.w);
    const out = { ...m, label: '', labelX: 0, hit: { x: m.cx - hw / 2, w: hw }, z };
    delete out.s;
    if (m.kind === 'cluster') return out;
    const text = firstLine(byId.get(m.ids[0]).text);
    if (!text) return out;
    const labelX = m.kind === 'moment' ? m.x + m.w + 4 : m.x + 6 + (m.by === 'magic' ? 14 : 0);
    const next = items.slice(k + 1).find((o) => o.x > m.x)?.x ?? Infinity;
    let stop = Math.min(next, end) - GAP;
    if (m.kind === 'section') stop = Math.min(stop, m.x + m.w - 4);
    out.labelX = labelX;
    out.label = fitLabel(text, stop - labelX, measure);
    return out;
  });
}

/** The zoom (points per second) at which these notes stop merging: the closest two centres MERGE · MARGIN apart. */
export function clusterPps(notes) {
  const cs = notes.map(centre).sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < cs.length; i++) if (cs[i] - cs[i - 1] > 1e-6) gap = Math.min(gap, cs[i] - cs[i - 1]);
  return gap === Infinity ? Infinity : (MERGE * MARGIN) / gap;
}
