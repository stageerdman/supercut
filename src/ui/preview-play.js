// Preview play: the rendered preview (preview.js: the kept spans back to back in one file) in a <video> laid over
// the source. Playing it crosses every cut with no seek and no start, the two things that freeze WebKit's picture
// (~0.3 s). It is seen from its first frame at the spot you play from (until then the source's paused frame stays,
// the same picture) and hidden again
// once the source shows where it stopped. Its time is edit time; the edit map turns it into (part, time).
// The player decides when to use it: player.js. Spec: design/timeline.md § Playback.
import { toEdit, fromEdit } from './edit-map.js';

const SLACK = 1 / 60; // s: a part's time this close past a span's end still counts as in it (a frame's rounding)
const HIDE_AFTER = 500; // ms: hide it by then even if the source never says it has sought

/**
 * @param {HTMLVideoElement} pv  a hidden video over the source (dressed by the player)
 * @param {{ convertFileSrc: (path:string)=>string, onFail: ()=>void }} on
 */
export function createPreviewPlay(pv, on) {
  let shown = null; // the preview being played: { key, file, map }
  if (pv.style) Object.assign(pv.style, { inset: '0', width: '100%', height: '100%' });
  const frames = typeof pv.requestVideoFrameCallback === 'function';
  if (!frames) pv.addEventListener('playing', () => { if (shown) pv.classList.remove('opacity-0'); });

  /** Seen from its first frame at T: an earlier one (the file's first, before the seek lands) would flash. */
  function revealAt(p, T) {
    if (!frames) return;
    const check = (_, m) => {
      if (shown !== p) return;
      if (m.mediaTime >= T - SLACK) pv.classList.remove('opacity-0');
      else pv.requestVideoFrameCallback(check);
    };
    pv.requestVideoFrameCallback(check);
  }

  return {
    /** The preview being played, or null. */
    get shown() { return shown; },
    get element() { return pv; },
    /** Edit time of part `id` at its time `t` in preview `p`; null where `p` doesn't have it (a cut). */
    editTime: (p, id, t) => toEdit(p.map, id, t, SLACK),
    /** Play preview `p` from edit time `T`, as loud as the source was. */
    start(p, T, { muted, volume }) {
      shown = p;
      pv.classList.add('opacity-0'); // played again right after a stop: not its old frame
      if (pv.dataset.path !== p.file) {
        pv.src = on.convertFileSrc(p.file);
        pv.dataset.path = p.file;
      }
      Object.assign(pv, { muted, volume });
      const go = () => {
        if (shown !== p) return;
        pv.currentTime = T;
        revealAt(p, T);
        pv.play()?.catch?.(() => shown === p && on.onFail());
      };
      pv.readyState >= 1 ? go() : pv.addEventListener('loadedmetadata', go, { once: true });
    },
    seek(T) { pv.currentTime = Math.max(0, Math.min(T, pv.duration || T)); }, // seen already: it plays on from there
    /** Where edit time `T` (the preview's own by default) is: { part, t }. */
    where: (T = pv.currentTime) => fromEdit(shown.map, T),
    /** Stop playing it; `source` is the video that shows the spot now: it is hidden once that one has sought. */
    stop(source) {
      shown = null;
      pv.pause();
      let timer = 0;
      const hide = () => {
        clearTimeout(timer);
        if (!shown) pv.classList.add('opacity-0');
      };
      source.addEventListener('seeked', hide, { once: true });
      timer = setTimeout(hide, HIDE_AFTER);
    },
  };
}
