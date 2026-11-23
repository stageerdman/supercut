// The note card: the one place to change a note (text, colour, Done, Delete). Non-modal, over the bottom of the
// player, centred on the note's x. Text is never lost: Return, Esc, ✕ and a click outside all keep it.
// Spec: design/notes.md ("The card"). Tested in test/note-card.test.mjs.
import { el, clock } from './dom.js';
import { NOTE_COLORS } from './notes.js';
import { NOTE_HEX, COLOR_NAME, noteTime } from './note-view.js';

export const CARD_W = 280;
const EDGE = 8; // the card keeps this far inside the player
const LINE = 20; // the text field's line height; it grows to 4 lines, then scrolls

/** The card's left in the host for a note at `x` (host points): centred on it, kept inside the host's width. */
export const cardLeft = (x, width) => Math.max(EDGE, Math.min(x - CARD_W / 2, width - CARD_W - EDGE));

/** "Note at 01:12" / "Note from 01:12 to 01:40": the dialog's name. */
export const cardTitle = (n) => (n.s === n.e ? `Note at ${clock(n.s)}` : `Note from ${clock(n.s)} to ${clock(n.e)}`);

const TRASH = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

/**
 * @param {HTMLElement} host  the player's box (position: relative)
 * @param {{onSave:(id:string,text:string)=>void, onColor:(id:string,color:string)=>void, onDone:(id:string)=>void,
 *   onReopen:(id:string)=>void, onDelete:(id:string)=>void, onPlay:()=>void, onClosed?:(id:string)=>void,
 *   keepOpen?:(target:Node)=>boolean}} o
 *   keepOpen: a press there leaves the card open (the timeline: you fix the note's problem while it's open)
 */
