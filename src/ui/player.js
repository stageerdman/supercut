// PlayerView: one <video> that plays the parts back to back (part 1 runs into part 2), skipping the cuts.
// No controls on the video itself; the transport row is the only one.
// Skipping is checked every frame (requestVideoFrameCallback; timeupdate's 4×/s would run into a cut).
import { clock } from './dom.js';
import { skipTarget, cutHere, firstKept, editedTime, editedLength } from './playback.js';
import { createPlayClock } from './play-clock.js';

/**
 * @param {HTMLVideoElement} video
 * @param {{parts: () => Array<{id:number,path:string,name:string,duration:number}>, cuts: () => Array,
 *          onTime: (i:number, t:number)=>void, onFrame?: (i:number, t:number)=>void, onPart: (i:number)=>void, onError: (name:string)=>void}} on
 */
export function createPlayer(video, on) {
  const { convertFileSrc } = window.__TAURI__.core;
  let current = 0;
  let through = null; // a cut you chose to play from inside: it plays, the next ones skip
  let selfSeek = false; // our own jump over a cut, not the user's seek

  const part = () => on.parts()[current];
  const len = () => video.duration || part()?.duration || 0;

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

  /** The next part from its first kept moment, or stop: the rest is all cut. */
  function next(play) {
    const parts = on.parts();
    for (let i = current + 1; i < parts.length; i++) {
      const at = firstKept(on.cuts(), parts[i].id, parts[i].duration || Infinity);
      if (at != null) return show(i, at, play);
    }
    video.pause();
  }

  /** Every frame while playing: jump over the cut ahead (and any cut touching it). */
  function tick() {
    if (video.paused || !part()) return;
    const id = part().id, cuts = on.cuts(), t = video.currentTime;
    if (through && !(through.s <= t && t < through.e)) through = null;
    let to = t, r = skipTarget(id, t, cuts, len(), through);
    for (let n = 0; r?.t != null && n < 1000; n++) { to = r.t; r = skipTarget(id, to, cuts, len(), through); }
    if (r?.end) next(true);
    else if (to !== t) { selfSeek = true; video.currentTime = to; }
  }

  const frames = typeof video.requestVideoFrameCallback === 'function';
  function loop() {
    if (video.paused) return;
    tick();
    frames ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
  }

  // The playhead moves every display frame while playing, on a smooth clock (not on timeupdate's 4×/s steps).
  const glideClock = createPlayClock();
  let frameReq = 0;
  function glide() {
    frameReq = 0;
    if (video.paused) return;
    const t = glideClock.read(video.currentTime, performance.now(), { rate: video.playbackRate, key: current });
    on.onFrame?.(current, t);
    frameReq = requestAnimationFrame(glide);
  }
  const startGlide = () => { glideClock.reset(); if (!frameReq && globalThis.requestAnimationFrame) frameReq = requestAnimationFrame(glide); };

  /** You start (or seek) inside a cut: you asked to hear it. */
  const meant = () => { through = part() ? cutHere(on.cuts(), part().id, video.currentTime) ?? null : null; };

  video.addEventListener('loadedmetadata', () => {
    const p = part();
    if (p) p.duration = video.duration;
    on.onTime(current, video.currentTime);
    on.onPart(current);
  });
  video.addEventListener('timeupdate', () => on.onTime(current, video.currentTime));
  video.addEventListener('seeked', () => {
    if (!selfSeek) meant();
    selfSeek = false;
    glideClock.reset(); // a seek or a skipped cut: the line goes straight there
    on.onTime(current, video.currentTime);
  });
  video.addEventListener('play', () => { meant(); paintPlay(true); loop(); startGlide(); });
  video.addEventListener('pause', () => paintPlay(false));
  video.addEventListener('ended', () => next(true));
  video.addEventListener('error', () => {
    const p = part();
    if (p && video.getAttribute('src')) on.onError(p.name);
  });

  function paintPlay(playing) {
    const btn = document.getElementById('play');
    if (!btn) return;
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
    tick, // for tests
    get current() { return current; },
    get time() { return video.currentTime || 0; },
    get playing() { return !video.paused; },
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
    /** Readout in edited time (cuts out, parts back to back): "01:12" / "23:40"; `original` is the uncut length. */
    times() {
      const parts = on.parts(), cuts = on.cuts();
      return {
        at: clock(editedTime(parts, cuts, current, video.currentTime || 0)),
        total: clock(editedLength(parts, cuts)),
        original: clock(parts.reduce((s, p) => s + (p.duration || 0), 0)),
      };
    },
  };
}
