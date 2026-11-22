// PlayerView: plays the parts back to back (part 1 runs into part 2), skipping the cuts.
// No controls on the video itself; the transport row is the only one.
// Skipping is checked every frame (requestVideoFrameCallback; timeupdate's 4×/s would run into a cut).
// Seamless cuts: a seek in a playing <video> holds the old frame while it decodes from the last keyframe (the hitch
// at every cut). So a second, hidden <video> (the spare) seeks to the far side of the next cut ahead of time; at the
// cut the two swap: the spare plays on from a frame it already has, the old one pauses and becomes the spare.
// Spec: design/timeline.md § Playback.
import { clock } from './dom.js';
import { skipTarget, cutHere, firstKept, editedTime, editedLength } from './playback.js';
import { createPlayClock } from './play-clock.js';
import { cutsOf } from './cuts.js';

const EPS = 1e-6;
export const LEAD = 2; // s: how far ahead of a cut (or a part's end) the spare gets ready
const STANDBY = ['absolute', 'opacity-0', 'pointer-events-none'];

/**
 * @param {HTMLVideoElement} first  the visible video; a hidden twin is made next to it
 * @param {{parts: () => Array<{id:number,path:string,name:string,duration:number}>, cuts: () => Array,
 *          onTime: (i:number, t:number)=>void, onFrame?: (i:number, t:number)=>void, onPart: (i:number)=>void, onError: (name:string)=>void}} on
 */
