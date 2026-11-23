// Timeline: the whole recording under the video, cuts in place. Ruler, the transcript strip (words at their times,
// pauses you can select), one track per part (waveform), each cut a block over strip and track, playhead. Click to seek, drag to select
// a time range, drag a cut's edge to change it, click a pause to select it, zoom.
// Spec: design/timeline.md, design/timeline-strip.md. Geometry: timeline-geometry.js · one cut: cut-view.js · canvas:
// waveform-view.js · strip: strip-view.js, pauses.js · edge drags: edge-drag.js. It keeps no cuts of its own: it reads
// `cuts()` and reports changes.
import { el, clock } from './dom.js';
import { layout, contentWidth, fitPps, xAt, timeAt, anchoredScroll, bitFor, snap, snapTargets, zoomScaled, zoomOf, pinchFactor, wheelFactor, MAX_PPS, GAP } from './timeline-geometry.js';
import { cutView, edgeHandle, secs, MIN_W } from './cut-view.js';
import { drawTimeline, RULER, STRIP, TRACK, NOTES } from './waveform-view.js';
import { layoutNotes, clusterPps } from './note-layout.js';
import { noteLane, fillLane, popIn, createPeek } from './note-view.js';
import { pauses, pauseCut } from './pauses.js';
import { pauseView, stripPainter } from './strip-view.js';
import { startEdgeDrag } from './edge-drag.js';
import { cutsOf } from './cuts.js';
import { toggleSelection, wordSelection } from './selection.js';
import { setBit } from './bit.js';

const SLOT = 120; // the add-slot's width
const DRAG_PT = 4; // a press that moves less is a click
export const HEIGHT = 176; // ruler, strip, track, notes lane (index.html's #timeline is this tall)
const EPS = 1e-6;
const LABEL_FONT = '11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

/**
 * @param {HTMLElement} root  the scrolling box
 * @param {{parts: () => Array<{id:number,name:string,duration:number}>, cuts: () => Array, words: (id:number) => Array,
 *   speech?: (id:number) => (Array<{s:number,e:number}>|undefined),
 *   waveform: (id:number) => ({perSecond:number,peaks:number[]}|undefined), lengths: () => object,
 *   playhead: () => ({i:number,t:number}), current: () => number, max: number,
 *   onSeek: (i:number, t:number) => void, onLive: (cuts:Array|null) => void, onCommit: (cuts:Array, label:string) => void,
 *   onToggle: () => void, onRemove: (id:number) => void, onDragStart: () => void, onZoom?: (z:number) => void,
 *   onSelect?: (sel:object|null) => void, onMenu?: (at:{x:number,y:number}, where:{part:number,t:number,lane:boolean}) => void,
 *   notes?: () => Array, showDone?: () => boolean, onNote?: (id:string, o:{focus:boolean}) => void,
 *   onNoteMenu?: (id:string, at:{x:number,y:number}) => void}} o
 *   onMenu: right-click off a note; the selection is already what was clicked (context-menu.js). `where`: the time
 *   under the pointer, and whether it was on the notes lane.
 *   notes: all the edit's notes (each part's lane shows its own, design/notes.md); onNote: a note clicked or Return.
 */
