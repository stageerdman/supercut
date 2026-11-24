// One project on Home (design/home-screen.md, "The card"): its picture, edited length, name, when and days left,
// and the lock. The card is one button (open); the lock is the next tab stop. Painting only: home-view.js wires it.
// Tested in test/home-view.test.mjs.
import { el } from './dom.js';
import { cardMeta, cardLabel, lengthText } from './home.js';

const SVG = 'http://www.w3.org/2000/svg';
const LOCKED = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const OPEN = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.75-1.4"/>';
const FILM = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>';

/** A stroked symbol, `size` pt (an <svg> by innerHTML: the fake DOM in the tests only needs the node). */
function symbol(paths, size) {
  const n = el('span', 'pointer-events-none flex items-center justify-center');
  n.setAttribute('aria-hidden', 'true');
  n.innerHTML = `<svg xmlns="${SVG}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return n;
}

/**
 * @param {object} s  Rust's Summary
 * @param {{ now: number, src: (path:string) => string }} o  `src`: a file path → a URL the webview loads
 * @returns {{ el, button, lock }}
 */
export function createProjectCard(s, { now, src }) {
  const item = el('li', 'project-card group relative');
  item.setAttribute('role', 'listitem');
  item.dataset.id = s.id;

  const button = el('button', 'card-open block w-full cursor-pointer rounded-[10px] text-left outline-none');
  button.dataset.card = s.id;
  button.setAttribute('aria-label', cardLabel(s, now));

  const thumb = el('div', 'card-thumb relative aspect-video overflow-hidden rounded-[10px] bg-raised');
  if (s.thumb) {
    const img = el('img', 'size-full object-cover');
    img.alt = '';
    img.draggable = false;
    img.src = src(s.thumb);
    img.onerror = () => img.replaceWith(film()); // unreadable: the plain tile
    thumb.append(img);
  } else thumb.append(film());
  thumb.append(el('span', 'card-hover pointer-events-none absolute inset-0 bg-white/6 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100'));
  thumb.append(el('span', 'absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-text', lengthText(s.length)));

  const { when, keep, soon } = cardMeta(s, now);
  const name = el('div', 'mt-2 truncate font-semibold text-text', s.name || 'Untitled');
  const meta = el('div', 'mt-0.5 truncate text-text-secondary');
  meta.append(el('span', '', when));
  if (keep) meta.append(el('span', '', ' · '), el('span', soon ? 'text-text' : '', keep));
  button.append(thumb, name, meta);

  const lock = el('button', [
    'card-lock absolute top-2 right-2 flex size-7 items-center justify-center rounded-full outline-none',
    'focus-visible:ring-2 focus-visible:ring-accent transition-opacity duration-[120ms]',
    s.locked ? 'text-text' : 'text-text-secondary opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
  ].join(' '));
  lock.dataset.lock = s.id;
  lock.setAttribute('aria-pressed', String(!!s.locked));
  lock.setAttribute('aria-label', `${s.locked ? 'Unlock' : 'Lock'} ${s.name}`);
  lock.title = s.locked ? 'Delete after 30 days unused' : 'Keep forever';
  const disc = el('span', 'flex size-6 items-center justify-center rounded-full bg-black/60');
  disc.append(symbol(s.locked ? LOCKED : OPEN, 13));
  lock.append(disc);

  item.append(button, lock);
  return { el: item, button, lock };
}

function film() {
  const n = symbol(FILM, 24);
  n.className = 'pointer-events-none flex size-full items-center justify-center text-text-secondary';
  return n;
}
