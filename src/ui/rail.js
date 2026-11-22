// The rail: a thin vertical timeline beside the transcript. The whole recording runs top to bottom (parts stacked);
// it shows the stretch you're reading and the playhead. Click or drag it to go there.
// Spec: design/transcript-panel.md § The rail. The pure mapping is tested in test/panel.test.mjs.
import { el, clock } from './dom.js';

export const GAP = 0.012; // between two parts, as a share of the height

/** Pure: each part's [top, bottom] as shares of the rail (0…1), by part index. Unknown lengths count as 0. */
export function railSpans(lens) {
  const n = lens.length, total = lens.reduce((a, b) => a + (b || 0), 0);
  const room = 1 - GAP * Math.max(0, n - 1);
  let y = 0;
  return lens.map((len) => {
    const h = total ? (room * (len || 0)) / total : room / n;
    const span = [y, y + h];
    y += h + GAP;
    return span;
  });
}

/** Pure: time `t` of part index `i` → share of the rail. */
export function yOf(lens, i, t) {
  const sp = railSpans(lens)[i];
  if (!sp) return 0;
  const len = lens[i] || 0;
  return sp[0] + (len ? (sp[1] - sp[0]) * Math.min(1, Math.max(0, t / len)) : 0);
}

/** Pure: share of the rail → { i, t } (a gap belongs to the part above). */
export function timeAt(lens, y) {
  const spans = railSpans(lens);
  let i = spans.findIndex(([, b], k) => y <= b || (spans[k + 1] && y < spans[k + 1][0]));
  if (i < 0) i = spans.length - 1;
  if (i < 0) return null;
  const [a, b] = spans[i];
  const f = b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0;
  return { i, t: f * (lens[i] || 0) };
}

const STEP = 5, PAGE = 30; // s, for ↑ ↓ and Page keys

/**
 * @param {HTMLElement} box  the rail column
 * @param {{lengths: () => number[], playhead: () => ({i:number,t:number}), onSeek: (i:number, t:number) => void}} o
 */
export function createRail(box, o) {
  const track = el('div', 'pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2');
  const view = el('div', 'pointer-events-none absolute left-1/2 hidden w-1.5 -translate-x-1/2 rounded-full bg-white/16');
  const head = el('div', 'pointer-events-none absolute left-1/2 h-0.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent');
  const tip = el('div', 'pointer-events-none absolute right-full mr-1 hidden -translate-y-1/2 rounded-md bg-raised px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums text-text');
  box.append(track, view, head, tip);
  box.setAttribute('role', 'slider');
  box.setAttribute('aria-label', 'Position in video');
  box.setAttribute('aria-orientation', 'vertical');
  box.tabIndex = 0;

  let lens = [];
  const at = (e) => {
    const r = box.getBoundingClientRect();
    const y = r.height ? (e.clientY - r.top) / r.height : 0;
    return { y: Math.min(1, Math.max(0, y)), to: timeAt(lens, y) };
  };
  const pct = (y) => `${(y * 100).toFixed(3)}%`;

  /** Repaint the parts' segments (when lengths change). */
  function paintTrack() {
    lens = o.lengths();
    track.replaceChildren(...railSpans(lens).map(([a, b]) => {
      const seg = el('div', 'absolute inset-x-0 rounded-full bg-raised');
      seg.style.top = pct(a);
      seg.style.height = pct(b - a);
      return seg;
    }));
  }

  /** The stretch on screen, from { i, t } to { i, t }; null hides it. */
  function paintView(from, to) {
    view.classList.toggle('hidden', !from);
    if (!from) return;
    const a = yOf(lens, from.i, from.t), b = Math.max(a, yOf(lens, to.i, to.t));
    view.style.top = pct(a);
    view.style.height = `max(4px, ${pct(b - a)})`;
  }

  function paintHead() {
    const { i, t } = o.playhead();
    head.style.top = pct(yOf(lens, i, t));
    box.setAttribute('aria-valuetext', lens.length > 1 ? `Part ${i + 1}, ${clock(t)}` : clock(t));
  }

  function showTip(y, to) {
    tip.classList.toggle('hidden', !to);
    if (!to) return;
    tip.style.top = pct(y);
    tip.textContent = lens.length > 1 ? `${to.i + 1} · ${clock(to.t)}` : clock(to.t);
  }

  let dragging = false;
  const seek = (to) => to && o.onSeek(to.i, to.t);
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !lens.length) return;
    e.preventDefault();
    box.setPointerCapture?.(e.pointerId);
    dragging = true;
    const { y, to } = at(e);
    showTip(y, to);
    seek(to);
  });
  box.addEventListener('pointermove', (e) => {
    if (!lens.length) return;
    const { y, to } = at(e);
    showTip(y, to);
    if (dragging) seek(to);
  });
  const end = () => { dragging = false; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('pointerleave', () => { if (!dragging) showTip(0, null); });
  box.addEventListener('keydown', (e) => {
    const d = { ArrowUp: -STEP, ArrowDown: STEP, PageUp: -PAGE, PageDown: PAGE }[e.key];
    if (!d || !lens.length) return;
    e.preventDefault();
    e.stopPropagation();
    const { i, t } = o.playhead();
    const n = t + d;
    if (n < 0 && i > 0) return o.onSeek(i - 1, Math.max(0, lens[i - 1] + n));
    if (n > lens[i] && i + 1 < lens.length) return o.onSeek(i + 1, Math.min(lens[i + 1], n - lens[i]));
    o.onSeek(i, Math.min(lens[i] || 0, Math.max(0, n)));
  });

  return { paintTrack, paintView, paintHead };
}
