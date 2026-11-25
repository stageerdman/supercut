// Export (design/export.md): the toolbar button and its popover. Ready (format, facts, Save to, Export) → Exporting
// (bar, Cancel) → Done (Show in Finder). The work is Rust's: export_target, export_video, export_cancel, export_reveal
// and the export://progress / export://done events (src-tauri/src/main.rs). The pure view functions come first;
// createExport paints them. Tested in test/export.test.mjs.
import { el, clock, eta } from './dom.js';
import { keptSpans } from './playback.js';
import { FILLED, PLAIN } from './magic-button.js';

export const CANCELLED = 'Export cancelled.';
export const NOTHING = 'Everything is cut. Bring something back to export.';
const DONE_MS = 6000; // the button says ✓ Exported this long
const ETA_AFTER = 3000; // ms of progress before a time left is guessed
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const FORMATS = {
  mp4: { label: 'MP4', codec: 'H.264', ext: '.mp4', bpp: 0.25, audio: 320e3 },
  prores: { label: 'ProRes', codec: 'ProRes 422 HQ · .mov', ext: '.mov', bpp: 3.5, audio: 2.3e6 },
};

/** The spans Rust renders: what playback plays, to the millisecond (as the preview asks). */
export const exportSpans = (parts, cuts) =>
  keptSpans(parts, cuts).map(({ part, s, e }) => ({ part, s: ms(s), e: ms(e) }));
const ms = (x) => Math.round(x * 1000) / 1000;

export const lengthOf = (spans) => spans.reduce((t, { s, e }) => t + (e - s), 0);

/** Bytes the file will be, roughly: picture bits per pixel per frame plus the sound. */
export function estimate(format, { width, height, fps }, seconds) {
  const f = FORMATS[format];
  return Math.round(((f.bpp * width * height * fps + f.audio) * seconds) / 8);
}

/** 2.1e9 → "2.1 GB", 8e8 → "800 MB" (decimal, as Finder counts). */
export function sizeText(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const fpsText = (fps) => (Math.abs(fps - Math.round(fps)) < 0.01 ? String(Math.round(fps)) : fps.toFixed(2));

/** "H.264 · 3840 × 2160 · 30 fps · 14:52". */
export const factsText = (format, t, seconds) =>
  `${FORMATS[format].codec} · ${t.width} × ${t.height} · ${fpsText(t.fps)} fps · ${clock(seconds)}`;

/** The size line: the estimate, or why Export can't run (information, not an error). */
export function spaceView(format, t, seconds) {
  const need = estimate(format, t, seconds);
  const short = t.free > 0 && need > t.free;
  return {
    short,
    text: short
      ? `Not enough space in ${t.folderName}: needs about ${sizeText(need)}, ${sizeText(t.free)} free`
      : `about ${sizeText(need)}`,
  };
}

/** The line under the bar. `ms`: since the first frame came back. */
export function progressText(done, total, ms) {
  if (!total || !done) return 'Starting…';
  if (done >= total) return '100 % · finishing';
  const pct = Math.floor((done / total) * 100);
  const left = ms >= ETA_AFTER ? eta(((total - done) / done) * (ms / 1000)) : '';
  return left ? `${pct} % · ${left} left` : `${pct} %`;
}

export const percent = (done, total) => (total ? Math.min(100, Math.floor((done / total) * 100)) : 0);

/** The toolbar button for a state: its label and look. */
export function buttonView(state, { primary = false, nothing = false } = {}) {
  if (state.kind === 'exporting') return { label: `Exporting ${percent(state.done, state.total)} %`, bar: true, look: 'plain' };
  if (state.kind === 'done' && state.fresh) return { label: 'Exported', check: true, look: 'plain' };
  return { label: 'Export', glyph: true, look: primary && !nothing ? 'filled' : 'plain', disabled: nothing };
}

/** Which popover view shows: exporting while it runs; done until seen; else ready. */
export const popoverView = (state) => (state.kind === 'exporting' ? 'exporting' : state.kind === 'done' ? 'done' : 'ready');

/** "/a/b/my video – cut.mp4" → "my video – cut.mp4". */
export const baseName = (p) => String(p).split('/').pop();

const joinPath = (dir, name) => `${String(dir).replace(/\/+$/, '')}/${name}`;

/** square.and.arrow.up, 15 pt. */
function shareGlyph() {
  const ns = 'http://www.w3.org/2000/svg';
  if (!document.createElementNS) return el('span', '', '');
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6');
  svg.append(p);
  return svg;
}

function folderGlyph() {
  const ns = 'http://www.w3.org/2000/svg';
  if (!document.createElementNS) return el('span', '', '');
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'shrink-0 text-text-secondary' })) svg.setAttribute(k, v);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');
  svg.append(p);
  return svg;
}

