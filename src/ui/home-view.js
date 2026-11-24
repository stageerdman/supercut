// Home (design/home-screen.md): the new-project strip, "Projects" (and what the sweep deleted), the grid of cards,
// the rule line. Click / Return opens; right-click is Open · Lock · Delete…; ⌫ is Delete…, always confirmed; the lock
// button toggles; the arrows move across the grid. Rust is behind `deps`, so this is tested on the fake DOM
// (test/home-view.test.mjs). With no projects it shows nothing: main.js shows the big drop zone instead.
import { createProjectCard } from './project-card.js';
import { homeMenu, sweptText, nextFocus, gridMove, deleteConfirm } from './home.js';

const CARD_MIN = 208, GAP = 24;

/**
 * @param {{ strip, heading, grid }} nodes  Home's fixed parts in index.html
 * @param {{ open: (id) => void, setLocked: (id, locked) => Promise<object>, remove: (id) => Promise<void>,
 *           confirm: ({ title, message }) => Promise<boolean>, popup: (items, handlers, at) => Promise<void>,
 *           failed: (text) => void, changed: () => void, now?: () => number, src?: (path) => string }} deps
 */
export function createHomeView(nodes, deps) {
  const now = deps.now ?? Date.now;
  const src = deps.src ?? ((p) => p);
  let list = [], swept = 0;
  const cards = new Map(); // id → { el, button, lock }

  nodes.grid.setAttribute('role', 'list');
  nodes.grid.setAttribute('aria-label', 'Projects');

  function paint() {
    const tail = sweptText(swept);
    nodes.heading.textContent = tail ? `Projects · ${tail}` : 'Projects';
    cards.clear();
    nodes.grid.replaceChildren(...list.map((s) => {
      const c = createProjectCard(s, { now: now(), src });
      cards.set(s.id, c);
      wire(s, c);
      return c.el;
    }));
  }

  const find = (id) => list.find((s) => s.id === id);

  function wire(s, c) {
    c.button.onclick = () => deps.open(s.id);
    c.button.oncontextmenu = (e) => { e.preventDefault(); menu(s.id, { x: e.clientX, y: e.clientY }); };
    c.button.onkeydown = (e) => key(s.id, e);
    c.lock.onclick = (e) => { e.stopPropagation?.(); toggleLock(s.id); };
  }

  function key(id, e) {
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); remove(id); return; }
    if (e.key === 'F10' && e.shiftKey) { e.preventDefault(); menu(id, null); return; }
    const i = list.findIndex((s) => s.id === id);
    const to = gridMove(e.key, i, list.length, columns());
    if (to == null) return;
    e.preventDefault();
    focus(list[to].id);
  }

  /** Cards per row, as the grid lays them out (auto-fill of 208 px minimum, 24 px gaps). */
  function columns() {
    const w = nodes.grid.clientWidth || CARD_MIN;
    return Math.max(1, Math.floor((w + GAP) / (CARD_MIN + GAP)));
  }

  function focus(id) {
    if (id == null) return nodes.strip.querySelector('button')?.focus();
    cards.get(id)?.button.focus();
  }

  function menu(id, at) {
    const s = find(id);
    if (!s) return;
    deps.popup(homeMenu(s), { open: () => deps.open(id), lock: () => toggleLock(id), remove: () => remove(id) }, at)
      .catch((e) => console.error('menu', e));
  }

  async function toggleLock(id) {
    const s = find(id);
    if (!s) return;
    try {
      const fresh = await deps.setLocked(id, !s.locked);
      list = list.map((x) => (x.id === id ? fresh : x));
      const had = document.activeElement === cards.get(id)?.lock;
      paint();
      if (had) cards.get(id)?.lock.focus();
    } catch (e) {
      deps.failed(String(e));
    }
  }

  /** Delete…: the confirm first (Cancel changes nothing), then the folder; focus goes to the next card. */
  async function remove(id) {
    const s = find(id);
    if (!s || !(await deps.confirm(deleteConfirm(s)))) return;
    try {
      await deps.remove(id);
    } catch (e) {
      deps.failed(`Couldn't delete ${s.name}. Try again.`);
      console.error('delete', id, e);
      return;
    }
    const next = nextFocus(list.map((x) => x.id), id);
    const gone = cards.get(id)?.el;
    if (gone) { // the card fades (180 ms), then the grid closes up
      gone.classList.add('opacity-0', 'transition-opacity', 'duration-[180ms]');
      await new Promise((r) => setTimeout(r, deps.fadeMs ?? 180));
    }
    list = list.filter((x) => x.id !== id);
    paint();
    deps.changed();
    focus(next);
  }

  return {
    /** Show this list (newest first, as Rust sends it). `sweptCount`: how many the start-up sweep deleted. */
    show(summaries, sweptCount = swept) {
      list = summaries;
      swept = sweptCount;
      paint();
    },
    get count() { return list.length; },
    /** The first card takes focus, so Return goes straight back to work. */
    focusFirst() { if (list.length) focus(list[0].id); },
    summary: find,
    /** Drag over the window (dropzone.js's kinds): the strip says what a drop would do. */
    drag(kind) {
      const st = nodes.strip;
      st.classList.toggle('border-solid', kind != null);
      st.classList.toggle('border-dashed', kind == null);
      st.classList.toggle('border-accent', kind === 'video');
      st.classList.toggle('bg-accent/8', kind === 'video');
      st.classList.toggle('border-text-secondary', kind != null && kind !== 'video');
      const text = st.querySelector('[data-strip-text]');
      if (text) text.textContent = STRIP[kind] ?? STRIP.idle;
    },
  };
}

const STRIP = {
  idle: 'Drop a video to start a new project',
  video: 'Drop to open',
  'audio-first': 'Add the video first',
  no: 'Only video files open here',
};