export function createPlayer(first, on) {
  const { convertFileSrc } = window.__TAURI__.core;
  let video = first; // the one you see and hear
  let spare = first.cloneNode ? first.cloneNode(false) : null; // hidden, waits on the far side of the next cut
  let ready = null; // { path, t, done } what the spare is seeking to / holds
  let current = 0;
  let through = null; // a cut you chose to play from inside: it plays, the next ones skip
  let selfSeek = false; // our own jump over a cut, not the user's seek

  if (spare) {
    spare.removeAttribute('id');
    standby(spare);
    first.after(spare);
  }

  /** Dress `n` as the hidden spare (muted, out of the tab order and the accessibility tree). */
  function standby(n) {
    n.classList.add(...STANDBY);
    n.muted = true;
    n.tabIndex = -1;
    n.setAttribute('aria-hidden', 'true');
  }

  const part = () => on.parts()[current];
  const len = () => video.duration || part()?.duration || 0;

  function load(n, p) {
    if (n.dataset.path === p.path) return;
    n.src = convertFileSrc(p.path);
    n.dataset.path = p.path;
  }

  function show(i, at = 0, play = false) {
    const p = on.parts()[i];
    if (!p) return;
    current = i;
    load(video, p);
    const go = () => {
      video.currentTime = at;
      if (play) video.play();
    };
    video.readyState >= 1 ? go() : video.addEventListener('loadedmetadata', go, { once: true });
    on.onPart(i);
  }

  /** The next part from its first kept moment: { i, t }, or null when the rest is all cut. */
  function nextKept() {
    const parts = on.parts();
    for (let i = current + 1; i < parts.length; i++) {
      const at = firstKept(on.cuts(), parts[i].id, parts[i].duration || Infinity);
      if (at != null) return { i, t: at };
    }
    return null;
  }

  /** Where playing lands after the cut at time `from` (and any cut touching it): { i, t }, or null (stop). */
  function landing(from) {
    const id = part().id, cuts = on.cuts();
    let to = from, r = skipTarget(id, to, cuts, len(), through);
    for (let n = 0; r?.t != null && n < 1000; n++) { to = r.t; r = skipTarget(id, to, cuts, len(), through); }
    return r?.end || to >= len() - EPS ? nextKept() : { i: current, t: to };
  }

  /** Get the spare ready for the next jump, when it's under LEAD seconds away. */
  function prepare(t) {
    if (!spare) return;
    const ahead = cutsOf(on.cuts(), part().id).find((c) => c.s > t + EPS);
    const at = Math.min(ahead?.s ?? Infinity, len());
    if (!(at - t <= LEAD)) return;
    const dest = at >= len() - EPS && !ahead ? nextKept() : landing(at);
    const p = dest && on.parts()[dest.i];
    if (!p || (ready && ready.path === p.path && Math.abs(ready.t - dest.t) < EPS)) return;
    const want = (ready = { path: p.path, t: dest.t, done: false });
    const n = spare;
    load(n, p);
    const go = () => { if (ready === want && n === spare) n.currentTime = want.t; };
    n.readyState >= 1 ? go() : n.addEventListener('loadedmetadata', go, { once: true });
  }

  /** Go to `dest` while playing: swap to the spare if it holds that frame, else seek. */
  function jump(dest) {
    const p = on.parts()[dest.i];
    if (spare && ready?.done && ready.path === p.path && Math.abs(ready.t - dest.t) < EPS) return swap(dest);
    if (dest.i === current) { selfSeek = true; video.currentTime = dest.t; }
    else show(dest.i, dest.t, true);
  }

  function swap(dest) {
    const old = video;
    const rate = old.playbackRate, muted = old.muted, volume = old.volume, focused = document.activeElement === old;
    video = spare;
    spare = old;
    ready = null;
    const moved = dest.i !== current;
    current = dest.i;
    video.classList.remove(...STANDBY);
    Object.assign(video, { playbackRate: rate, muted, volume });
    video.tabIndex = old.tabIndex;
    video.removeAttribute('aria-hidden');
    video.setAttribute('aria-label', old.getAttribute('aria-label') ?? 'Video player');
    video.id = old.id;
    old.removeAttribute('id');
    old.pause(); // not the one you see now: its pause event is ignored
    standby(old);
    if (focused) video.focus?.();
    glideClock.reset();
    if (moved) on.onPart(current);
    on.onTime(current, video.currentTime);
    video.play()?.catch?.(() => { // it won't play: fall back to seeking the one we had
      [video, spare] = [spare, video];
      standby(spare);
      video.classList.remove(...STANDBY);
      video.muted = muted;
      video.currentTime = dest.t;
      video.play();
    });
  }

  /** Every frame while playing: jump over the cut ahead (and any cut touching it); get the spare ready. */
  function tick() {
    if (video.paused || !part()) return;
    const id = part().id, cuts = on.cuts(), t = video.currentTime;
    if (through && !(through.s <= t && t < through.e)) through = null;
    if (!skipTarget(id, t, cuts, len(), through)) return prepare(t);
    const dest = landing(t);
    dest ? jump(dest) : video.pause();
  }

  // One loop at a time: each play starts a new one and the old one (maybe waiting on the other video) lapses.
  let run = 0;
  const loop = (r = ++run) => {
    if (r !== run || video.paused) return;
    tick();
    const again = () => loop(r);
    typeof video.requestVideoFrameCallback === 'function' ? video.requestVideoFrameCallback(again) : requestAnimationFrame(again);
  };

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

  // Both videos get the listeners; only the visible one's events count (the spare's seeked marks it ready).
  const listen = (k, f, spareF) => {
    for (const n of spare ? [first, spare] : [first]) n.addEventListener(k, () => (n === video ? f() : spareF?.(n)));
  };
  const durationOf = (n) => {
    const p = on.parts().find((q) => q.path === n.dataset.path);
    if (p && n.duration) p.duration = n.duration;
  };
  listen('loadedmetadata', () => {
    durationOf(video);
    on.onTime(current, video.currentTime);
    on.onPart(current);
  }, durationOf);
  listen('timeupdate', () => on.onTime(current, video.currentTime));
  listen('seeked', () => {
    if (!selfSeek) meant();
    selfSeek = false;
    glideClock.reset(); // a seek or a skipped cut: the line goes straight there
    on.onTime(current, video.currentTime);
  }, (n) => {
    if (ready && n.dataset.path === ready.path && Math.abs(n.currentTime - ready.t) < 0.05) ready.done = true;
  });
  listen('play', () => { meant(); paintPlay(true); loop(++run); startGlide(); });
  listen('pause', () => paintPlay(false));
  listen('ended', () => { const d = nextKept(); d ? jump(d) : video.pause(); });
  listen('error', () => {
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

  const empty = (n) => {
    n.pause();
    n.removeAttribute('src');
    delete n.dataset.path;
    n.load();
  };

  return {
    show,
    step,
    tick, // for tests
    get current() { return current; },
    get time() { return video.currentTime || 0; },
    get playing() { return !video.paused; },
    get element() { return video; }, // for tests
    toggle: () => (video.paused ? video.play() : video.pause()),
    play: () => video.play(),
    pause: () => video.pause(),
    /** A part was put back at index `i` (undo of a removal). */
    added(i) {
      ready = null;
      if (on.parts().length === 1) show(0);
      else if (i <= current) current++;
    },
    /** The part at index `i` was removed from the list. */
    removed(i) {
      ready = null;
      const parts = on.parts();
      if (!parts.length) {
        empty(video);
        if (spare) empty(spare);
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
