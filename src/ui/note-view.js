// The notes lane's elements (one part): pills, bars, clusters, labels, the ring on the current note, and the peek
// (hover / focus for 150 ms). Positions come from note-layout.js. Spec: design/notes.md ("The lane", "Reading a note").
import { el, clock } from './dom.js';

/** The four note colours, as "r g b" (for alpha) and hex. Each is ≥ 3 : 1 against the app's bg (they're graphics). */
export const NOTE_RGB = { yellow: '242 201 76', blue: '90 169 255', violet: '180 140 255', teal: '60 200 180' };
export const NOTE_HEX = { yellow: '#F2C94C', blue: '#5AA9FF', violet: '#B48CFF', teal: '#3CC8B4' };
export const COLOR_NAME = { yellow: 'Yellow', blue: 'Blue', violet: 'Violet', teal: 'Teal' };
const GREY = '158 161 168'; // textSecondary: a cluster of mixed colours, a done note
const rgb = (color, a = 1) => `rgb(${NOTE_RGB[color] ?? GREY} / ${a})`;

const isMoment = (n) => n.s === n.e;

/** "01:12" or "01:12 to 01:40" (for names), "01:12 – 01:40 · 28 s" (for the peek and the card). */
export const noteTime = (n) => (isMoment(n) ? clock(n.s) : `${clock(n.s)} – ${clock(n.e)} · ${Math.round(n.e - n.s)} s`);

/** The note's name for screen readers: "Note at 01:12, by Magic: Two good takes. Return opens." */
export function noteName(n) {
  const where = isMoment(n) ? `at ${clock(n.s)}` : `from ${clock(n.s)} to ${clock(n.e)}`;
  const text = n.text.trim();
  const head = `${n.done ? 'Done note' : text ? 'Note' : 'Empty note'} ${where}${n.by === 'magic' ? ', by Magic' : ''}`;
  return `${head}${text ? `: ${text}` : ''}. Return opens.`;
}

/** The peek's two lines: the text (or "Empty note") and when, plus " · ✦ Magic". */
export function peekLines(n) {
  return { text: n.text.trim() || 'Empty note', empty: !n.text.trim(), when: noteTime(n) + (n.by === 'magic' ? ' · ✦ Magic' : '') };
}

const RING = ['ring-[1.5px]', 'ring-accent', 'ring-offset-1', 'ring-offset-bg'];

/** The visible mark of one item, inside its hit area. */
function mark(m, n) {
  const v = el('div', 'pointer-events-none absolute flex items-center justify-center overflow-hidden');
  v.dataset.mark = '';
  const left = m.x - m.hit.x;
  const done = m.done;
  if (m.kind === 'section') {
    v.style.cssText = `left:${left}px;width:${m.w}px;top:2px;height:16px;border-radius:4px;`
      + `background:${rgb(done ? null : m.color, 0.24)};border:1px solid ${rgb(done ? null : m.color, 0.6)};`
      + `box-shadow:inset 2px 0 0 ${rgb(done ? null : m.color)};justify-content:flex-start`;
    if (n.by === 'magic' && !done && m.w >= 20) v.append(markGlyph('✦', `color:${rgb(m.color)};font-size:11px;margin-left:4px`));
    if (done && m.w >= 20) v.append(markGlyph('✓', `color:${rgb(null)};font-size:10px;margin-left:4px`));
  } else {
    v.style.cssText = `left:${left}px;width:${m.w}px;top:2px;height:16px;border-radius:${m.kind === 'cluster' ? 5 : 3}px;`
      + `background:${rgb(done ? null : m.color)}`;
    const glyph = m.kind === 'cluster' ? String(m.ids.length) : done ? '✓' : m.by === 'magic' ? '✦' : '';
    if (glyph) v.append(markGlyph(glyph, `font-size:${m.kind === 'cluster' ? 11 : 9}px`, 'text-on-accent tabular-nums'));
  }
  if (done) v.style.opacity = '0.35';
  return v;
}
const markGlyph = (text, css, cls = '') => {
  const g = el('span', `leading-none ${cls}`, text);
  g.style.cssText = css;
  return g;
};

