// PlayerView: plays the parts back to back (part 1 runs into part 2), skipping the cuts.
// No controls on the video itself; the transport row is the only one.
// Skipping is checked every frame (requestVideoFrameCallback; timeupdate's 4×/s would run into a cut).
// Seamless cuts: a second, hidden <video> (the spare) plays along silently, in step on the far side of the next cut;
// at the cut the two swap (shown and heard ↔ hidden and silent), so nothing seeks or starts at the cut. Why it is
// done this way, and what stalls WebKit's picture: twin-sync.js. Spec: design/timeline.md § Playback.
import { clock } from './dom.js';
import { skipTarget, cutHere, firstKept, editedTime, editedLength } from './playback.js';
import { createPlayClock } from './play-clock.js';
import { cutsOf } from './cuts.js';
import { twinStep, drift, learnLag, QUIET, TOLERANCE } from './twin-sync.js';

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
  // What the spare is for: { path, t } the far side of the cut, `at` where the one you see leaves it.
  let ready = null;
  const lags = { start: 0.035, seek: 0 }; // s the spare's clock runs late after a play() / a seek (WebKit's, learned)
  let sought = false; // the spare was seeked to get in step: learn lags.seek from where it lands
  let swapping = false; // a swap is due within this frame
  let current = 0;
  let through = null; // a cut you chose to play from inside: it plays, the next ones skip
  let selfSeek = false; // our own jump over a cut, not the user's seek

  if (spare) {
    spare.removeAttribute('id');
    standby(spare);
    first.after(spare);
  }

  /** Dress `n` as the hidden spare (inaudible, out of the tab order and the accessibility tree). */
  function standby(n) {
    n.classList.add(...STANDBY);
    n.volume = QUIET;
    n.tabIndex = -1;
    n.setAttribute('aria-hidden', 'true');
  }

  /** The spare's cue is void (you seeked or edited): it gets in step again for the next cut. */
  const idle = () => { ready = null; sought = false; };

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

  /** The next jump, when it's under LEAD seconds ahead of `t`: { at, dest, p }, or null. */
  function upcoming(t) {
    const ahead = cutsOf(on.cuts(), part().id).find((c) => c.s > t + EPS);
    const at = Math.min(ahead?.s ?? Infinity, len());
    if (!(at - t <= LEAD)) return null;
    const dest = at >= len() - EPS && !ahead ? nextKept() : landing(at);
    const p = dest && on.parts()[dest.i];
    return p ? { at, dest, p } : null;
  }

  const holds = (r, p, t) => !!r && r.path === p.path && Math.abs(r.t - t) < EPS;

  /** Every frame before a cut: get the spare in step on the far side of it (twinStep says how). */
  function prepare(t) {
    if (!spare) return;
    const next = upcoming(t);
    if (!next) return;
    if (!holds(ready, next.p, next.dest.t) || Math.abs(ready.at - next.at) > EPS) {
      ready = { path: next.p.path, t: next.dest.t, at: next.at };
      sought = false;
      load(spare, next.p);
    }
    const n = spare;
    const busy = n.seeking || n.readyState < 2;
    if (sought && !busy && !n.paused) { // just landed: aim better next time
      lags.seek = learnLag(lags.seek, drift(ready.at, ready.t, t, n.currentTime));
      sought = false;
    }
    const step = twinStep({ at: ready.at, to: ready.t, t }, { paused: n.paused, busy, time: n.currentTime }, lags);
    if (step.do === 'park') { n.pause(); n.currentTime = step.time; }
    else if (step.do === 'seek') { n.currentTime = step.time; sought = true; }
    else if (step.do === 'play') {
      n.playbackRate = video.playbackRate; // set now: changing it while playing stalls the picture
      n.play()?.catch?.(idle); // it won't play: the cut seeks instead
    }
  }

  /** Go to `dest` while playing: swap to the spare if it runs in step on the far side, else seek. */
  function jump(dest) {
    if (swapping) return;
    const p = on.parts()[dest.i];
    if (spare && ready && !spare.paused && !spare.seeking && holds(ready, p, dest.t)) {
      const off = drift(ready.at, ready.t, video.currentTime, spare.currentTime);
      if (Math.abs(off) <= TOLERANCE) return swapOnTime(dest, ready.at - video.currentTime);
    }
    idle();
    if (dest.i === current) { selfSeek = true; video.currentTime = dest.t; }
    else show(dest.i, dest.t, true);
  }

  /** The cut is `ahead` s of source time away (under a frame): swap right when it comes, not a frame early. */
  function swapOnTime(dest, ahead) {
    const ms = (ahead / (video.playbackRate || 1)) * 1000;
    if (ms < 4) return swap(dest);
    swapping = true;
    setTimeout(() => { swapping = false; if (!video.paused) swap(dest); }, ms);
  }

  function swap(dest) {
    const old = video;
    const muted = old.muted, volume = old.volume, focused = document.activeElement === old;
    video = spare;
    spare = old;
    ready = null;
    const moved = dest.i !== current;
    current = dest.i;
    video.classList.remove(...STANDBY);
    Object.assign(video, { muted, volume });
    video.tabIndex = old.tabIndex;
    video.removeAttribute('aria-hidden');
    video.setAttribute('aria-label', old.getAttribute('aria-label') ?? 'Video player');
    video.id = old.id;
    old.removeAttribute('id');
    standby(old); // it plays on, hidden and inaudible, as the spare for the next cut
    if (focused) video.focus?.();
    meant(); // a spare a hair short of the far side plays that hair, not seeks over it (the seek is the hitch)
    glideClock.reset();
    if (moved) on.onPart(current);
    on.onTime(current, video.currentTime);
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
    idle(); // the spare's cue was timed to where you were
    glideClock.reset(); // a seek or a skipped cut: the line goes straight there
    on.onTime(current, video.currentTime);
  }, (n) => {
    if (ready && n.dataset.path === ready.path && Math.abs(n.currentTime - ready.park) < 0.05) ready.done = true;
  });
  listen('play', () => { meant(); paintPlay(true); loop(++run); startGlide(); });
  listen('pause', () => {
    if (spare && !spare.paused) spare.pause(); // it only plays along while you do
    paintPlay(false);
  });
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
    get lag() { return lag; }, // for tests and measuring
    toggle: () => (video.paused ? video.play() : video.pause()),
    play: () => video.play(),
    pause: () => video.pause(),
    /** A part was put back at index `i` (undo of a removal). */
    added(i) {
      idle();
      if (on.parts().length === 1) show(0);
      else if (i <= current) current++;
    },
    /** The part at index `i` was removed from the list. */
    removed(i) {
      idle();
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
