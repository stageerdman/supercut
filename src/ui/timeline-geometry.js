// Timeline geometry: time ↔ x, fit, zoom, snapping, the ← → bit. Pure, no DOM. Spec: design/timeline.md.
// Zoom is `pps`, points per second. Parts sit in order, GAP apart, after PAD; each is its length × pps wide.
import { FRAME } from './bit.js';

export const PAD = 16;
export const GAP = 8;
export const SNAP_PT = 8;
export const MAX_PPS = 300; // a frame is 10 pt: enough to drag one
const UNKNOWN = 60; // a part whose length isn't known yet is drawn as a minute

/** [{ id, x, w, len }] for parts [{ id, duration }] at zoom pps. */
export function layout(parts, pps) {
  let x = PAD;
  return parts.map((p) => {
    const len = p.duration || UNKNOWN;
    const box = { id: p.id, x, w: len * pps, len };
    x += box.w + GAP;
    return box;
  });
}

/** Content width: the parts plus the padding on both sides (and room for `extra`, the add-slot). */
export const contentWidth = (boxes, extra = 0) => (boxes.length ? boxes.at(-1).x + boxes.at(-1).w : PAD) + PAD + extra;

/** The zoom where everything fits in `width` points. */
export function fitPps(parts, width, extra = 0) {
  const total = parts.reduce((s, p) => s + (p.duration || UNKNOWN), 0) || UNKNOWN;
  const room = width - 2 * PAD - GAP * Math.max(0, parts.length - 1) - extra;
  return Math.min(MAX_PPS, Math.max(room, 40) / total);
}

/** x of time t in box (part) i. */
export const xAt = (boxes, i, t) => boxes[i].x + t * (boxes[i].w / boxes[i].len);

/** The part under x and the time there, clamped to that part. `i` pins the part (a drag stays in its part). */
export function timeAt(boxes, x, i) {
  if (i == null) {
    i = boxes.findIndex((b) => x < b.x + b.w + GAP / 2);
    if (i < 0) i = boxes.length - 1;
  }
  const b = boxes[i];
  return { i, part: b.id, t: Math.min(b.len, Math.max(0, ((x - b.x) / b.w) * b.len)) };
}

/** The scroll that keeps the same moment at the same place on screen after a zoom. */
export const anchoredScroll = (screenX, newContentX) => Math.max(0, newContentX - screenX);

// Pinch zoom is proportional: the view scales with the fingers, amplified so one pinch covers a real distance
// (a full spread, ×2.5 on the trackpad, zooms ×6). Spec: design/timeline.md § Zoom.
export const PINCH_GAIN = 2;
const WHEEL_K = 0.01; // ⌃-wheel (Chromium pinch, ⌘-scroll): deltaY ≈ −100·ln(scale)
const WHEEL_MAX = 25; // one mouse-wheel notch zooms at most ×1.65

/** The zoom level (0 = fit … 1 = MAX_PPS, log scale) after scaling the view by `factor`. */
export function zoomScaled(z, factor, fit) {
  const range = Math.log(MAX_PPS / fit);
  if (!(range > 0) || !(factor > 0)) return z;
  return Math.min(1, Math.max(0, z + Math.log(factor) / range));
}

/** The pinch factor for a WebKit gesture's `scale` (cumulative since gesturestart). */
export const pinchFactor = (scale) => scale ** PINCH_GAIN;

/** The factor for one ⌃/⌘-wheel event: deltaY in pixels (deltaMode 1 = lines). Up / spread zooms in. */
export function wheelFactor(deltaY, deltaMode = 0) {
  const dy = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1)));
  return Math.exp(-dy * WHEEL_K * PINCH_GAIN);
}

/** Seconds per ← → step: the time under 4 pt, never under a frame. */
export const bitFor = (pps) => Math.max(4 / pps, FRAME);

/** The nearest target within 8 pt of t, else t. `free` (⌥ held) turns snapping off. */
export function snap(t, targets, pps, free = false) {
  if (free) return t;
  let best = t, gap = SNAP_PT / pps;
  for (const x of targets) {
    const d = Math.abs(x - t);
    if (d <= gap) { best = x; gap = d; }
  }
  return best;
}

/** What edges snap to in a part: word starts and ends, the playhead (when it's in this part), the part's ends. */
export function snapTargets(words = [], len, playhead = null) {
  return [0, len, ...(playhead == null ? [] : [playhead]), ...words.flatMap((w) => [w.s, w.e])];
}

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
/** Ruler tick spacing in seconds: the smallest step at least 64 pt apart. */
export const tickStep = (pps) => STEPS.find((s) => s * pps >= 64) ?? STEPS.at(-1);

/** A ruler label: "1:30", or "1:30.5" between whole seconds. */
export function tickLabel(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  const whole = Math.abs(s - Math.round(s)) < 1e-6;
  return `${m}:${(whole ? String(Math.round(s)) : s.toFixed(1)).padStart(whole ? 2 : 4, '0')}`;
}
