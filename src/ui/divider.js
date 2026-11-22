// The divider between the video and the transcript: drag it to widen the transcript (the video shrinks).
// The width is remembered. Spec: design/transcript-panel.md § Width. clampWidth tested in test/panel.test.mjs.

export const DEFAULT_WIDTH = 320;
export const MIN_WIDTH = 260;
export const MAX_WIDTH = 720;
export const VIDEO_MIN = 360; // the video always keeps this much
const KEY = 'transcriptWidth';
const STEP = 16;

/** Pure: a width the window can hold. Garbage → the default. */
export function clampWidth(w, windowW) {
  if (!Number.isFinite(w)) w = DEFAULT_WIDTH;
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, windowW - VIDEO_MIN));
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, w)));
}

/**
 * @param {HTMLElement} handle  the separator (on the panel's left edge)
 * @param {HTMLElement} panel  the aside whose width it sets
 * @param {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}} [store]
 */
export function mountDivider(handle, panel, store = globalThis.localStorage) {
  const win = () => globalThis.innerWidth ?? 1440;
  let want = parseFloat(store?.getItem(KEY) ?? ''); // what you chose; a small window only clamps what shows
  let width = clampWidth(want, win());

  function set(w, save = false) {
    width = clampWidth(w, win());
    if (save) want = width;
    panel.style.width = `${width}px`;
    handle.setAttribute('aria-valuenow', String(width));
    if (save) store?.setItem(KEY, String(width));
  }

  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Transcript width');
  handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
  handle.setAttribute('aria-valuemax', String(MAX_WIDTH));
  handle.tabIndex = 0;
  set(width);

  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture?.(e.pointerId);
    drag = { x: e.clientX, w: width };
    handle.dataset.dragging = '';
  });
  handle.addEventListener('pointermove', (e) => { if (drag) set(drag.w + (drag.x - e.clientX)); });
  const end = () => {
    if (!drag) return;
    drag = null;
    delete handle.dataset.dragging;
    set(width, true);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => set(DEFAULT_WIDTH, true));
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation(); // not the playhead's ← →
    set(width + (e.key === 'ArrowLeft' ? STEP : -STEP), true);
  });
  globalThis.addEventListener?.('resize', () => set(want));

  return { get width() { return width; }, set };
}
