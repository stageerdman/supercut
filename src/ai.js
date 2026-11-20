// The Claude Code connection — the only file it needs to touch on the UI side.
// Contract: design/ai-slot.md. Rust side: the `auto_cut` command (src-tauri/src/autocut/).
import { clock } from './ui/dom.js';

/** Pure: the one line shown when Magic is done. "3 cuts · 00:42 → 00:31". Tested in test/ui.test.mjs. */
export function summary(cuts, parts) {
  if (!cuts.length) return 'No repeated takes or fumbles found. Nothing cut.';
  const total = parts.reduce((sum, p) => sum + p.seconds, 0);
  const cut = cuts.reduce((sum, c) => sum + (c.e - c.s), 0);
  return `${cuts.length} cut${cuts.length === 1 ? '' : 's'} · ${clock(total)} → ${clock(total - cut)}`;
}

export const runner = {
  // parts: [{ id, name, seconds, words }] → cuts: [{ part, from, to, s, e, reason }] (one per dropped line).
  async run({ parts, onStage }) {
    onStage('Choosing the best takes');
    const cuts = await window.__TAURI__.core.invoke('auto_cut', { parts });
    return { summary: summary(cuts, parts), cuts };
  },
  // The Claude call can't be stopped yet (issues.txt); it ends at its time limit and Magic drops the late result.
  cancel() {},
};
