// StatusLine: the one place that says what the app is doing (transport row, right side),
// plus the 2 px progress bar under the row's top hairline.
// States: idle (empty) · progress (text + %) · message (timed, e.g. "Transcript ready").
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

/** The live line. `work()` is asked for the current work text whenever nothing timed is showing. */
export function createStatusLine(textEl, barEl, work) {
  let timer = null;
  const paint = (text, pct) => {
    textEl.textContent = text;
    barEl.style.width = pct == null ? '0' : `${pct * 100}%`;
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
