// TranscriptPanel: the words you said, next to the video. A view of the edit, like the timeline: it keeps no cuts and
// no selection of its own, it reads `cuts()` and `selection()` and reports what you do.
//   click a word → select it and move the playhead there · drag / ⇧-click → more words (one part only)
//   ⌫ (in main.js) → cut or restore them · type, double-click or Return → the fix field (fix-field.js)
// Cut words stay, struck through: grey yours, coral Magic's. The lit word follows the playhead (follow.js).
// Spec: design/transcript-editing.md. Selection rules: selection.js.
import { el, clock } from './dom.js';
import { cutAt, cutsOf, isCut } from './cuts.js';
import { wordsIn, wordSelection } from './selection.js';
import { openFixField, fixStep } from './fix-field.js';
import { createFollow, followTarget } from './follow.js';

export { isCut };

/** Pure: a word's hover text. Magic's cuts say why. Tested in test/ui.test.mjs. */
export function cutTitle(cut, s) {
  if (!cut) return clock(s);
  return `${cut.by === 'magic' ? `Magic Cut: ${cut.reason}` : `Cut · ${clock(s)}`} · Backspace brings it back`;
}

/** Pure: a word's spoken name, with its state. "gonna, cut by Magic". */
export const wordLabel = (w, cut) => (!cut ? w : cut.by === 'magic' ? `${w}, cut by Magic` : `${w}, cut`);

/** Pure: a word's classes. A cut keeps its strike when lit; the strike's colour says who cut it. */
export function wordClass({ cut, lit, selected }) {
  return [
    'cursor-pointer rounded',
    selected ? 'bg-accent/20' : 'hover:bg-raised',
    lit ? 'text-accent' : cut && 'text-text-secondary',
    cut && `line-through decoration-2 ${cut.by === 'magic' ? 'decoration-accent' : 'decoration-text-secondary'}`,
  ].filter(Boolean).join(' ');
}

/**
 * Pure: what a key does in the panel (focus on the panel, not in the fix field). null → not ours (Space, ⌫, Esc
 * and ⌘ keys go on to the app). Tested in test/transcript.test.mjs.
 * @returns {'prev'|'next'|'extendPrev'|'extendNext'|'fix'|'type'|null}
 */
