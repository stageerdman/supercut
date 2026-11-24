// The transcript panel before there are words, and after new audio (design/transcript-panel.md §6):
// Generate transcript (naming the audio it will hear) · its progress in place · Couldn't transcribe + Try again ·
// the one-time "New audio" hint row with Regenerate, and the ↻ by search. Pure views first, then the DOM.
// Tested in test/audio.test.mjs.
import { el, eta } from './dom.js';
import { heardFrom } from './audio.js';
import { wordsState, stale } from './transcripts.js';

const RAISED = 'h-8 rounded-[10px] bg-raised px-4 font-semibold text-text hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Pure: "Transcribing… 42 %" / the model download, from Rust's progress for this part (or none yet). */
export function progressText(progress, secondsLeft, verb = 'Transcribing') {
  if (!progress) return { text: `${verb}…`, pct: null, eta: '' };
  const pct = progress.total ? progress.done / progress.total : 0;
  const p = Math.round(pct * 100);
  if (progress.stage === 'download') return { text: `Downloading speech model · ${Math.round(progress.total / 1e6)} MB · ${p} %`, pct, eta: eta(secondsLeft) };
  return { text: `${verb}… ${p} %`, pct, eta: eta(secondsLeft) };
}

/**
 * Pure: the block a part without words shows. null when it has words.
 * @returns {{kind:'generate'|'working'|'failed', text?:string, caption?:string, button?:string, pct?:number|null, eta?:string}|null}
 */
export function generateView(part, progress, secondsLeft) {
  const state = wordsState(part);
  if (state === 'generate') return { kind: 'generate', button: 'Generate transcript', caption: heardFrom(part) };
  if (state === 'failed') return { kind: 'failed', text: "Couldn't transcribe this part.", button: 'Try again' };
  if (state === 'working') return { kind: 'working', ...progressText(progress?.part === part.id ? progress : null, secondsLeft) };
  return null;
}

/**
 * Pure: the hint row under the header. `on`: the one-time offer after a swap is still up (not dismissed).
 * Regenerating shows its progress (even if dismissed), no buttons. null = no row.
 */
export function hintView(parts, { on, progress, secondsLeft }) {
  const going = parts.find((p) => wordsState(p) === 'regenerating');
  if (going) return { ...progressText(progress?.part === going.id ? progress : null, secondsLeft, 'Regenerating'), actions: false };
  if (on && parts.some(stale)) return { text: 'New audio. A fresh transcript may be more accurate.', pct: null, eta: '', actions: true };
  return null;
}

/** Pure: the ↻ by search: shown while any words are from other audio; disabled while regenerating. */
export function regenerateIcon(parts) {
  const busy = parts.some((p) => wordsState(p) === 'regenerating');
  return { visible: busy || parts.some(stale), disabled: busy };
}

function bar(pct) {
  const track = el('div', 'h-1 w-24 overflow-hidden rounded-full bg-bg');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Transcription progress');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(Math.round((pct ?? 0) * 100)));
  const fill = el('div', 'h-full rounded-full bg-accent transition-[width]');
  fill.style.width = `${(pct ?? 0) * 100}%`;
  track.append(fill);
  return track;
}

/** The block for a part with no words, as an element (the transcript renders it where the words would be). */
export function generateBlock(view, { id, single, onPress }) {
  const box = el('div', `flex flex-col gap-2 ${single ? 'items-center pt-[40%] text-center' : 'items-start pt-2'}`);
  box.setAttribute('aria-live', 'polite');
  if (view.kind === 'working') {
    box.append(el('p', 'tabular-nums text-text-secondary', view.text));
    if (view.pct != null) box.append(bar(view.pct));
    if (view.eta) box.append(el('p', 'text-[12px] text-text-secondary', view.eta));
    return box;
  }
  if (view.text) box.append(el('p', 'text-text-secondary', view.text));
  const btn = el('button', RAISED, view.button);
  btn.onclick = onPress;
  box.append(btn);
  if (view.caption) {
    const cap = el('p', 'text-[12px] text-text-secondary', view.caption);
    cap.id = `generate-from-${id}`;
    btn.setAttribute('aria-describedby', cap.id);
    box.append(cap);
  }
  return box;
}

/** Paint the hint row (#transcript-hint) from a hintView. */
export function paintHint(row, view, { onRegenerate, onDismiss }) {
  row.classList.toggle('hidden', !view);
  row.classList.toggle('flex', !!view);
  if (!view) return row.replaceChildren();
  const text = el('p', 'min-w-0 flex-1 truncate tabular-nums', view.text);
  const parts = [text];
  if (view.pct != null) parts.push(bar(view.pct));
  if (view.actions) {
    const go = el('button', 'shrink-0 rounded-md px-1 font-semibold text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent', 'Regenerate');
    go.onclick = onRegenerate;
    const x = el('button', 'flex size-6 shrink-0 items-center justify-center rounded text-text-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-accent', '✕');
    x.setAttribute('aria-label', 'Dismiss');
    x.onclick = onDismiss;
    parts.push(go, x);
  }
  row.replaceChildren(...parts);
}
