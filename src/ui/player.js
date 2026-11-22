// PlayerView: one <video> that plays the parts back to back (part 1 runs into part 2).
// No controls on the video itself; the transport row is the only one.
import { clock } from './dom.js';

/**
 * @param {HTMLVideoElement} video
 * @param {{parts: () => Array<{path:string,name:string,duration:number}>,
 *          onTime: (i:number, t:number)=>void, onPart: (i:number)=>void, onError: (name:string)=>void}} on
 */
export function createPlayer(video, on) {
  const { convertFileSrc } = window.__TAURI__.core;
  let current = 0;

  function show(i, at = 0, play = false) {
    const p = on.parts()[i];
    if (!p) return;
    current = i;
    if (video.dataset.path !== p.path) {
      video.src = convertFileSrc(p.path);
      video.dataset.path = p.path;
    }
    const go = () => {
      video.currentTime = at;
      if (play) video.play();
    };
    video.readyState >= 1 ? go() : video.addEventListener('loadedmetadata', go, { once: true });
    on.onPart(i);
  }

  video.addEventListener('loadedmetadata', () => {
    const p = on.parts()[current];
    if (p) p.duration = video.duration;
    on.onTime(current, video.currentTime);
    on.onPart(current);
  });
  video.addEventListener('timeupdate', () => on.onTime(current, video.currentTime));
  video.addEventListener('play', () => paintPlay(true));
  video.addEventListener('pause', () => paintPlay(false));
  video.addEventListener('ended', () => current + 1 < on.parts().length && show(current + 1, 0, true));
  video.addEventListener('error', () => {
    const p = on.parts()[current];
    if (p && video.getAttribute('src')) on.onError(p.name);
  });

  function paintPlay(playing) {
    const btn = document.getElementById('play');
    btn.textContent = playing ? '❚❚' : '▶';
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  /** Move by `d` seconds, crossing into the neighbouring part when needed. */
  function step(d) {
    const parts = on.parts();
    const t = video.currentTime + d;
    if (t < 0 && current > 0) return show(current - 1, Math.max(0, (parts[current - 1].duration || 0) + t));
    if (t > (video.duration || 0) && current + 1 < parts.length) return show(current + 1, t - video.duration);
    video.currentTime = Math.max(0, Math.min(t, video.duration || 0));
  }

  return {
    show,
    step,
    get current() { return current; },
    toggle: () => (video.paused ? video.play() : video.pause()),
    play: () => video.play(),
    pause: () => video.pause(),
    /** A part was put back at index `i` (undo of a removal). */
    added(i) {
      if (on.parts().length === 1) show(0);
      else if (i <= current) current++;
    },
    /** The part at index `i` was removed from the list. */
    removed(i) {
      const parts = on.parts();
      if (!parts.length) {
        video.pause();
        video.removeAttribute('src');
        delete video.dataset.path;
        video.load();
        current = 0;
      } else if (i === current) show(0);
      else if (i < current) current--;
    },
    /** Readout across all parts: "01:12" / "24:10". */
    times() {
      const parts = on.parts();
      const before = parts.slice(0, current).reduce((s, p) => s + (p.duration || 0), 0);
      const total = parts.reduce((s, p) => s + (p.duration || 0), 0);
      return { at: clock(before + (video.currentTime || 0)), total: clock(total) };
    },
  };
}