export function createNoteCard(host, o) {
  let note = null; // the note shown (as it was when opened or last synced)
  let back = null; // where focus goes when the card closes, if focus was in it

  const card = el('div', 'absolute bottom-2 z-20 hidden rounded-[10px] border border-hairline bg-raised p-3 shadow-lg');
  card.style.width = `${CARD_W}px`;
  card.setAttribute('role', 'dialog');
  card.id = 'note-card';

  const when = el('span', 'flex-1 text-[11px] text-text-secondary tabular-nums');
  const x = el('button', 'flex size-7 items-center justify-center rounded-md text-text-secondary hover:text-text', '✕');
  x.setAttribute('aria-label', 'Close note');
  x.title = 'Close (Esc)';
  const head = el('div', '-mt-1.5 -mr-1.5 flex items-center');
  head.append(when, x);

  const text = el('textarea', 'mt-1 block w-full resize-none bg-transparent text-[13px] leading-5 text-text outline-none select-text placeholder:text-text-secondary');
  text.rows = 1;
  text.placeholder = 'Note to self…';
  text.setAttribute('aria-label', 'Note text');

  const swatches = el('div', 'flex items-center');
  swatches.setAttribute('role', 'radiogroup');
  swatches.setAttribute('aria-label', 'Colour');
  const dots = NOTE_COLORS.map((c) => {
    const b = el('button', 'flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', COLOR_NAME[c]);
    b.dataset.color = c;
    const dot = el('span', 'block size-4 rounded-full');
    dot.style.background = NOTE_HEX[c];
    b.append(dot);
    b.onclick = () => pick(c);
    return b;
  });
  swatches.append(...dots);
  const trash = el('button', 'ml-auto flex size-7 items-center justify-center rounded-md text-text-secondary hover:text-text');
  trash.innerHTML = TRASH;
  trash.setAttribute('aria-label', 'Delete note');
  trash.title = 'Delete note (⌘⌫)';
  const doneBtn = el('button', 'ml-1 h-7 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent hover:brightness-110');
  const foot = el('div', 'mt-2 flex items-center');
  foot.append(swatches, trash, doneBtn);
  card.append(head, text, foot);
  host.append(card);

  // ---------- state ----------

  function paintColor(c) {
    for (const b of dots) {
      const on = b.dataset.color === c;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1; // one Tab stop; arrows move between them
      b.firstChild?.style && (b.firstChild.style.boxShadow = on ? '0 0 0 1.5px var(--color-raised), 0 0 0 3px var(--color-text)' : '');
    }
  }

  function paint(n) {
    card.setAttribute('aria-label', cardTitle(n));
    when.textContent = noteTime(n) + (n.by === 'magic' ? ' · ✦ Magic' : '');
    paintColor(n.color);
    doneBtn.textContent = n.done ? 'Reopen' : '✓ Done';
    doneBtn.title = n.done ? 'Reopen note' : 'Done (⌘Return)';
  }

  function grow() {
    text.style.height = 'auto';
    text.style.height = `${Math.min(text.scrollHeight || LINE, 4 * LINE)}px`;
  }

  const isOpen = () => !!note;

  function pick(c) {
    if (!note || c === note.color) return;
    note = { ...note, color: c };
    paintColor(c);
    o.onColor(note.id, c);
  }

  /** Close the card. `save`: the text goes into the note if it changed (one "Edited note" step). */
  function close({ save = true } = {}) {
    if (!note) return;
    const n = note;
    const typed = text.value.trim();
    note = null;
    card.classList.add('hidden');
    const hadFocus = card.contains(document.activeElement);
    if (save && typed !== n.text) o.onSave(n.id, typed);
    if (hadFocus) {
      text.blur?.();
      const to = back && back.isConnected !== false && back !== card && !card.contains(back) ? back : null;
      to?.focus?.({ preventScroll: true });
    }
    back = null;
    o.onClosed?.(n.id);
  }

  // ---------- events ----------

  x.onclick = () => close();
  doneBtn.onclick = () => {
    if (!note) return;
    const { id, done } = note;
    close();
    done ? o.onReopen(id) : o.onDone(id);
  };
  trash.onclick = () => { if (note) { const { id } = note; close({ save: false }); o.onDelete(id); } };
  text.addEventListener('input', grow);
  card.addEventListener('keydown', (e) => {
    if (!note) return;
    const inText = e.target === text;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.metaKey && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); return doneBtn.onclick(); }
    if (e.metaKey && e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); return trash.onclick(); }
    if (inText && e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); return close(); }
    if (inText && e.key === ' ' && !text.value.trim()) { // M, Space: the note stays empty and it plays on
      e.preventDefault();
      e.stopPropagation();
      close();
      return o.onPlay();
    }
    const dot = e.target.closest?.('[data-color]');
    if (dot && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      e.stopPropagation();
      const k = (NOTE_COLORS.indexOf(dot.dataset.color) + (e.key === 'ArrowLeft' ? -1 : 1) + NOTE_COLORS.length) % NOTE_COLORS.length;
      pick(NOTE_COLORS[k]);
      dots[k].focus();
      return;
    }
    if (inText) e.stopPropagation(); // typing is typing: no app shortcut fires from here
  });
  // A press outside the card (and outside what keepOpen allows) closes it and keeps the text.
  document.addEventListener('pointerdown', (e) => {
    if (note && !card.contains(e.target) && !o.keepOpen?.(e.target)) close();
  }, true);

  return {
    /**
     * Show the note. `x`: the note's client x (centred on it); `focus`: the cursor goes into the text field (a click,
     * Return, M while paused), else focus stays where it is (going to a note with ⌥→).
     */
    open(n, { x: clientX = null, focus = false } = {}) {
      if (note && note.id !== n.id) close();
      const same = note?.id === n.id;
      note = n;
      if (!same) { text.value = n.text; back = null; }
      paint(n);
      const r = host.getBoundingClientRect();
      const width = r.width || host.clientWidth || CARD_W + 2 * EDGE;
      card.style.left = `${cardLeft(clientX == null ? width / 2 : clientX - r.left, width)}px`;
      card.classList.remove('hidden');
      grow();
      if (focus) {
        if (!card.contains(document.activeElement)) back = document.activeElement;
        text.focus();
        text.setSelectionRange?.(text.value.length, text.value.length);
      }
    },
    close,
    /** The note changed under the card (undo, Magic): show it as it is now, keeping what you typed. */
    sync(n) { if (note && n.id === note.id) { const typed = text.value !== note.text; note = n; if (!typed) text.value = n.text; paint(n); } },
    get id() { return note?.id ?? null; },
    get isOpen() { return isOpen(); },
    contains: (node) => card.contains(node),
    el: card,
    text,
  };
}
