// PlayerView: plays the parts back to back (part 1 runs into part 2), skipping the cuts.
// No controls on the video itself; the transport row is the only one.
// Skipping is checked every frame (requestVideoFrameCallback; timeupdate's 4×/s would run into a cut).
// Seamless cuts: hidden <video>s (the twins) play along silently, each in step on the far side of an upcoming cut;
// at the cut the seen one and that twin swap (shown and heard ↔ hidden and silent), so nothing seeks or starts at
// the cut; then the old one, hidden, seeks on for the cut after (a kept stretch of ~0.8 s is time enough).
// Why it is done this way, and what stalls WebKit's picture: twin-sync.js. Spec: design/timeline.md § Playback.
import { clock } from './dom.js';
import { skipTarget, cutHere, editedTime, editedLength } from './playback.js';
import { createPlayClock } from './play-clock.js';
import { createJumps } from './jumps.js';
import { twinStep, drift, parked, seekLoss, QUIET, TOLERANCE, SEEK_LAG } from './twin-sync.js';

const EPS = 1e-6;
// After a seek lands, a twin's clock runs ~0.3 s, stands still ~0.3 s, then runs steady: judge it only after this.
const SETTLE_MS = 800;
export const LEAD = 3; // s: how far ahead of a cut (or a part's end) a twin gets ready (room for two seeks)
// Hidden twins, one per upcoming jump within LEAD. One: measured, a second playing twin starves WebKit's decoders
// (the twins never settle and every cut falls back to a seek). Kept stretches under ~FIX_BEFORE then seek.
const SPARES = 1;
const STANDBY = ['absolute', 'opacity-0', 'pointer-events-none'];

/**
 * @param {HTMLVideoElement} first  the visible video; the hidden twins are made next to it
 * @param {{parts: () => Array<{id:number,path:string,name:string,duration:number}>, cuts: () => Array,
 *          onTime: (i:number, t:number)=>void, onFrame?: (i:number, t:number)=>void, onPart: (i:number)=>void, onError: (name:string)=>void}} on
 */