/**
 * @param {{button: HTMLElement, popup: HTMLElement}} els  the toolbar button and the (empty) popover section
 * @param {{ invoke: Function, listen: Function, chooseFolder: (from:string)=>Promise<string|null>,
 *           spans: ()=>Array, store?: Storage, showBanner: (text:string, action?:object)=>void,
 *           now?: ()=>number }} o
 */
export function createExport({ button, popup }, o) {
  const store = o.store ?? globalThis.localStorage;
  const now = o.now ?? (() => Date.now());
  let state = { kind: 'idle' };
  let target = null; // export_target's answer for the format and folder now
  let asking = 0; // the newest export_target call: older answers are dropped
  let look = { primary: false, nothing: false, hidden: true };
  let doneTimer = 0;
  let spoken = -1; // the last 10 % told to a screen reader

  const format = () => (store?.getItem('export.format') === 'prores' ? 'prores' : 'mp4');
  const folder = () => store?.getItem('export.folder') || null;
  const isOpen = () => !popup.classList.contains('hidden');

  // ---------- The button ----------

  const label = el('span', 'tabular-nums');
  const live = el('span', 'sr-only');
  live.setAttribute('aria-live', 'polite');
  const track = el('span', 'h-1 w-12 shrink-0 overflow-hidden rounded-full bg-raised');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Export progress');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = el('span', 'block h-full rounded-full bg-accent');
  track.append(fill);

  function paintButton() {
    button.classList.toggle('hidden', look.hidden);
    if (look.hidden) return;
    const v = buttonView(state, look);
    const lit = isOpen() && v.look === 'plain' ? ' bg-raised' : '';
    button.className = `mr-2 flex shrink-0 items-center gap-2 ${FOCUS} ${v.look === 'filled' ? FILLED : PLAIN}${lit} disabled:opacity-40 disabled:hover:bg-transparent`;
    button.disabled = !!v.disabled && state.kind === 'idle';
    button.title = v.disabled ? NOTHING : v.bar ? 'Show the export' : 'Export the video (⌘E)';
    const kids = [];
    if (v.glyph) kids.push(shareGlyph());
    if (v.check) kids.push(el('span', 'text-ok', '✓'));
    label.textContent = v.label;
    label.classList.toggle('min-w-[104px]', !!v.bar); // "Exporting 100 %": the toolbar never shifts
    kids.push(label);
    if (v.bar) {
      const pct = percent(state.done, state.total);
      fill.style.width = `${pct}%`;
      track.setAttribute('aria-valuenow', String(pct));
      kids.push(track);
      const tens = Math.floor(pct / 10);
      if (tens !== spoken) { spoken = tens; live.textContent = v.label; }
    } else if (spoken !== -1 || v.check) {
      spoken = -1;
      live.textContent = v.check ? 'Exported' : '';
    }
    kids.push(live);
    button.replaceChildren(...kids);
    button.setAttribute('aria-label', v.label);
    button.setAttribute('aria-expanded', String(isOpen()));
  }

  // ---------- The popover ----------

  const rowLabel = (t) => el('span', 'w-[72px] shrink-0 text-text-secondary', t);
  const caption = (t = '') => el('p', 'text-[12px] leading-[16px] tabular-nums text-text-secondary', t);
  const action = (text, filled) => {
    const b = el('button', `${FOCUS} ${filled ? FILLED : PLAIN}`, text);
    b.type = 'button';
    return b;
  };
  const footer = (...buttons) => {
    const f = el('div', 'mt-3 flex justify-end border-t border-hairline pt-3');
    f.append(...buttons);
    return f;
  };

  function readyView() {
    const f = format();
    const spans = o.spans();
    const seconds = lengthOf(spans);
    const box = el('div', 'space-y-4');

    // Format: MP4 | ProRes, one Tab stop, ← → switch.
    const fRow = el('div', 'flex items-start');
    const group = el('div', 'flex h-7 rounded-md border border-hairline p-0.5');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Format');
    group.setAttribute('aria-describedby', 'export-facts');
    const radios = Object.entries(FORMATS).map(([key, { label: t }]) => {
      const on = key === f;
      const r = el('button', `${FOCUS} rounded-[5px] px-3 text-[13px] ${on ? 'bg-raised font-semibold text-text' : 'text-text-secondary hover:text-text'}`, t);
      r.type = 'button';
      r.setAttribute('role', 'radio');
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
      r.dataset.format = key;
      r.dataset.key = key;
      r.onclick = () => choose(key);
      return r;
    });
    group.append(...radios);
    group.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const keys = Object.keys(FORMATS);
      const next = keys[(keys.indexOf(f) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
      choose(next, true);
    });
    const fVal = el('div', 'min-w-0 flex-1 space-y-1');
    const facts = caption(target ? factsText(f, target, seconds) : `${FORMATS[f].codec} · ${clock(seconds)}`);
    facts.id = 'export-facts';
    const space = target ? spaceView(f, target, seconds) : { short: false, text: '…' };
    const size = caption(space.text);
    if (space.short) size.className = 'text-[12px] leading-[16px] tabular-nums text-text';
    fVal.append(group, facts, size);
    fRow.append(rowLabel('Format'), fVal);

    // Save to: the folder's name, Change… opens the picker.
    const sRow = el('div', 'flex items-center');
    const where = el('span', 'flex min-w-0 flex-1 items-center gap-1.5');
    where.append(folderGlyph(), el('span', 'truncate text-text', target?.folderName ?? '…'));
    where.title = target ? String(target.folder) : '';
    const change = el('button', `${FOCUS} -mr-2 h-7 shrink-0 rounded-md px-2 text-text hover:bg-raised`, 'Change…');
    change.type = 'button';
    change.dataset.key = 'change';
    change.onclick = changeFolder;
    sRow.append(rowLabel('Save to'), where, change);

    const go = action('Export', true);
    go.dataset.primary = '';
    go.disabled = !target || space.short || !spans.length;
    go.classList.add('disabled:opacity-40');
    go.onclick = () => start();
    box.append(fRow, sRow);
    return [box, footer(go)];
  }

  function exportingView() {
    const name = state.name ? `Exporting ${state.name}` : 'Exporting';
    const title = el('p', 'truncate font-semibold', name);
    title.title = state.name ?? '';
    const bar = el('div', 'mt-2 h-1 w-full overflow-hidden rounded-full bg-raised');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Export progress');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(percent(state.done, state.total)));
    const barFill = el('div', 'h-full rounded-full bg-accent transition-[width]');
    barFill.style.width = `${percent(state.done, state.total)}%`;
    bar.append(barFill);
    const line = caption(progressText(state.done, state.total, state.first ? now() - state.first : 0));
    line.classList.add('mt-2');
    const cancel = action('Cancel', false);
    cancel.dataset.key = 'cancel';
    cancel.onclick =() => o.invoke('export_cancel').catch(() => {});
    return [title, bar, line, footer(cancel)];
  }

  function doneView() {
    const head = el('p', 'flex items-center gap-1.5 font-semibold');
    head.append(el('span', 'text-ok', '✓'), el('span', '', 'Exported'));
    const line = caption(`${baseName(state.file)}${state.seconds ? ` · ${clock(state.seconds)}` : ''}`);
    line.classList.add('mt-1', 'truncate');
    line.title = String(state.file);
    const show = action('Show in Finder', true);
    show.dataset.primary = '';
    show.onclick = () => {
      o.invoke('export_reveal', { path: state.file }).catch((e) => o.showBanner(String(e)));
      close({ refocus: true });
    };
    return [head, line, footer(show)];
  }

  let shown = null; // the view painted now
  /** Repaint the open popover. Focus: a new view's primary (none while exporting: a second Return never cancels);
   *  the same view keeps focus on the same control. */
  function paintPopup({ focus = false } = {}) {
    if (!isOpen()) return;
    const v = popoverView(state);
    const had = popup.contains(document.activeElement) ? document.activeElement : null;
    popup.replaceChildren(...(v === 'ready' ? readyView() : v === 'exporting' ? exportingView() : doneView()));
    const fresh = v !== shown;
    shown = v;
    const key = had?.dataset?.key;
    const same = key && !fresh ? popup.querySelector(`[data-key="${key}"]`) : null;
    if (same && !same.disabled) same.focus();
    else if (focus || fresh || had) (popup.querySelector('[data-primary]') ?? popup).focus?.();
  }

  function place() {
    const r = button.getBoundingClientRect?.();
    const w = globalThis.innerWidth;
    if (r && w) popup.style.right = `${Math.max(16, w - (r.left + r.width))}px`;
  }

  function open() {
    if (look.hidden || (button.disabled && state.kind === 'idle')) return;
    if (!isOpen()) {
      place();
      popup.classList.remove('hidden');
      shown = null;
    }
    if (popoverView(state) === 'ready') refresh();
    paintPopup({ focus: true });
    paintButton();
  }

  function close({ refocus = false } = {}) {
    if (!isOpen()) return;
    popup.classList.add('hidden');
    shown = null;
    if (state.kind === 'done') seen();
    paintButton();
    if (refocus) button.focus();
  }

  /** The done result has been seen (or its 6 s are up): the next open is Ready. */
  function seen() {
    clearTimeout(doneTimer);
    state = { kind: 'idle' };
  }

  /** Ask Rust where the file goes and what it'll be called, for the format and folder now. */
  function refresh() {
    const n = ++asking;
    return o.invoke('export_target', { folder: folder(), format: format() }).then(
      (t) => { if (n === asking) { target = t; paintPopup(); } return t; },
      (e) => { if (n === asking) { target = null; close(); o.showBanner(String(e)); } return null; },
    );
  }

  function choose(key, keepFocus) {
    if (key === format()) return;
    store?.setItem('export.format', key);
    paintPopup({ focus: false });
    if (keepFocus) popup.querySelector(`[data-format="${key}"]`)?.focus?.();
    refresh();
  }

  async function changeFolder() {
    const picked = await o.chooseFolder(target?.folder ?? folder() ?? undefined);
    if (!picked) return;
    store?.setItem('export.folder', String(picked));
    target = null;
    open();
  }

  // ---------- Exporting ----------

  async function start() {
    if (state.kind === 'exporting') return;
    const spans = o.spans();
    if (!spans.length) return;
    const f = format();
    const t = target ?? (await refresh());
    if (!t) return;
    target = null; // the next export gets the next free name
    const out = joinPath(t.folder, t.name);
    state = { kind: 'exporting', name: t.name, out, done: 0, total: 0, first: 0, mine: true };
    paint();
    let made;
    try {
      made = await o.invoke('export_video', { spans, out, format: f });
    } catch (e) {
      failed(String(e));
      return;
    }
    finished(made.file ?? out, made.seconds);
  }

  function finished(file, seconds) {
    clearTimeout(doneTimer);
    state = { kind: 'done', file, seconds, fresh: true };
    doneTimer = setTimeout(() => {
      if (state.kind !== 'done') return;
      if (isOpen()) state = { ...state, fresh: false }; // still on screen: it goes when the popover closes
      else seen();
      paintButton();
    }, DONE_MS);
    paint();
  }

  function failed(why) {
    state = { kind: 'idle' };
    paint();
    if (isOpen()) refresh(); // back to Ready
    if (why !== CANCELLED) o.showBanner(why, { label: 'Try again', run: () => { target = null; start(); } });
  }

  function paint() {
    paintButton();
    paintPopup();
  }

  // Progress (and an export started before this page loaded: rejoin it, the update pill's pattern).
  o.listen('export://progress', ({ payload }) => {
    const { done = 0, total = 0 } = payload ?? {};
    if (state.kind !== 'exporting') state = { kind: 'exporting', name: null, done: 0, total: 0, first: 0, mine: false };
    if (done > 0 && !state.first) state.first = now();
    state.done = done;
    state.total = total;
    paint();
  });
  o.listen('export://done', ({ payload }) => {
    if (state.kind !== 'exporting' || state.mine) return; // our own promise tells us, with more
    if (payload) finished(payload, 0);
    else { state = { kind: 'idle' }; paint(); }
  });

  // ---------- Keys and clicks ----------

  button.onclick = () => (isOpen() ? close({ refocus: true }) : open());
  popup.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close({ refocus: true }); }
    else if (e.key === 'Tab') trap(e);
    e.stopPropagation(); // Return, Space and letters are the popover's, not the editor's
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !popup.contains(e.target)) { e.preventDefault(); close({ refocus: true }); }
  });
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !popup.contains(e.target) && !button.contains(e.target)) close();
  });

  function trap(e) {
    const stops = [...popup.querySelectorAll('button')].filter((b) => !b.disabled && b.tabIndex !== -1);
    if (!stops.length) return;
    const i = stops.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i === stops.length - 1 ? 0 : i + 1);
    e.preventDefault();
    stops[next].focus();
  }

  return {
    /** ⌘E: open the popover (Ready, or the running export, or its result). */
    open,
    close,
    isOpen,
    /** The toolbar repaints: `primary` = everything reviewed; `hidden` = no video; `nothing` = all of it is cut. */
    paint(next) {
      look = { ...look, ...next };
      if (look.hidden) close();
      paintButton();
      if (isOpen() && popoverView(state) === 'ready') paintPopup();
    },
    get state() { return state; },
  };
}
