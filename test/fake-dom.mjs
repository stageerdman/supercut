// A small fake DOM: enough for the timeline, the notes lane and the note card (no browser in the tests).
const camel = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
function matches(n, simple) {
  if (simple === '*') return true;
  const attr = simple.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
  if (attr) { const v = n.dataset?.[camel(attr[1])]; return v != null && (attr[2] == null || String(v) === attr[2]); }
  const plain = simple.match(/^\[([\w-]+)(?:=([\w-]+))?\]$/);
  if (plain) { const v = n.attrs?.[plain[1]]; return v != null && (plain[2] == null || String(v) === plain[2]); }
  if (simple.startsWith('#')) return n.id === simple.slice(1);
  return n.tag === simple;
}
const matchesAny = (n, sel) => sel.split(',').some((s) => matches(n, s.trim()));

export function makeDocument() {
  const doc = { activeElement: null, listeners: {} };
  doc.addEventListener = (k, f) => (doc.listeners[k] ??= []).push(f);
  doc.removeEventListener = (k, f) => { doc.listeners[k] = (doc.listeners[k] ?? []).filter((g) => g !== f); };
  const node = (tag = 'div') => {
    const n = {
      tag, id: '', title: '', value: '', disabled: false, dataset: {}, attrs: {}, children: [], parent: null, listeners: {},
      style: {}, classes: new Set(), tabIndex: -1, clientWidth: 800, scrollLeft: 0, _text: '',
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); this.children = []; },
      get className() { return [...this.classes].join(' '); },
      set className(v) { this.classes = new Set(String(v).split(' ').filter(Boolean)); },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; },
      append(...c) { for (const x of c) { x.parent?.children && x.parent !== this && x.parent.children.splice(x.parent.children.indexOf(x), 1); x.parent = this; this.children.push(x); } },
      prepend(...c) { for (const x of c) x.parent = this; this.children.unshift(...c); },
      insertBefore(x, ref) { x.parent = this; this.children.splice(this.children.indexOf(ref), 0, x); },
      replaceChildren(...c) { this.children.forEach((x) => { x.parent = null; }); this.children = []; this.append(...c); },
      remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } },
      contains(x) { for (; x; x = x.parent) if (x === this) return true; return false; },
      closest(sel) { for (let x = this; x; x = x.parent) if (matchesAny(x, sel)) return x; return null; },
      all() { return this.children.flatMap((c) => [c, ...c.all()]); },
      querySelectorAll(sel) {
        const direct = sel.startsWith(':scope > ');
        const parts = (direct ? sel.slice(9) : sel).split(' ');
        const last = parts.pop();
        return (direct ? this.children : this.all()).filter((d) => {
          if (!matchesAny(d, last)) return false;
          let x = d.parent;
          for (let k = parts.length - 1; k >= 0; k--) {
            while (x && x !== this && !matchesAny(x, parts[k])) x = x.parent;
            if (!x || x === this) return false;
            x = x.parent;
          }
          return true;
        });
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
      addEventListener(k, f) { (this.listeners[k] ??= []).push(f); },
      /** Bubble an event from this node up (and to the document's listeners). */
      fire(kind, e = {}) {
        let stopped = false;
        const ev = { preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { stopped = true; }, button: 0, pointerId: 1, target: this, ...e };
        for (let x = this; x && !stopped; x = x.parent) {
          x.listeners[kind]?.forEach((f) => f(ev));
          if (`on${kind}` in x && typeof x[`on${kind}`] === 'function') x[`on${kind}`](ev);
        }
        if (!stopped) doc.listeners[kind]?.forEach((f) => f(ev));
        return ev;
      },
      click() { this.fire('click'); },
      focus() { doc.activeElement = this; this.fire('focusin'); },
      blur() { if (doc.activeElement === this) doc.activeElement = null; },
      select() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
      getContext: () => new Proxy({}, { get: (_, k) => (k === 'measureText' ? (t) => ({ width: t.length * 5.5 }) : () => {}), set: () => true }),
    };
    n.classList = {
      toggle: (c, on = !n.classes.has(c)) => (on ? n.classes.add(c) : n.classes.delete(c)),
      add: (...c) => c.forEach((x) => n.classes.add(x)), remove: (...c) => c.forEach((x) => n.classes.delete(x)), contains: (c) => n.classes.has(c),
    };
    return n;
  };
  doc.createElement = node;
  doc.body = node('body');
  return doc;
}

/** The part of a cssText or style value in points: "top:32px" → 32. */
export const px = (n, k) => +(n.style[k] ?? n.style.cssText?.match(new RegExp(`(?:^|;)${k}:(-?[\\d.]+)px`))?.[1]);
/** A node's z-[n] class. */
export const z = (n) => +[...n.classes].find((c) => c.startsWith('z-['))?.slice(3, -1);
