// TranscriptPanel: the words you said, next to the video. A view of the edit, like the timeline: it keeps no cuts and
// no selection of its own, it reads `cuts()` and `selection()` and reports what you do.
//   click a word → select it and move the playhead there · drag / ⇧-click → more words (one part only)
//   ⌫ (in main.js) → cut or restore them · type, double-click or Return → the fix field (fix-field.js)
// Cut words stay, struck through: grey yours, coral Magic's. The lit word follows the playhead (follow.js).
// Spec: design/transcript-editing.md. Selection rules: selection.js.
import { el, clock } from './dom.js';
import { cutAt, cutsOf, isCut } from './cuts.js';
import { wordsIn, wordSelection } from './selection.js';
import { openFixField } from './fix-field.js';
import { writeTarget, writeWords } from './fix.js';
import { unheard } from './unheard.js';
import { createFollow, followTarget } from './follow.js';
import { blocksOf } from './blocks.js';
import { findMatches, firstFrom, stepMatch } from './search.js';
import { NOTE_RGB, noteName } from './note-view.js';

export { isCut };

/** Pure: a word's hover text. Magic's cuts say why. Tested in test/ui.test.mjs. */
export function cutTitle(cut, s) {
  if (!cut) return clock(s);
  return `${cut.by === 'magic' ? `Magic Cut: ${cut.reason}` : `Cut · ${clock(s)}`} · Backspace brings it back`;
}

/** Pure: a word's spoken name, with its state. "gonna, cut by Magic". */
export const wordLabel = (w, cut) => (!cut ? w : cut.by === 'magic' ? `${w}, cut by Magic` : `${w}, cut`);

/**
 * Pure: a word's classes. A cut keeps its strike when lit; the strike's colour says who cut it.
 * `match`: 0 none, 1 a search match, 2 the current one (design/transcript-panel.md § Search).
 */
export function wordClass({ cut, lit, selected, match = 0 }) {
  return [
    'cursor-pointer rounded',
    match === 2 ? 'bg-accent/35' : selected ? 'bg-accent/20' : match ? 'bg-white/14' : 'hover:bg-raised',
    lit ? 'text-accent' : cut && 'text-text-secondary',
    cut && `line-through decoration-2 ${cut.by === 'magic' ? 'decoration-accent' : 'decoration-text-secondary'}`,
  ].filter(Boolean).join(' ');
}

/**
 * Pure: what a key does in the panel (focus on the panel, not in the fix field). null → not ours (Space, ⌫, Esc
 * and ⌘ keys go on to the app). Tested in test/transcript.test.mjs.
 * @returns {'prev'|'next'|'extendPrev'|'extendNext'|'fix'|'type'|'menu'|null}
 */
export function transcriptKey(e, hasSelection) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'F10' && e.shiftKey) return hasSelection ? 'menu' : null;
  if (e.key === 'ArrowLeft') return e.shiftKey ? 'extendPrev' : 'prev';
  if (e.key === 'ArrowRight') return e.shiftKey ? 'extendNext' : 'next';
  if (!hasSelection) return null;
  if (e.key === 'Enter') return 'fix';
  if (e.key === 'm' || e.key === 'M') return null; // M is the app's: a note over the selected words
  if (e.key.length === 1 && e.key !== ' ') return 'type';
  return null;
}

/**
 * Pure: the notes in the words. `under[k]`: the open section note over word k (its middle is inside the note);
 * `bars`: [{ k, note }] for open moment notes, each before the word under its time (or the next word after a gap).
 * Done notes mark nothing. Tested in test/transcript.test.mjs.
 */
export function noteMarks(words, notes) {
  const under = new Array(words.length).fill(null);
  const bars = [];
  const open = notes.filter((n) => !n.done).sort((a, b) => a.s - b.s || b.e - a.e);
  for (const n of open) {
    if (n.s === n.e) {
      const k = words.findIndex((w) => w.e > n.s);
      if (k >= 0) bars.push({ k, note: n });
      continue;
    }
    words.forEach((w, k) => {
      const mid = (w.s + w.e) / 2;
      if (!under[k] && n.s <= mid && mid <= n.e) under[k] = n;
    });
  }
  return { under, bars };
}