/** One item: a button the size of its hit area (the full lane height), its mark and its label. */
export function noteItem(m, n, { current = false } = {}) {
  const b = el('div', `group/note pointer-events-auto absolute top-0 h-full cursor-pointer outline-none focus-visible:[&>[data-mark]]:ring-2 focus-visible:[&>[data-mark]]:ring-accent`);
  b.style.cssText = `left:${m.hit.x}px;width:${m.hit.w}px`;
  b.classList.add(`z-[${m.z}]`);
  b.setAttribute('role', 'button');
  b.tabIndex = 0;
  if (m.kind === 'cluster') {
    b.dataset.cluster = m.ids.join(' ');
    b.setAttribute('aria-label', `${m.ids.length} notes near ${clock(n.s)}. Return zooms in.`);
  } else {
    b.dataset.note = n.id;
    b.setAttribute('aria-label', noteName(n));
  }
  const v = mark(m, n);
  if (current) v.classList.add(...RING);
  b.append(v);
  if (m.label) {
    const t = el('span', 'pointer-events-auto absolute top-0 flex h-full items-center text-[11px] whitespace-nowrap', m.label);
    t.style.cssText = `left:${m.labelX - m.hit.x}px;color:rgb(242 242 243 / 0.9)`; // text at 90 %
    t.setAttribute('aria-hidden', 'true');
    t.dataset.label = '';
    b.append(t);
  }
  return b;
}

/**
 * One part's lane (the box is the part's place on the timeline): a group holding its items in time order.
 * @param {{x:number,w:number}} box
 * @param {number} i  the part's index
 * @param {{items: Array, notes: Map<string,object>, current?: string|null, top: number, h: number}} o
 */
export function noteLane(box, i, { items, notes, current = null, top, h }) {
  const l = el('div', 'pointer-events-none absolute');
  l.style.cssText = `left:${box.x}px;width:${box.w}px;top:${top}px;height:${h}px`;
  l.dataset.notes = i;
  l.setAttribute('role', 'group');
  fillLane(l, i, { items, notes, current });
  return l;
}

export function fillLane(l, i, { items, notes, current = null }) {
  const open = [...notes.values()].filter((n) => !n.done).length;
  l.setAttribute('aria-label', `Notes, part ${i + 1}, ${open} open`);
  l.replaceChildren(...items.map((m) => noteItem(m, notes.get(m.ids[0]), { current: m.ids.includes(current) && m.kind !== 'cluster' })));
}

/** Pop a fresh marker in: scale 0.6 → 1 and fade, 160 ms (a fade only with Reduce Motion). */
export function popIn(item) {
  const v = item?.querySelector('[data-mark]');
  if (!v?.animate) return;
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  v.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 160, easing: 'ease-out' });
}

/** The peek: a small read-only card just above the lane. `show(note, x)` after 150 ms, `hide()` at once. */
export function createPeek(host, { bottom }) {
  const p = el('div', 'pointer-events-none absolute z-[7] hidden max-w-[240px] -translate-x-1/2 -translate-y-full rounded-md border border-hairline bg-raised p-2');
  p.style.top = `${bottom}px`;
  p.setAttribute('aria-hidden', 'true'); // the note's own name says the same to screen readers
  const text = el('div', 'line-clamp-3 text-[13px] whitespace-pre-line');
  const when = el('div', 'mt-0.5 text-[11px] text-text-secondary tabular-nums');
  p.append(text, when);
  host.append(p);
  let timer = 0, shown = null;
  return {
    show(note, x) {
      clearTimeout(timer);
      if (shown === note.id) return;
      timer = setTimeout(() => {
        const l = peekLines(note);
        text.textContent = l.text;
        text.classList.toggle('text-text-secondary', l.empty);
        when.textContent = l.when;
        p.style.left = `${x}px`;
        p.classList.remove('hidden');
        shown = note.id;
      }, 150);
    },
    hide() { clearTimeout(timer); p.classList.add('hidden'); shown = null; },
    get shown() { return shown; },
    el: p,
  };
}
