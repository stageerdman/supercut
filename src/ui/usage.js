// Usage: Claude tokens per exported video, in the Settings panel (design/usage.md).
// Rust's token_usage → { projects: [{ name, tokens, exported, … }] newest first, total }. Only exported videos count.
import { section, el } from './settings-section.js';

/** Pure: 860 → "860", 412 318 → "412 k", 1 240 000 → "1.2 M", 12 400 000 → "12 M". */
export function formatTokens(n) {
  n = Math.max(0, Math.round(n || 0));
  if (n < 1000) return String(n);
  if (Math.round(n / 1000) < 1000) return `${Math.round(n / 1000)} k`;
  const m = n / 1e6;
  const shown = m < 9.95 ? m.toFixed(1).replace(/\.0$/, '') : String(Math.round(m));
  return `${shown} M`;
}

/** Pure: the exact figure for the tooltip and screen reader: "412,318". */
export const exactTokens = (n) => Math.round(n || 0).toLocaleString('en-US');

/** Pure: long names keep their start and end ("my-very-long-…-final"), so similar names stay apart. */
export function middleTruncate(name, max = 30) {
  if (name.length <= max) return name;
  const tail = Math.floor((max - 1) / 3);
  return `${name.slice(0, max - 1 - tail)}…${name.slice(-tail)}`;
}

/** Pure: what the section shows for a token_usage answer (or null = can't be read). */
export function usageView(answer) {
  if (!answer) return { aside: '', hint: "Usage can't be read right now.", rows: [] };
  const rows = (answer.projects ?? []).filter((p) => p.exported);
  if (!rows.length) return { aside: '', hint: 'Videos count here once you export them.', rows: [] };
  const total = rows.reduce((sum, p) => sum + (p.tokens || 0), 0);
  return {
    aside: `${formatTokens(total)} tokens`,
    hint: '',
    rows: rows.map((p) => ({ name: middleTruncate(p.name || 'Untitled'), tokens: formatTokens(p.tokens), exact: `${p.name || 'Untitled'}, ${exactTokens(p.tokens)} tokens` })),
  };
}

export const MAX_ROWS = 5;

/** → { node, refresh() }. Loading shows the title only; refresh() reads the file again (on each panel open). */
export function mountUsage(invoke) {
  const box = el('div');
  const s = section({ title: 'Usage', body: box, id: 'usage' });

  function paint(view) {
    s.setAside(view.aside);
    s.setHint(view.hint);
    box.replaceChildren();
    box.removeAttribute('tabindex');
    box.removeAttribute('aria-label');
    box.className = '';
    if (!view.rows.length) return;
    const table = el('table', 'w-full table-fixed');
    const head = el('thead', 'sr-only');
    const hr = el('tr');
    hr.append(el('th', '', 'Video'), el('th', '', 'Tokens'));
    head.append(hr);
    const body = el('tbody');
    for (const r of view.rows) {
      const tr = el('tr', 'h-6');
      tr.title = r.exact;
      const name = el('td', 'truncate text-text', r.name);
      const num = el('td', 'w-20 text-right tabular-nums text-text-secondary', r.tokens);
      num.setAttribute('aria-label', r.exact);
      tr.append(name, num);
      body.append(tr);
    }
    table.append(head, body);
    box.append(table);
    if (view.rows.length > MAX_ROWS) {
      box.className = 'max-h-[120px] overflow-y-auto focus-visible:outline-2 focus-visible:outline-accent';
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', 'Usage by video');
    }
  }

  async function refresh() {
    let answer = null;
    try { answer = await invoke('token_usage'); } catch (e) { console.error('usage', e); }
    paint(usageView(answer));
  }

  return { node: s.node, refresh };
}