export function transcriptKey(e, hasSelection) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'ArrowLeft') return e.shiftKey ? 'extendPrev' : 'prev';
  if (e.key === 'ArrowRight') return e.shiftKey ? 'extendNext' : 'next';
  if (!hasSelection) return null;
  if (e.key === 'Enter') return 'fix';
  if (e.key.length === 1 && e.key !== ' ') return 'type';
  return null;
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} box  the scrolling word box (#transcript)
 * @param {HTMLElement} panel  the aside around it (hidden until there are words)
 * @param {{parts: () => Array<{id:number, transcript: {words: Array<{w:string,s:number,e:number}>}|null}>,
 *   cuts: () => Array, selection: () => ({part:number,s:number,e:number,words?:boolean}|null),
 *   onSelect: (sel: object|null) => void, onSeek: (i:number, t:number) => void,
 *   onFix: (part:number, words:Array, label:string) => void}} o
 */
export function createTranscript(box, panel, o) {
  let parts = []; // [{ id, i, words, spans }] of the parts with a transcript
  let lit = null;
  let cursor = null; // { id, anchor, end } word indexes, for ⇧ and ← →
  let mine = null; // the last selection we made (so the cursor survives our own round trip)
  let pressing = false;
  let fixing = null;
  const follow = createFollow();

  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-multiselectable', 'true');
  box.setAttribute('aria-label', 'Transcript');
  box.tabIndex = 0;

  const partOf = (id) => parts.find((p) => p.id === id);
  const look = (span) => { span.className = wordClass(span.state); };

  function render() {
    if (fixing) { const f = fixing; fixing = null; f.close(); } // commit it before the words change under it
    const all = o.parts();
    const done = all.some((p) => p.transcript);
    panel.classList.toggle('hidden', !done);
    panel.classList.toggle('flex', done);
    box.replaceChildren();
    lit = null;
    parts = [];
    all.forEach((p, i) => {
      if (!p.transcript) return;
      if (all.length > 1) box.append(el('h3', 'mt-3 mb-1 text-[11px] font-medium text-text-secondary first:mt-0', `Part ${i + 1}`));
      const para = el('p');
      para.setAttribute('role', 'group');
      para.setAttribute('aria-label', `Part ${i + 1}`);
      const { words } = p.transcript;
      if (!words.length) para.append(el('span', 'text-text-secondary', 'No speech found.'));
      const spans = words.map((w, k) => {
        const span = el('span', '', w.w);
        span.id = `w-${p.id}-${k}`;
        span.dataset.id = p.id;
        span.dataset.i = k;
        span.dataset.w = w.w;
        span.setAttribute('role', 'option');
        span.state = { cut: null, lit: false, selected: false };
        para.append(span, ' ');
        return span;
      });
      box.append(para);
      parts.push({ id: p.id, i, words, spans });
    });
    if (cursor && !partOf(cursor.id)?.words[cursor.end]) cursor = null;
    paintCuts();
    paintSelection();
  }

  /** Strike the cut words, in place (selection and scroll stay). Call after any change to `cuts()`. */
  function paintCuts() {
    const cuts = o.cuts();
    for (const p of parts) {
      const mineCuts = cutsOf(cuts, p.id);
      p.spans.forEach((span, k) => {
        const w = p.words[k];
        const cut = cutAt(w, mineCuts) ?? null;
        if (cut === span.state.cut && span.title) return;
        span.state.cut = cut;
        span.title = cutTitle(cut, w.s);
        span.setAttribute('aria-label', wordLabel(w.w, cut));
        look(span);
      });
    }
  }

  /** Highlight the words of the shared selection (from either view). */
  function paintSelection() {
    const sel = o.selection();
    const p = sel && partOf(sel.part);
    const hit = p && wordsIn(sel, p.words);
    if (sel !== mine) cursor = hit ? { id: p.id, anchor: hit.from, end: hit.to } : null;
    for (const q of parts) {
      q.spans.forEach((span, k) => {
        const on = !!hit && q === p && hit.from <= k && k <= hit.to;
        if (on === span.state.selected) return;
        span.state.selected = on;
        span.setAttribute('aria-selected', String(on));
        look(span);
      });
    }
    const active = cursor && partOf(cursor.id)?.spans[cursor.end];
    active ? box.setAttribute('aria-activedescendant', active.id) : box.removeAttribute('aria-activedescendant');
  }

  /** Select words anchor..end of part id; the playhead goes to the word you moved to. */
  function choose(id, anchor, end, seek = true) {
    const p = partOf(id);
    cursor = { id, anchor, end };
    mine = wordSelection(id, p.words, anchor, end);
    o.onSelect(mine);
    if (seek) o.onSeek(p.i, p.words[end].s);
    scrollTo(p.spans[end], false);
  }

  /** A word under the pointer, clamped to the part the selection began in. */
  function clampTo(id, span) {
    const p = partOf(id);
    if (+span.dataset.id === id) return +span.dataset.i;
    return partOf(+span.dataset.id).i > p.i ? p.words.length - 1 : 0;
  }

  // ---------- Pointer ----------

  box.addEventListener('pointerdown', (e) => {
    follow.scrolled();
    if (e.button !== 0 || e.target.closest('[contenteditable]')) return;
    if (fixing) { e.preventDefault(); return fixing.close(); } // a click away commits the fix (the words may change)
    const span = e.target.closest('span[data-i]');
    if (!span) { if (e.target === box || e.target.closest('p')) { mine = null; o.onSelect(null); } return; }
    e.preventDefault(); // no native text selection: the words are the selection
    box.focus({ preventScroll: true });
    const id = +span.dataset.id, k = +span.dataset.i;
    if (e.shiftKey && cursor) choose(cursor.id, cursor.anchor, clampTo(cursor.id, span));
    else choose(id, k, k);
    pressing = true;
  });
  box.addEventListener('pointerover', (e) => {
    if (!pressing || !cursor) return;
    const span = e.target.closest?.('span[data-i]');
    if (!span) return;
    const end = clampTo(cursor.id, span);
    if (end !== cursor.end) choose(cursor.id, cursor.anchor, end, false);
  });
  globalThis.addEventListener?.('pointerup', () => { pressing = false; });
  box.addEventListener('dblclick', (e) => {
    const span = e.target.closest('span[data-i]');
    if (span && cursor) fix(null);
  });
  box.addEventListener('wheel', () => follow.scrolled(), { passive: true });

  // ---------- Keyboard (focus on the panel) ----------

  box.addEventListener('keydown', (e) => {
    if (e.target !== box) return; // the fix field handles its own keys
    if (SCROLL_KEYS.has(e.key)) return follow.scrolled();
    const act = transcriptKey(e, !!cursor);
    if (!act || !parts.length) return;
    e.preventDefault();
    e.stopPropagation(); // not the playhead's ← →
    if (act === 'fix') return fix(null);
    if (act === 'type') return fix(e.key);
    const dir = act.endsWith('Prev') ? -1 : 1;
    if (!cursor) {
      const start = lit ?? parts[0].spans[0];
      if (start) choose(+start.dataset.id, +start.dataset.i, +start.dataset.i);
      return;
    }
    const p = partOf(cursor.id);
    const end = Math.min(p.words.length - 1, Math.max(0, cursor.end + dir));
    choose(p.id, act.startsWith('extend') ? cursor.anchor : end, end);
  });

  /** Open the fix field over the selected words: with a typed letter, or (null) with their text, all selected. */
  function fix(letter) {
    if (fixing || !cursor) return;
    const p = partOf(cursor.id);
    const from = Math.min(cursor.anchor, cursor.end), to = Math.max(cursor.anchor, cursor.end);
    const spans = p.spans.slice(from, to + 1);
    const words = p.words;
    fixing = openFixField(spans, {
      text: letter ?? spans.map((s) => s.dataset.w).join(' '),
      selectAll: letter == null,
      onDone: (text) => {
        fixing = null;
        const step = text == null ? null : fixStep(words, from, to, text);
        if (step) o.onFix(p.id, step.words, step.label);
        if (box.isConnected) box.focus({ preventScroll: true });
      },
    });
  }

  // ---------- Following the playhead ----------

  function scrollTo(span, smooth = true) {
    if (!span || !box.getBoundingClientRect) return;
    const r = span.getBoundingClientRect(), b = box.getBoundingClientRect();
    const top = followTarget(r.top - b.top + box.scrollTop, r.height, box.scrollTop, box.clientHeight);
    if (top != null) box.scrollTo({ top, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  }

  /** Light the word under the playhead of part index `i` at time `t`, and keep it in view. */
  function highlight(i, t) {
    const p = parts.find((q) => q.i === i);
    let hit = null;
    if (p) {
      const k = p.words.findIndex((w) => w.s <= t && t < w.e + 0.05);
      hit = p.spans[k] ?? null;
    }
    if (hit === lit) return;
    if (lit) { lit.state.lit = false; look(lit); }
    if (hit) { hit.state.lit = true; look(hit); }
    lit = hit;
    if (hit && follow.on && !fixing) scrollTo(hit);
  }

  /** Bring the word at `s` of part id into view (an undo). */
  function reveal(id, s) {
    const p = partOf(id);
    const k = p?.words.findIndex((w) => w.e > s);
    if (p && k >= 0) scrollTo(p.spans[k]);
  }

  return { render, paintCuts, paintSelection, highlight, reveal, get fixing() { return !!fixing; } };
}
