// One Settings section (design/settings.md): title, an optional aside on the right, an optional hint, a body.
// The gear panel only stacks sections; a Settings tab later mounts the same ones.

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};

/** → { node, setAside(text), setHint(text) }. Sections after the first get the hairline (16 + 1 + 16 pt). */
export function section({ title, aside = '', hint = '', body = null, id = '' }) {
  const node = el('section', 'mt-4 space-y-2 border-t border-hairline pt-4');
  const head = el('div', 'flex items-baseline justify-between gap-3');
  const h = el('h3', 'font-semibold', title);
  if (id) h.id = `${id}-title`;
  const asideNode = el('span', 'shrink-0 tabular-nums text-text-secondary');
  const hintNode = el('p', 'text-text-secondary');
  if (id) hintNode.id = `${id}-hint`;
  head.append(h, asideNode);
  node.append(head, hintNode);
  if (body) node.append(body);

  const setAside = (text) => { asideNode.textContent = text; asideNode.classList.toggle('hidden', !text); };
  const setHint = (text) => { hintNode.textContent = text; hintNode.classList.toggle('hidden', !text); };
  setAside(aside);
  setHint(hint);
  return { node, setAside, setHint };
}

export { el };
