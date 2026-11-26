// Help: one button sends a debug report (design/debug-report.md). Rust's send_debug_report → { id } or a plain error.
import { section, el } from './settings-section.js';

export const HINT = "Sends the app's log, token counts per video and Mac details to the Magic Cut team. Video file names are included; your videos, sound and transcripts never are.";
export const FAILED = "Couldn't send. Check your connection and try again.";

/** Pure: the short reference people paste to us: the first 4 characters of the id, upper case. */
export const reportRef = (id) => String(id ?? '').slice(0, 4).toUpperCase();

const BUTTON = 'h-7 shrink-0 rounded-md bg-raised px-3 text-text hover:brightness-110 aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent';

/** → { node, button, reset() }. reset() clears the status line (the panel closed). */
export function mountDebugReport(invoke) {
  const button = el('button', BUTTON, 'Send debug report');
  button.type = 'button';
  const status = el('span', 'min-w-0 text-text-secondary select-text');
  status.setAttribute('role', 'status');
  const row = el('div', 'flex items-center gap-3');
  row.append(button, status);
  const s = section({ title: 'Help', hint: HINT, body: row, id: 'help' });
  button.setAttribute('aria-describedby', 'help-hint');

  let sending = false;
  async function send() {
    if (sending) return;
    sending = true;
    // aria-disabled, not disabled: a disabled button drops focus, and focus stays on it throughout (the spec)
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'Sending…';
    status.textContent = '';
    try {
      const { id } = await invoke('send_debug_report');
      status.textContent = `Sent · ref ${reportRef(id)}`;
    } catch (e) {
      console.error('debug report', e);
      status.textContent = FAILED;
    } finally {
      sending = false;
      button.removeAttribute('aria-disabled');
      button.textContent = 'Send debug report';
    }
  }
  button.onclick = send;

  return { node: s.node, button, send, reset: () => { if (!sending) status.textContent = ''; } };
}