const underline = (color) => `linear-gradient(rgb(${NOTE_RGB[color]} / 0.6), rgb(${NOTE_RGB[color]} / 0.6))`;

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} box  the scrolling word box (#transcript)
 * @param {HTMLElement} panel  the aside around it (hidden until there are words)
 * @param {{parts: () => Array<{id:number, transcript: {words: Array<{w:string,s:number,e:number}>}|null}>,
 *   cuts: () => Array, selection: () => ({part:number,s:number,e:number,words?:boolean}|null),
 *   onSelect: (sel: object|null) => void, onSeek: (i:number, t:number) => void,
 *   onFix: (part:number, words:Array, label:string) => void,
 *   playhead?: () => ({i:number,t:number}), onView?: (from:{i,t}|null, to:{i,t}|null) => void,
 *   onMenu?: (at:{x:number,y:number}) => void}} o
 *   onView: the stretch of the video on screen changed (for the rail, rail.js)
 *   onMenu: right-click (or ⇧F10) on the words; the selection is already what was clicked (context-menu.js)
 *   notes?: () => Array (the edit's notes, notes.js), onNote?: (id, {focus, seek?}) => void: a note's mark was clicked
 */
export function createTranscript(box, panel, o) {
  let parts = []; // [{ id, i, words, spans }] of the parts with a transcript
  let lit = null;
  let query = '';
  let matches = []; // [{ id, from, to, s }] (search.js)
  let current = -1; // index into matches
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
      const section = el('section', 'mt-6 first:mt-0');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', `Part ${i + 1}`);
      if (all.length > 1) section.append(el('h3', 'mb-2 text-[11px] font-medium text-text-secondary', `Part ${i + 1}`));
      const { words, speech, seconds } = p.transcript;
      if (!words.length) section.append(el('p', 'text-text-secondary', 'No speech found.'));
      const spans = [];
      for (const { from, to } of blocksOf(words)) {
        const block = el('div', 'mt-4 first:mt-0');
        const time = el('div', 'mb-0.5 text-[11px] font-medium tabular-nums text-text-secondary', clock(words[from].s));
        time.setAttribute('aria-hidden', 'true');
        const para = el('p');
        for (let k = from; k <= to; k++) {
          const span = el('span', '', words[k].w);
          span.id = `w-${p.id}-${k}`;
          span.dataset.id = p.id;
          span.dataset.i = k;
          span.dataset.w = words[k].w;
          span.setAttribute('role', 'option');
          span.state = { cut: null, lit: false, selected: false, match: 0 };
          para.append(span, ' ');
          spans.push(span);
        }
        block.append(time, para);
        section.append(block);
      }
      box.append(section);
      parts.push({ id: p.id, i, words, spans, section, speech, seconds });
    });
    if (cursor && !partOf(cursor.id)?.words[cursor.end]) cursor = null;
    paintCuts();
    paintSelection();
    if (query) search(query, true);
    viewChanged();
  }

  /**
   * Strike the cut words and mark the noted ones, in place (selection and scroll stay). Call after any change to
   * `cuts()` or `notes()`. A section note underlines its words in its colour (with the strike, if cut too).
   */
  function paintCuts() {
    const cuts = o.cuts();
    const notes = o.notes?.() ?? [];
    for (const p of parts) {
      const mineCuts = cutsOf(cuts, p.id);
      const marks = noteMarks(p.words, notes.filter((n) => n.part === p.id));
      p.spans.forEach((span, k) => {
        const w = p.words[k];
        const cut = cutAt(w, mineCuts) ?? null;
        const note = marks.under[k];
        if (cut === span.state.cut && note === span.state.note && span.title) return;
        span.state.cut = cut;
        span.state.note = note;
        span.title = cutTitle(cut, w.s) + (note ? `\nNote: ${note.text.trim() || 'Empty note'}` : '');
        span.setAttribute('aria-label', wordLabel(w.w, cut) + (note ? ', has a note' : ''));
        if (note) Object.assign(span.style, { backgroundImage: underline(note.color), backgroundSize: '100% 2px', backgroundPosition: '0 100%', backgroundRepeat: 'no-repeat' });
        else if (span.style?.backgroundImage) span.style.backgroundImage = '';
        look(span);
      });
      paintBars(p, marks.bars);
    }
  }

  /** A moment note: a 2 × 14 bar in its colour before the word under its time. Click opens its card. */
  function paintBars(p, bars) {
    for (const b of p.bars ?? []) b.remove();
    p.bars = [];
    for (const { k, note } of bars) {
      const bar = el('span', 'mr-1 inline-block h-[14px] w-[2px] cursor-pointer rounded-full align-[-2px]');
      bar.style.background = `rgb(${NOTE_RGB[note.color]})`;
      bar.dataset.noteBar = note.id;
      bar.title = `Note: ${note.text.trim() || 'Empty note'}`;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', noteName(note));
      p.spans[k].before(bar);
      p.bars.push(bar);
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
    const bar = e.target.closest('[data-note-bar]');
    if (bar) { e.preventDefault(); return o.onNote?.(bar.dataset.noteBar, { focus: true }); } // a moment note: write in it
    const span = e.target.closest('span[data-i]');
    if (!span) { mine = null; o.onSelect(null); return; } // the space around the words clears the selection
    e.preventDefault(); // no native text selection: the words are the selection
    box.focus({ preventScroll: true });
    const id = +span.dataset.id, k = +span.dataset.i;
    if (e.shiftKey && cursor) choose(cursor.id, cursor.anchor, clampTo(cursor.id, span));
    else {
      choose(id, k, k);
      // A noted word: selected as usual, and its note's card opens without focus (so ⌫ still cuts the word).
      if (span.state.note) o.onNote?.(span.state.note.id, { focus: false, seek: false });
    }
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
    if (act === 'menu') {
      const r = partOf(cursor.id)?.spans[cursor.end]?.getBoundingClientRect?.();
      return o.onMenu?.(r ? { x: r.left, y: r.bottom } : null);
    }
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

  /** The selected words as the shared selection (the panel's own cursor), or the shared one. */
  function writeSel() {
    const shared = o.selection();
    if (!shared) return null;
    if (cursor) {
      const p = partOf(cursor.id);
      return wordSelection(p.id, p.words, cursor.anchor, cursor.end);
    }
    return shared;
  }

  /**
   * Open the field on the selection (from either view): over the words it highlights (or, with no room between
   * words, the words it overlaps: highlighted first), or empty between the neighbouring words. With a typed
   * letter, or (null) with the words' text, all selected. The write rule is `writeWords` (fix.js).
   */
  function fix(letter) {
    const sel = writeSel();
    const p = sel && partOf(sel.part);
    if (fixing || !p || sel.cut) return;
    const target = writeTarget(p.words, sel, unheard(p.speech, p.words));
    if (!target) return;
    let spans = [], place;
    if (target.replace) {
      const { from, to } = target.replace;
      if (!cursor || cursor.id !== p.id || Math.min(cursor.anchor, cursor.end) !== from || Math.max(cursor.anchor, cursor.end) !== to) {
        cursor = { id: p.id, anchor: from, end: to }; // the overlapped words: you see what you're fixing
        p.spans.forEach((span, k) => { span.state.selected = from <= k && k <= to; look(span); });
      }
      spans = p.spans.slice(from, to + 1);
    } else {
      const { at } = target.insert;
      const next = p.spans[at], last = p.spans.at(-1);
      place = (field) => {
        field.classList.add('mr-1');
        if (next) next.before(field);
        else if (last) last.after(field);
        else p.section.append(field);
      };
    }
    fixing = openFixField(spans, {
      text: letter ?? spans.map((s) => s.dataset.w).join(' '),
      selectAll: letter == null,
      place,
      onDone: (text) => {
        fixing = null;
        // Applied to the words as they are now (the selection is time, not indexes).
        const q = partOf(p.id);
        const step = text == null || !q ? null : writeWords(q.words, sel, text, unheard(q.speech, q.words), q.seconds);
        if (step) o.onFix(p.id, step.words, step.label);
        else paintSelection();
        if (box.isConnected) box.focus({ preventScroll: true });
      },
    });
    if (!spans.length) fixing.field.scrollIntoView?.({ block: 'nearest' });
  }

  // ---------- Right-click ----------

  box.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[contenteditable]')) return; // the field's own menu (copy, paste)
    e.preventDefault();
    if (fixing) return fixing.close();
    const span = e.target.closest('span[data-i]');
    if (!span) return;
    const id = +span.dataset.id, k = +span.dataset.i;
    const inside = cursor && cursor.id === id && Math.min(cursor.anchor, cursor.end) <= k && k <= Math.max(cursor.anchor, cursor.end);
    if (!inside) choose(id, k, k); // outside the selection: select it first (Mac habit)
    box.focus({ preventScroll: true });
    o.onMenu?.({ x: e.clientX, y: e.clientY });
  });

  // ---------- Following the playhead ----------

  function scrollTo(span, smooth = true) {
    if (!span || !box.getBoundingClientRect) return;
    const r = span.getBoundingClientRect(), b = box.getBoundingClientRect();
    const top = followTarget(r.top - b.top + box.scrollTop, r.height, box.scrollTop, box.clientHeight);
    if (top != null) box.scrollTo({ top, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  }

  /** Light the word under the playhead of part index `i` at time `t`; keep it in view unless you're scrolling. */
  function highlight(i, t, scroll = follow.on) {
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
    if (hit && scroll && !fixing) scrollTo(hit);
  }

  let lastGo = -Infinity;
  /**
   * A seek you made elsewhere (timeline click or scrub, the rail, ← →): scroll there and light the word, even if
   * you scrolled the panel a moment ago. Seeks in quick succession (a scrub) scroll instantly. Into a pause: the
   * next word comes into view, nothing lit.
   */
  function goTo(i, t) {
    const now = globalThis.performance?.now() ?? Date.now();
    const smooth = now - lastGo > 250;
    lastGo = now;
    follow.reset();
    highlight(i, t, false);
    if (fixing) return;
    const p = parts.find((q) => q.i === i);
    const k = p?.words.findIndex((w) => w.e + 0.05 > t);
    if (p && p.words.length) scrollTo(p.spans[k >= 0 ? k : p.words.length - 1], smooth);
  }

  /** Bring the word at `s` of part id into view (an undo). */
  function reveal(id, s) {
    const p = partOf(id);
    const k = p?.words.findIndex((w) => w.e > s);
    if (p && k >= 0) scrollTo(p.spans[k]);
  }

  // ---------- Search (design/transcript-panel.md § Search) ----------

  function paintMatches(on) {
    matches.forEach((m, n) => {
      const p = partOf(m.id);
      for (let k = m.from; k <= m.to; k++) {
        const span = p?.spans[k];
        if (!span) continue;
        span.state.match = on ? (n === current ? 2 : 1) : 0;
        look(span);
      }
    });
  }

  const found = () => ({ k: current, n: matches.length });

  /** Light every match of `q`; start at the first one from the playhead (or keep the one we're on). */
  function search(q, keep = false) {
    paintMatches(false);
    const was = matches[current];
    query = q;
    matches = findMatches(parts, q);
    const at = o.playhead?.() ?? { i: 0, t: 0 };
    const again = keep && was ? matches.findIndex((m) => m.id === was.id && m.from === was.from) : -1;
    current = again >= 0 ? again : firstFrom(matches, o.parts().map((p) => p.id), at);
    paintMatches(true);
    if (!keep) showMatch();
    return found();
  }

  /** The next (1) or previous (-1) match, scrolled into view. */
  function step(d) {
    if (!matches.length) return found();
    paintMatches(false);
    current = stepMatch(current, d, matches.length);
    paintMatches(true);
    showMatch();
    return found();
  }

  function showMatch() {
    const m = matches[current];
    if (!m) return;
    follow.scrolled(); // searching is reading by hand: playback doesn't pull the panel away
    scrollTo(partOf(m.id)?.spans[m.from]);
  }

  // ---------- What's on screen (for the rail) ----------

  /** { i, t } of the first and last word on screen. Binary search over the words in reading order. */
  function visible() {
    if (!box.getBoundingClientRect || !parts.length) return null;
    const all = parts.flatMap((p) => p.spans.map((span, k) => [p, k, span]));
    if (!all.length) return null;
    const b = box.getBoundingClientRect();
    const first = (test) => { // first index where test(rect) is true (test goes false → true down the list)
      let lo = 0, hi = all.length;
      while (lo < hi) { const m = (lo + hi) >> 1; test(all[m][2].getBoundingClientRect()) ? (hi = m) : (lo = m + 1); }
      return lo;
    };
    const a = Math.min(all.length - 1, first((r) => r.bottom > b.top));
    const z = Math.max(a, first((r) => r.top >= b.bottom) - 1);
    const [pa, ka] = all[a], [pz, kz] = all[z];
    return { from: { i: pa.i, t: pa.words[ka].s }, to: { i: pz.i, t: pz.words[kz].e } };
  }

  let viewReq = 0;
  function viewChanged() {
    if (!o.onView || viewReq) return;
    const run = () => { viewReq = 0; const v = visible(); o.onView(v?.from ?? null, v?.to ?? null); };
    if (globalThis.requestAnimationFrame) viewReq = requestAnimationFrame(run);
    else run();
  }
  box.addEventListener('scroll', viewChanged, { passive: true });
  if (globalThis.ResizeObserver) new ResizeObserver(viewChanged).observe(box);

  return {
    render, paintCuts, paintSelection, highlight, goTo, reveal, search, step,
    focus: () => box.focus({ preventScroll: true }),
    /** Type on the shared selection from anywhere (the timeline): a letter, or null (Return) for the words' text. */
    write: (letter) => fix(letter),
    get fixing() { return !!fixing; },
  };
}