export function createPlayer(first, on) {
  const { convertFileSrc } = window.__TAURI__.core;
  let video = first; // the one you see and hear
  // Hidden, each waits on the far side of an upcoming jump. `cue`: { path, t } that far side, `at` where the seen
  // one leaves for it (on the seen one's clock); `sought`: { aimed, since } its last seek, to learn seekLag from.
  let twins = makeTwins();
  const elements = [first, ...twins.map((w) => w.el)];
  let seekLag = SEEK_LAG; // s a twin falls behind where a seek while playing sends it (learned at each seek)
  let swapping = false; // a swap is due within this frame
  let current = 0;
  let through = null; // a cut you chose to play from inside: it plays, the next ones skip
  let selfSeek = false; // our own jump over a cut, not the user's seek

  function makeTwins() {
    if (!first.cloneNode) return [];
    const out = [];
    for (let k = 0, prev = first; k < SPARES; k++) {
      const el = first.cloneNode(false);
      el.removeAttribute('id');
      standby(el);
      prev.after(el);
      prev = el;
      out.push({ el, cue: null, sought: null });
    }
    return out;
  }

  /** Dress `n` as a hidden twin (inaudible, out of the tab order and the accessibility tree). */
  function standby(n) {
    n.classList.add(...STANDBY);
    n.volume = QUIET;
    n.tabIndex = -1;
    n.setAttribute('aria-hidden', 'true');
  }

  /** The twins' cues are void (you seeked or edited): they get in step again for the cuts ahead. */
  const idle = () => twins.forEach((w) => { w.cue = null; w.sought = null; });

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

  /** The timeline as playing walks it from here (built per call: parts, cuts and `through` change). */
  const jumps = () => createJumps({
    parts: on.parts(),
    cuts: on.cuts(),
    lenOf: (i) => (i === current ? len() : on.parts()[i]?.duration || 0),
    through,
    throughIn: current,
  });
  const nextKept = () => jumps().nextKept(current);
  /** Where playing lands after the cut at time `from` (and any cut touching it): { i, t }, or null (stop). */
  const landing = (from) => jumps().landing(current, from);

  const pathAt = (dest) => on.parts()[dest.i]?.path;
  const holds = (w, dest) => !!w.cue && w.cue.path === pathAt(dest) && Math.abs(w.cue.t - dest.t) < EPS;

  /** Every frame before a cut: each jump within LEAD gets a twin in step on its far side (twinStep says how). */
  function prepare(t) {
    if (!twins.length) return;
    const ahead = jumps().ahead(current, t, LEAD, twins.length);
    // A twin already on a jump keeps it; the others take the jumps left.
    const free = twins.filter((w) => !ahead.some((j) => holds(w, j.dest)));
    for (const j of ahead) follow(twins.find((w) => holds(w, j.dest)) ?? free.shift(), j, t);
  }

  /** Keep twin `w` in step for jump `j` ({ ahead, dest }), the seen one being at `t`. */
  function follow(w, j, t) {
    if (!holds(w, j.dest)) {
      w.cue = { path: pathAt(j.dest), t: j.dest.t };
      w.sought = null;
      load(w.el, on.parts()[j.dest.i]);
    }
    w.cue.at = t + j.ahead;
    const n = w.el;
    const settling = w.sought && performance.now() - w.sought.since < SETTLE_MS;
    const busy = n.seeking || n.readyState < 2 || settling;
    if (w.sought && !busy && !n.paused) { // settled: aim better next time
      seekLag = seekLoss(w.sought.aimed, (performance.now() - w.sought.since) / 1000, n.playbackRate, n.currentTime);
      w.sought = null;
    }
    const step = twinStep({ at: w.cue.at, to: w.cue.t, t }, { paused: n.paused, busy, time: n.currentTime }, seekLag);
    if (step.do === 'park') { n.pause(); n.currentTime = step.time; }
    else if (step.do === 'seek') { n.currentTime = step.time; w.sought = { aimed: step.time, since: performance.now() }; }
    else if (step.do === 'play') startTwin(n);
  }

  /** The twin that can take over at `dest` now: in step on the far side, or parked there (then this starts it). */
  function takerFor(dest) {
    const w = twins.find((x) => holds(x, dest));
    if (!w || w.el.seeking) return null;
    // Started now, its clock moves about when the cut comes (its start lag ≈ the under-a-frame wait).
    if (parked(w.cue.t, { paused: w.el.paused, time: w.el.currentTime })) {
      startTwin(w.el);
      return w;
    }
    const inStep = Math.abs(drift(w.cue.at, w.cue.t, video.currentTime, w.el.currentTime)) <= TOLERANCE;
    return !w.el.paused && inStep ? w : null;
  }

  function startTwin(n) {
    n.playbackRate = video.playbackRate; // set now: changing it while playing stalls the picture
    n.play()?.catch?.(idle); // it won't play: the next cut seeks instead
  }

  /** Go to `dest` while playing: swap to a twin if one can take over, else seek. */
  function jump(dest) {
    if (swapping) return;
    const w = takerFor(dest);
    if (w) return swapOnTime(w, dest, w.cue.at - video.currentTime);
    idle();
    if (dest.i === current) { selfSeek = true; video.currentTime = dest.t; }
    else show(dest.i, dest.t, true);
  }

  /** The cut is `ahead` s of source time away (under a frame): swap right when it comes, not a frame early. */
  function swapOnTime(w, dest, ahead) {
    const ms = (ahead / (video.playbackRate || 1)) * 1000;
    if (ms < 4) return swap(w, dest);
    swapping = true;
    setTimeout(() => { swapping = false; if (!video.paused) swap(w, dest); }, ms);
  }

  function swap(w, dest) {
    const old = video;
    const muted = old.muted, volume = old.volume, focused = document.activeElement === old;
    video = w.el;
    // The old one joins the back of the line; the other twins keep the jumps they are in step for.
    twins = [...twins.filter((x) => x !== w), { el: old, cue: null, sought: null }];
    // Their cues were timed on the old one's clock: move them onto the new one's (the cut's moment on each).
    for (const x of twins) if (x.cue) x.cue.at += dest.t - w.cue.at;
    const moved = dest.i !== current;
    current = dest.i;
    video.classList.remove(...STANDBY);
    Object.assign(video, { muted, volume });
    video.tabIndex = old.tabIndex;
    video.removeAttribute('aria-hidden');
    video.setAttribute('aria-label', old.getAttribute('aria-label') ?? 'Video player');
    video.id = old.id;
    old.removeAttribute('id');
    standby(old); // it plays on, hidden and inaudible, as a twin for a cut ahead
    if (focused) video.focus?.();
    meant(); // a twin a hair short of the far side plays that hair, not seeks over it (the seek is the hitch)
    glideClock.reset();
    if (moved) on.onPart(current);
    on.onTime(current, video.currentTime);
  }

  /** Every frame while playing: jump over the cut ahead (and any cut touching it); get the twins ready. */
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

  // All videos get the listeners; only the visible one's events count (twinF: what a hidden one's mean).
  const listen = (k, f, twinF) => {
    for (const n of elements) n.addEventListener(k, () => (n === video ? f() : twinF?.(n)));
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
    idle(); // the twins' cues were timed to where you were
    glideClock.reset(); // a seek or a skipped cut: the line goes straight there
    on.onTime(current, video.currentTime);
  });
  listen('play', () => { meant(); paintPlay(true); loop(++run); startGlide(); });
  listen('pause', () => {
    for (const w of twins) if (!w.el.paused) w.el.pause(); // they only play along while you do
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
    get lag() { return seekLag; }, // the learned seek lag, for measuring
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
        twins.forEach((w) => empty(w.el));
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
