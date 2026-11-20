// StatusLine: the one place that says what the app is doing — in the toolbar, left of Magic.
// A label ("Transcribing… 42 %") plus its own small bar, so it never reads as the video's progress.
// States: idle (gone) · progress (text + bar) · message (timed, e.g. "Transcript ready", then gone).
import { eta } from './dom.js';

/**
 * Pure: what the line says while work runs. Tested in test/ui.test.mjs.
 * @param {{progress?: {stage:string, done:number, total:number}|null, partNo?: number|null,
 *          secondsLeft?: number, waiting?: boolean, magicQueued?: boolean}} s
 * @returns {{text: string, pct: number|null}} pct null = no bar
 */
export function workText({ progress, partNo, secondsLeft, waiting, magicQueued }) {
  const tail = magicQueued ? ' · Magic starts when the transcript is ready' : '';
  if (progress) {
    const pct = progress.total ? progress.done / progress.total : 0;
    const left = eta(secondsLeft);
    const time = left ? ` · ${left}` : '';
    if (progress.stage === 'download') {
      return { text: `Downloading speech model · ${Math.round(progress.total / 1e6)} MB · ${Math.round(pct * 100)} %${time}`, pct };
    }
    const part = partNo ? ` part ${partNo}` : '';
    return { text: `Transcribing${part}… ${Math.round(pct * 100)} %${time}${tail}`, pct };
  }
  if (waiting) return { text: `Transcribing…${tail}`, pct: null };
  return { text: '', pct: null };
}

/** Estimates time left from how fast `done` has moved since this stage began. */
export function makeEta(now = () => Date.now()) {
  let key = null, t0 = 0, d0 = 0;
  return (progress) => {
    if (!progress) return (key = null), NaN;
    const k = `${progress.part}:${progress.stage}`;
    if (k !== key) {
      key = k; t0 = now(); d0 = progress.done;
      return NaN;
    }
    const secs = (now() - t0) / 1000, moved = progress.done - d0;
    if (secs < 3 || moved <= 0) return NaN; // too early to be honest
    return ((progress.total - progress.done) / moved) * secs;
  };
}

/**
 * The live line. `work()` is asked for the current work text whenever nothing timed is showing.
 * @param {{box: HTMLElement, text: HTMLElement, track: HTMLElement, bar: HTMLElement}} els
 */
export function createStatusLine({ box, text, track, bar }, work) {
  let timer = null;
  const paint = (t, pct) => {
    box.classList.toggle('hidden', !t);
    box.classList.toggle('flex', !!t);
    text.textContent = t;
    track.classList.toggle('hidden', pct == null);
    bar.style.width = pct == null ? '0' : `${pct * 100}%`;
    track.setAttribute('aria-valuenow', pct == null ? '0' : String(Math.round(pct * 100)));
  };
  return {
    /** Show a message for `ms`, then fall back to the work text. */
    flash(text, ms = 3000) {
      clearTimeout(timer);
      paint(text, null);
      timer = setTimeout(() => { timer = null; this.render(); }, ms);
    },
    render() {
      const w = work();
      if (timer && w.pct == null) return; // let the timed message finish
      clearTimeout(timer);
      timer = null;
      paint(w.text, w.pct);
    },
  };
}