export function createTimeline(root, o) {
  let z = 0; // zoom: 0 = fit … 1 = MAX_PPS, on a log scale (so each step feels the same)
  let pps = 1;
  let fit = 1; // pps at z = 0
  let boxes = [];
  let frames = [];
  let lanes = [];
  let layers = []; // per part: its cut blocks, over the strip and the track
  let noteLanes = []; // per part: its notes, under the track
  let currentNote = null; // the note with the ring (its card is open)
  let selection = null; // { part, s, e, cut? } in source time, one part
  let grow = null; // ⇧← ⇧→: the fixed end of the selection
  let drag = null; // the pointer gesture in progress
  let nudge = null; // keyboard nudges on one edge: { i, d }; one undo step when focus leaves
  let painting = false;
  let settleTimer = 0; // after a zoom: the full repaint of cuts and pauses
  let pinch = null; // { z0 } while a WebKit pinch gesture is on

  const content = el('div', 'relative h-full');
  const canvas = el('canvas', 'pointer-events-none absolute top-0 z-[1]');
  const sel = el('div', 'pointer-events-none absolute z-[4] hidden border border-accent');
  sel.style.cssText = `top:${STRIP.top}px;height:${TRACK.top + TRACK.h - STRIP.top}px;background:rgb(255 106 61 / 0.2)`;
  const chip = el('button', 'absolute z-[6] hidden -translate-x-1/2 rounded-md border border-hairline bg-surface px-1.5 text-[11px] whitespace-nowrap tabular-nums');
  chip.style.top = `${RULER.top}px`;
  chip.onclick = () => o.onToggle();
  const head = el('div', 'pointer-events-none absolute z-[5] w-px bg-accent');
  head.style.cssText = `left:0;will-change:transform;top:${RULER.top}px;height:${NOTES.top + NOTES.h - RULER.top}px`;
  const tip = el('div', 'absolute -top-px -left-1 h-0 w-0');
  tip.style.cssText += 'border-left:4.5px solid transparent;border-right:4.5px solid transparent;border-top:9px solid var(--color-accent)';
  head.append(tip);
  content.append(canvas, sel, chip, head);
  root.replaceChildren(content);
  const peek = createPeek(content, { bottom: NOTES.top - 4 });
  const ruler = document.createElement('canvas').getContext?.('2d'); // measures note labels
  if (ruler) ruler.font = LABEL_FONT;
  const measureLabel = (t) => ruler?.measureText(t).width ?? t.length * 6;

  // ---------- Layout ----------

  const extra = () => (o.parts().length && o.parts().length < o.max ? SLOT + GAP : 0);

  function measure() {
    const parts = o.parts();
    fit = fitPps(parts, root.clientWidth || 800, extra());
    pps = fit >= MAX_PPS ? fit : fit * (MAX_PPS / fit) ** z;
    setBit(bitFor(pps));
    boxes = layout(parts, pps);
    content.style.width = `${contentWidth(boxes, extra())}px`;
    return parts;
  }

  function render() {
    clearTimeout(settleTimer);
    const parts = measure();
    frames.forEach((f) => f.remove());
    lanes.forEach((l) => l.remove());
    layers.forEach((l) => l.remove());
    noteLanes.forEach((l) => l.remove());
    frames = boxes.map((b, i) => frame(b, i, parts[i]));
    lanes = boxes.map((b, i) => lane(b, i));
    layers = boxes.map((b, i) => cutLayer(b, i));
    noteLanes = boxes.map((b, i) => noteLane(b, i, { items: [], notes: new Map(), top: NOTES.top, h: NOTES.h }));
    // Per part, in Tab order: the part's ✕, its cuts and edges, its pauses, its notes.
    content.prepend(...boxes.flatMap((b, i) => [frames[i], layers[i], lanes[i], noteLanes[i]]));
    if (extra()) { frames.push(addSlot()); content.insertBefore(frames.at(-1), canvas); }
    paintCuts();
    paintPlayhead(false);
  }

  /**
   * Zoom: the same elements, moved and resized in place. Nothing under the pointer is replaced while you pinch: WebKit
   * sends the rest of a gesture (and of a wheel run) to the element it began on, and a removed element passes nothing
   * on. Handles and pause labels (which depend on width) catch up once the zoom settles.
   */
  function relayout() {
    const ids = o.parts().map((p) => p.id);
    if (ids.length !== boxes.length || ids.some((id, i) => boxes[i].id !== id) || frames.length !== ids.length + (extra() ? 1 : 0)) return render();
    measure();
    const cuts = o.cuts();
    const place = (n, s, e, min) => { n.style.left = `${s * pps}px`; n.style.width = `${Math.max(min, (e - s) * pps)}px`; };
    boxes.forEach((box, i) => {
      for (const n of [frames[i], lanes[i], layers[i], noteLanes[i]]) { n.style.left = `${box.x}px`; n.style.width = `${box.w}px`; }
      moveNotes(i);
      for (const n of layers[i].querySelectorAll('[data-cut]')) {
        const c = cuts[+n.dataset.cut];
        if (c) place(n, c.s, c.e, MIN_W);
      }
      const ps = pausesOf(i);
      for (const n of lanes[i].querySelectorAll('[data-pause]')) {
        const p = ps[+n.dataset.pause];
        if (p) place(n, p.s, p.e, 2);
      }
    });
    if (extra()) { const last = boxes.at(-1); frames.at(-1).style.left = `${last.x + last.w + GAP}px`; }
    paintSelection();
    draw();
    paintPlayhead(false);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 250);
  }
  const settle = () => (pinch ? (settleTimer = setTimeout(settle, 250)) : paintCuts());

  function frame(box, i, part) {
    const f = el('div', `group absolute rounded-[10px] bg-raised outline-none ring-1 ${i === o.current() ? 'ring-accent' : 'ring-hairline'}`);
    f.style.cssText = `left:${box.x}px;width:${box.w}px;top:${TRACK.top}px;height:${TRACK.h}px`;
    f.dataset.part = i;
    f.setAttribute('role', 'group');
    f.tabIndex = -1; // focus lands here when the cut you were on is restored
    f.title = part.name;
    // z 6: the part badge and ✕ stay readable over a cut at the part's start
    f.append(el('span', 'pointer-events-none absolute top-1 left-1 z-[6] rounded-md bg-surface px-1.5 text-[11px] font-medium', String(i + 1)));
    const x = el('button', 'absolute top-1 right-1 z-[6] flex h-7 w-7 items-center justify-center rounded-md bg-surface text-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-text', '✕');
    x.setAttribute('aria-label', `Remove part ${i + 1} from project`);
    x.onclick = (e) => { e.stopPropagation(); o.onRemove(part.id); };
    f.append(x);
    return f;
  }

  /** A part's cut layer: its cut blocks and edge handles, from the strip's top to the track's bottom, above the
   *  words (canvas, z 1) and the pause blocks (z 2). Only its children take the pointer. */
  function cutLayer(box, i) {
    const l = el('div', 'pointer-events-none absolute z-[3]');
    l.style.cssText = `left:${box.x}px;width:${box.w}px;top:${STRIP.top}px;height:${TRACK.top + TRACK.h - STRIP.top}px`;
    l.dataset.layer = i;
    return l;
  }

  /** A part's transcript strip lane: holds its pause blocks (the words are on the canvas). */
  function lane(box, i) {
    const l = el('div', 'absolute');
    l.style.cssText = `left:${box.x}px;width:${box.w}px;top:${STRIP.top}px;height:${STRIP.h}px`;
    l.dataset.lane = i;
    l.setAttribute('role', 'group');
    l.setAttribute('aria-label', `Pauses in part ${i + 1}`);
    return l;
  }

  /** A part's pauses: the silences between the audio's speech runs; words (fixes included) when it has none. */
  const pausesFor = (box) => pauses(o.speech?.(box.id) ?? o.words(box.id), o.lengths()[box.id] ?? box.len);
  const pausesOf = (i) => pausesFor(boxes[i]);

  function addSlot() {
    const last = boxes.at(-1);
    const slot = el('button', 'absolute rounded-[10px] border-[1.5px] border-dashed border-hairline text-text-secondary transition-colors duration-[120ms] hover:text-text', `+ Add part ${boxes.length + 1}`);
    slot.style.cssText = `left:${last.x + last.w + GAP}px;width:${SLOT}px;top:${TRACK.top}px;height:${TRACK.h}px`;
    slot.id = 'add-slot';
    slot.dataset.choose = '';
    return slot;
  }

  // ---------- Cuts, selection, playhead ----------

  const same = (part, r) => selection?.part === part && Math.abs(selection.s - r.s) < EPS && Math.abs(selection.e - r.e) < EPS;
  const isSelected = (c) => selection?.cut && same(c.part, c);
  const isPause = (part, p) => selection?.pause && same(part, p);

  /** Repaint the cuts (in place: layout and scroll stay). Call after any change to `cuts()`. */
  function paintCuts() {
    const cuts = o.cuts(), parts = o.parts();
    const active = globalThis.document?.activeElement;
    const hadFocus = !!active && content.contains(active);
    painting = true;
    boxes.forEach((box, i) => {
      const f = frames[i], layer = layers[i];
      const mine = cutsOf(cuts, box.id);
      layer.replaceChildren(...mine.map((c) =>
        cutView(c, { left: c.s * pps, width: (c.e - c.s) * pps, selected: isSelected(c), index: cuts.indexOf(c), row: STRIP.h })));
      // A part's outer edge with no cut there: drag it inward to trim.
      if (!mine.some((c) => c.s <= EPS)) layer.append(edgeHandle('s', 0, 'you', true));
      if (parts[i].duration && !mine.some((c) => c.e >= box.len - EPS)) layer.append(edgeHandle('e', box.len, 'you', true));
      // A pause all inside a cut is under its block: not drawn, not a Tab stop. (Index k stays the pause's own.)
      lanes[i].replaceChildren(...pausesOf(i).flatMap((p, k) => (pauseCut(p, box.id, cuts) ? [] : [pauseView(p, {
        left: p.s * pps, width: (p.e - p.s) * pps, index: k, selected: isPause(box.id, p),
      })])));
      const n = mine.length;
      f.setAttribute('aria-label', `Part ${i + 1}, ${parts[i].name}, ${clock(box.len)}, ${n} cut${n === 1 ? '' : 's'}`);
    });
    paintNotes();
    if (nudge) refocus();
    else if (hadFocus && !content.contains(document.activeElement)) keepFocus();
    painting = false;
    paintSelection();
    draw();
  }

  // ---------- Notes (design/notes.md, "The lane") ----------

  const notesIn = (box) => (o.notes?.() ?? []).filter((n) => n.part === box.id);
  const noteItems = (i) => layoutNotes({ notes: notesIn(boxes[i]), len: boxes[i].len, pps, measure: measureLabel, showDone: !!o.showDone?.() });

  /** Repaint every lane from `notes()`. Focus on a note stays on it (its element is replaced). */
  function paintNotes() {
    const active = globalThis.document?.activeElement;
    const focused = active?.dataset?.note ?? null;
    boxes.forEach((box, i) => {
      const notes = new Map(notesIn(box).map((n) => [n.id, n]));
      fillLane(noteLanes[i], i, { items: noteItems(i), notes, current: currentNote });
    });
    if (focused && !content.contains(document.activeElement)) noteEl(focused)?.focus({ preventScroll: true });
  }

  /** While zooming: the same elements, moved (so a pinch over a note goes on); a repaint when clusters change. */
  function moveNotes(i) {
    const items = noteItems(i), els = noteLanes[i].children;
    const same = items.length === els.length && items.every((m, k) => {
      const n = els[k];
      return m.kind === 'cluster' ? n.dataset.cluster === m.ids.join(' ') : n.dataset.note === m.ids[0];
    });
    if (!same) return paintNotes();
    items.forEach((m, k) => {
      const n = els[k], mark = n.querySelector('[data-mark]');
      n.style.left = `${m.hit.x}px`;
      n.style.width = `${m.hit.w}px`;
      if (mark) { mark.style.left = `${m.x - m.hit.x}px`; mark.style.width = `${m.w}px`; }
      const label = n.querySelector('[data-label]'); // a label that newly fits comes with the settle repaint
      if (label) { label.style.left = `${m.labelX - m.hit.x}px`; label.textContent = m.label; }
    });
  }

  const noteEl = (id) => noteLanes.map((l) => l.querySelector(`[data-note="${id}"]`)).find(Boolean) ?? null;
  const noteById = (id) => (o.notes?.() ?? []).find((n) => n.id === id);

  /** The note's centre in content points (null when its part isn't on the timeline). */
  function noteCx(id) {
    const n = noteById(id);
    const i = n ? boxes.findIndex((b) => b.id === n.part) : -1;
    return i < 0 ? null : { i, x: xAt(boxes, i, (n.s + n.e) / 2), t: (n.s + n.e) / 2 };
  }

  /** A cluster click: zoom in until its notes separate, anchored on it. */
  function openCluster(ids) {
    const notes = ids.map(noteById).filter(Boolean);
    const at = notes.length && noteCx(notes[0].id);
    if (!at || fit >= MAX_PPS) return;
    const nz = zoomOf(clusterPps(notes), fit);
    const mid = (notes[0].s + notes.at(-1).e) / 2;
    zoomTo(Math.max(z + 0.05, nz), { i: at.i, t: mid });
  }

  /** The element you were on went (a cut restored, a pause cut): focus stays in the timeline, on the selected cut
   *  if it's there, else on its part's group, so Tab and ⌫ carry on from the same place. */
  function keepFocus() {
    const i = Math.max(0, boxes.findIndex((b) => b.id === selection?.part));
    const c = selection?.cut ? o.cuts().find((x) => isSelected(x)) : null;
    const target = (c && layers[i]?.querySelector(`[data-cut="${o.cuts().indexOf(c)}"]`)) || frames[i];
    target?.focus({ preventScroll: true });
  }

  function paintSelection() {
    const i = boxes.findIndex((b) => b.id === selection?.part);
    sel.classList.toggle('hidden', i < 0 || !!selection?.cut);
    if (i < 0) return drag?.kind === 'edge' || hideChip();
    const x0 = xAt(boxes, i, selection.s), x1 = xAt(boxes, i, selection.e);
    sel.style.left = `${x0}px`;
    sel.style.width = `${Math.max(1, x1 - x0)}px`;
    const restore = selection.cut || toggleSelection(o.cuts(), selection, o.words(selection.part), o.lengths()).label.startsWith('Restored');
    showChip((x0 + x1) / 2, restore ? 'Restore ⌫' : 'Cut ⌫');
  }

  function showChip(x, text) {
    chip.textContent = text;
    chip.style.left = `${x}px`;
    chip.classList.remove('hidden');
  }
  const hideChip = () => chip.classList.add('hidden');

  function setSelection(s) {
    selection = s;
    paintCuts();
    o.onSelect?.(s); // the transcript highlights the same words
  }

  /** Move the playhead line (to `at`, the smooth play clock's { i, t }, else the player's time). While playing, page
   *  the view when it passes 90 % (so it sits at 10 %). A transform, at sub-pixel x: it glides, and nothing re-lays out. */
  function paintPlayhead(playing, at = o.playhead()) {
    const { i, t } = at;
    const b = boxes[i];
    head.classList.toggle('hidden', !b);
    if (!b) return;
    const x = xAt(boxes, i, Math.min(t, b.len));
    head.style.transform = `translateX(${x.toFixed(2)}px)`;
    const v = x - root.scrollLeft, w = root.clientWidth;
    if (playing && (v > 0.9 * w || v < 0)) root.scrollLeft = x - 0.1 * w;
  }

  /** Bring a moment into view (centred) if it's off screen: a seek from the transcript, an undo. */
  function reveal(i, t) {
    if (!boxes[i]) return;
    const x = xAt(boxes, i, t), v = x - root.scrollLeft;
    if (v < 0 || v > root.clientWidth) root.scrollLeft = x - root.clientWidth / 2;
  }

  let frameReq = 0;
  const strip = stripPainter(); // keeps the word level shown and the fades
  function draw() {
    if (frameReq) return;
    const paint = () => {
      frameReq = 0;
      const width = root.clientWidth || 800;
      canvas.style.left = `${root.scrollLeft}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      const fading = drawTimeline(canvas, {
        boxes, scroll: root.scrollLeft, width, height: HEIGHT, pps, waveforms: o.waveform, words: o.words, cuts: o.cuts(),
        pauses: pausesFor, strip,
      });
      if (fading && globalThis.requestAnimationFrame) draw(); // the next frame of a word fade
    };
    globalThis.requestAnimationFrame ? (frameReq = requestAnimationFrame(paint)) : paint();
  }

  // ---------- Pointer ----------

  const local = (e) => {
    const r = content.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const playheadIn = (i) => (o.playhead().i === i ? o.playhead().t : null);

  /** An edge drag (pointer) or nudge (keys) on the edge element `edge`. */
  function edgeGesture(edge) {
    const i = +edge.closest('[data-layer]').dataset.layer;
    const cutEl = edge.closest('[data-cut]');
    const list = o.cuts(), box = boxes[i];
    const d = startEdgeDrag({
      cuts: list, cut: cutEl ? list[+cutEl.dataset.cut] : undefined, part: box.id, side: edge.dataset.edge,
      lengths: { ...o.lengths(), [box.id]: o.lengths()[box.id] ?? box.len },
      targets: snapTargets(o.words(box.id), box.len, playheadIn(i)), pps,
    });
    return { i, d };
  }

  content.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || !boxes.length) return;
    commitNudge();
    const { x, y } = local(e);
    const noteHit = e.target.closest('[data-note], [data-cluster]');
    if (noteHit) { // a note opens on release; nothing else (no seek here: going to the note does it)
      drag = { kind: 'note', id: noteHit.dataset.note, cluster: noteHit.dataset.cluster };
      peek.hide();
      e.preventDefault();
      return;
    }
    const edge = e.target.closest('[data-edge]');
    const pauseEl = e.target.closest('[data-pause]');
    const cutEl = e.target.closest('[data-cut]');
    if (pauseEl) {
      const i = +pauseEl.closest('[data-lane]').dataset.lane;
      const p = pausesOf(i)[+pauseEl.dataset.pause];
      drag = { kind: 'press', x0: x, i, t0: p.s, pause: { part: boxes[i].id, s: p.s, e: p.e, pause: true } };
    } else if (edge) {
      drag = { kind: 'edge', ...edgeGesture(edge) };
      o.onDragStart();
    } else if (cutEl) { // anywhere in the block's height, strip row or track row
      const i = +cutEl.closest('[data-layer]').dataset.layer;
      const c = o.cuts()[+cutEl.dataset.cut];
      // a click seeks to the cut's start; a drag from here selects time from where you pressed
      drag = { kind: 'press', x0: x, i, t0: timeAt(boxes, x, i).t, at: c?.s, cut: c ?? null };
    } else if (y < TRACK.top) {
      drag = { kind: 'scrub' };
      const { i, t } = timeAt(boxes, x);
      o.onSeek(i, t);
    } else {
      const { i, t } = timeAt(boxes, x);
      drag = { kind: 'press', x0: x, i, t0: t, cut: null };
    }
    content.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  content.addEventListener('pointermove', (e) => {
    if (!drag || drag.kind === 'note') return;
    const { x } = local(e);
    if (drag.kind === 'edge') {
      const { i, d } = drag;
      o.onLive(d.move(timeAt(boxes, x, i).t, e.altKey));
      o.onSeek(i, d.t); // the player shows the frame at the edge
      const c = d.cut;
      showChip(xAt(boxes, i, d.t), c ? secs(c) : '0.0 s');
    } else if (drag.kind === 'scrub') {
      const { i, t } = timeAt(boxes, x);
      o.onSeek(i, t);
    } else if (drag.sel || Math.abs(x - drag.x0) >= DRAG_PT) {
      drag.sel = true;
      const { i, t0 } = drag, box = boxes[i];
      const targets = snapTargets(o.words(box.id), box.len, playheadIn(i));
      const a = snap(t0, targets, pps), b = snap(timeAt(boxes, x, i).t, targets, pps);
      setSelection({ part: box.id, s: Math.min(a, b), e: Math.max(a, b) });
    }
  });

  const release = () => {
    const g = drag;
    drag = null;
    if (!g) return;
    if (g.kind === 'note') {
      if (g.cluster) openCluster(g.cluster.split(' '));
      else o.onNote?.(g.id, { focus: true });
    } else if (g.kind === 'edge') {
      hideChip();
      const r = g.d.end();
      r.changed ? o.onCommit(r.cuts, r.label) : o.onLive(null);
      o.onSeek(g.i, Math.max(0, r.join - 1)); // wait a second before the join, so Space plays it
    } else if (g.kind === 'press' && !g.sel) {
      o.onSeek(g.i, g.at ?? g.t0);
      setSelection(g.pause ?? (g.cut ? { part: g.cut.part, s: g.cut.s, e: g.cut.e, cut: true } : null));
    } else if (g.kind === 'press' && selection && selection.e - selection.s < EPS) setSelection(null);
  };
  content.addEventListener('pointerup', release);
  content.addEventListener('pointercancel', release);

  // Right-click: what's under the pointer, selected first unless it's inside the selection (Mac habit), then the menu.
  content.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (drag || !boxes.length || e.target.closest('button')) return;
    const { x, y } = local(e);
    const noteHit = e.target.closest('[data-note]');
    if (noteHit) return o.onNoteMenu?.(noteHit.dataset.note, { x: e.clientX, y: e.clientY });
    const pauseEl = e.target.closest('[data-pause]');
    const cutEl = e.target.closest('[data-cut]');
    const { i, t } = timeAt(boxes, x);
    const box = boxes[i];
    let next = null;
    if (pauseEl) {
      const lane = +pauseEl.closest('[data-lane]').dataset.lane;
      const p = pausesOf(lane)[+pauseEl.dataset.pause];
      if (p) next = { part: boxes[lane].id, s: p.s, e: p.e, pause: true };
    } else if (cutEl) {
      const c = o.cuts()[+cutEl.dataset.cut];
      if (c) next = { part: c.part, s: c.s, e: c.e, cut: true };
    }
    const inside = selection && !selection.cut && selection.part === box.id && selection.s - EPS <= t && t <= selection.e + EPS;
    if (!next && !inside) {
      const k = o.words(box.id).findIndex((w) => w.s <= t && t < w.e);
      if (k >= 0) next = wordSelection(box.id, o.words(box.id), k, k);
    }
    const lane = y >= NOTES.top;
    if (lane) next = null; // the lane's menu is about the time there, not a word
    if (next && !(inside && !next.cut)) setSelection(next);
    else if (!next && !inside && selection) setSelection(null);
    // Always a menu: with nothing selected it still has Add Note Here.
    o.onMenu?.({ x: e.clientX, y: e.clientY }, { part: box.id, t, lane });
  });

  // ---------- Notes: Return opens, hover / focus peeks ----------

  content.addEventListener('keydown', (e) => {
    const n = e.target.closest?.('[data-note], [data-cluster]');
    if (!n || e.key !== 'Enter' || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // not the app's Return (which types on a selection)
    if (n.dataset.cluster) openCluster(n.dataset.cluster.split(' '));
    else o.onNote?.(n.dataset.note, { focus: true });
  });
  const peekAt = (n) => {
    const note = n && noteById(n.dataset.note);
    const at = note && noteCx(note.id);
    at ? peek.show(note, at.x) : peek.hide();
  };
  content.addEventListener('pointerover', (e) => { if (!drag) peekAt(e.target.closest?.('[data-note]')); });
  content.addEventListener('pointerleave', () => peek.hide());
  content.addEventListener('focusout', (e) => e.target.dataset?.note != null && peek.hide());

  // ---------- Keyboard: edges are sliders, cuts are buttons ----------

  content.addEventListener('keydown', (e) => {
    const edge = e.target.closest?.('[data-edge]');
    if (!edge || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation(); // not the playhead's ← →
    if (!nudge) { nudge = edgeGesture(edge); o.onDragStart(); }
    o.onLive(nudge.d.nudge((e.key === 'ArrowLeft' ? -1 : 1) * bitFor(pps)));
    o.onSeek(nudge.i, nudge.d.t);
  });

  /** After a repaint, focus goes back to the edge being nudged (its element was replaced). */
  function refocus() {
    const { i, d } = nudge;
    const box = layers[i];
    const c = d.cut, idx = c ? o.cuts().indexOf(c) : -1;
    const target = idx >= 0
      ? box?.querySelector(`[data-cut="${idx}"] [data-edge="${d.side}"]`)
      : box?.querySelector(`:scope > [data-edge]`);
    if (target) target.focus();
    else queueMicrotask(commitNudge); // closed, or too small for handles now
  }

  function commitNudge() {
    if (!nudge) return;
    const r = nudge.d.end();
    nudge = null;
    r.changed ? o.onCommit(r.cuts, r.label) : o.onLive(null);
  }

  content.addEventListener('focusout', (e) => {
    if (!painting && nudge && e.target.closest?.('[data-edge]')) commitNudge();
  });
  content.addEventListener('focusin', (e) => {
    if (painting) return;
    if (e.target.dataset?.note != null) return peekAt(e.target);
    if (e.target.dataset?.pause != null) { // Tab onto a pause selects it: ⌫ cuts it
      const i = +e.target.closest('[data-lane]').dataset.lane, p = pausesOf(i)[+e.target.dataset.pause];
      if (p && !isPause(boxes[i].id, p)) setSelection({ part: boxes[i].id, s: p.s, e: p.e, pause: true });
      return;
    }
    if (e.target.dataset?.cut == null) return;
    const c = o.cuts()[+e.target.dataset.cut]; // Tab onto a cut selects it: ⌫ restores
    if (c && !isSelected(c)) setSelection({ part: c.part, s: c.s, e: c.e, cut: true });
  });

  // ---------- Zoom and scroll ----------

  /** Zoom to level `nz` (0 = fit … 1), keeping `anchor` ({ i, t }, default the playhead) where it is on screen. */
  function zoomTo(nz, anchor = o.playhead(), screenX) {
    nz = Math.min(1, Math.max(0, nz));
    if (!boxes[anchor.i]) { z = nz; return render(); }
    const sx = screenX ?? xAt(boxes, anchor.i, anchor.t) - root.scrollLeft;
    z = nz;
    relayout();
    root.scrollLeft = anchoredScroll(sx, xAt(boxes, anchor.i, Math.min(anchor.t, boxes[anchor.i].len)));
    draw();
    o.onZoom?.(z);
  }

  // Pinch and ⌘-scroll zoom in proportion to the gesture, on the pointer. Many events arrive per frame: the last
  // level wins and the view re-lays out once per frame.
  let pending = null; // { z, anchor, sx }
  let zoomReq = 0;
  function zoomSoon(nz, e) {
    if (!boxes.length) return;
    const { x } = local(e);
    pending = { z: nz, anchor: pending?.anchor ?? timeAt(boxes, x), sx: pending?.sx ?? x - root.scrollLeft };
    if (zoomReq) return;
    const go = () => {
      zoomReq = 0;
      const p = pending;
      pending = null;
      if (p && Math.abs(p.z - z) > 1e-4) zoomTo(p.z, p.anchor, p.sx);
    };
    globalThis.requestAnimationFrame ? (zoomReq = requestAnimationFrame(go)) : go();
  }
  const zoomGoal = () => pending?.z ?? z;

  // WebKit (the app's window) reports a trackpad pinch as gesture events with a cumulative `scale`.
  let pinchEnd = 0;
  root.addEventListener('gesturestart', (e) => { e.preventDefault(); pinch = { z0: zoomGoal() }; });
  root.addEventListener('gesturechange', (e) => {
    if (!pinch) return;
    e.preventDefault();
    zoomSoon(zoomScaled(pinch.z0, pinchFactor(e.scale), fit), e);
  });
  root.addEventListener('gestureend', (e) => { e.preventDefault(); pinch = null; pinchEnd = e.timeStamp || performance.now(); });

  root.addEventListener('scroll', draw);
  root.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { // Chromium's pinch (⌃-wheel), or ⌘-scroll: zoom on the pointer
      e.preventDefault();
      if (pinch || (e.timeStamp || performance.now()) - pinchEnd < 150) return; // the gesture events have it
      zoomSoon(zoomScaled(zoomGoal(), wheelFactor(e.deltaY, e.deltaMode), fit), e);
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { // a mouse wheel scrolls sideways
      e.preventDefault();
      root.scrollLeft += e.deltaY;
    }
  }, { passive: false });
  globalThis.ResizeObserver && new ResizeObserver(() => render()).observe(root);

  return {
    render,
    paintCuts,
    paintNotes,
    paintPlayhead,
    /** The current note (ring), or null. */
    setNote(id) { if (id !== currentNote) { currentNote = id; paintNotes(); } },
    get currentNote() { return currentNote; },
    focusNote: (id) => noteEl(id)?.focus({ preventScroll: true }),
    /** The note's centre in client x (for placing its card), or null when not on screen. */
    noteX(id) {
      const at = noteCx(id);
      return at ? content.getBoundingClientRect().left + at.x : null;
    },
    /** A marker that just came in pops (after the repaint that made it). */
    pop: (id) => popIn(noteEl(id)),
    reveal,
    get zoom() { return z; },
    zoomTo,
    zoomBy: (d) => zoomTo(z + d),
    get selection() { return selection; },
    /** Set the one selection (the transcript's words, or null). */
    select: (s) => { grow = null; setSelection(s); },
    clearSelection: () => { grow = null; if (selection) setSelection(null); },
    /** ⇧← / ⇧→: grow a time selection from the playhead by one bit. */
    grow(dir) {
      const { i, t } = o.playhead(), box = boxes[i];
      if (!box) return;
      if (!grow || selection?.part !== box.id || selection.cut) grow = { fixed: t, end: t };
      grow.end = Math.min(box.len, Math.max(0, grow.end + dir * bitFor(pps)));
      const s = Math.min(grow.fixed, grow.end), e = Math.max(grow.fixed, grow.end);
      const keep = grow;
      setSelection(e - s > EPS ? { part: box.id, s, e } : null);
      grow = keep;
    },
  };
}
