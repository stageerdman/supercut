// Timeline: the parts in play order, then the add-slot while there are fewer than two.
// Thumbnails, waveform, trim handles and removed ranges come with the timeline phase.
import { el, clock } from './dom.js';

/**
 * @param {HTMLElement} root
 * @param {{parts: Array<{id:number,name:string,duration:number}>, current: number, max: number,
 *          onPick: (i:number)=>void, onRemove: (id:number)=>void}} s
 */
export function renderTimeline(root, { parts, current, max, onPick, onRemove }) {
  root.replaceChildren();
  parts.forEach((p, i) => {
    const len = p.duration ? clock(p.duration) : '';
    const tile = el('div', `group relative flex min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-[10px] border bg-raised p-2 outline-none focus-visible:ring-2 focus-visible:ring-accent ${i === current ? 'border-accent' : 'border-hairline'}`);
    tile.setAttribute('role', 'button');
    tile.tabIndex = 0;
    tile.setAttribute('aria-label', `Part ${i + 1}, ${p.name}${len ? `, ${len}` : ''}`);
    tile.setAttribute('aria-current', i === current ? 'true' : 'false');
    tile.title = p.name;
    tile.onclick = () => onPick(i);
    tile.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(i));

    tile.append(el('span', 'absolute top-2 left-2 rounded-md bg-surface px-1.5 text-[11px] font-medium', String(i + 1)));
    const x = el('button', 'absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-md text-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-surface hover:text-text', '✕');
    x.setAttribute('aria-label', `Remove part ${i + 1} from project`);
    x.onclick = (e) => { e.stopPropagation(); onRemove(p.id); };
    tile.append(x);
    tile.append(el('span', 'truncate text-text-secondary', len ? `${p.name} · ${len}` : p.name));
    root.append(tile);
  });

  if (parts.length && parts.length < max) {
    const slot = el('button', 'w-[120px] shrink-0 rounded-[10px] border-[1.5px] border-dashed border-hairline text-text-secondary transition-colors duration-[120ms] hover:text-text', `+ Add part ${parts.length + 1}`);
    slot.id = 'add-slot';
    slot.dataset.choose = '';
    root.append(slot);
  }
}
