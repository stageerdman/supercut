// PlayerView: plays the parts back to back (part 1 runs into part 2), skipping the cuts.
// No controls on the video itself; the transport row is the only one.
// Skipping is checked every frame (requestVideoFrameCallback; timeupdate's 4×/s would run into a cut).
// Seamless cuts: a hidden <video> (the twin) plays along silently, in step on the far side of the next cut; at the
// cut the two swap (shown and heard ↔ hidden and silent), so nothing seeks or starts at the cut; then the old one,
// hidden, seeks on for the cut after (a kept stretch of FIX_BEFORE is time enough). One twin, not two: measured, a
// second playing twin starves WebKit's decoders. Why it is done this way, and what stalls WebKit's picture:
// twin-sync.js. Even one twin can't hide a seek after a kept stretch under ~0.85 s, so when a rendered preview of the
// edit is ready (on.preview) playing plays that instead: one file, the kept spans back to back, no seek at any cut
// (preview-play.js). The twin stays for playing before the preview is ready, or from inside a cut.
// Spec: design/timeline.md § Playback.
import { clock } from './dom.js';
import { skipTarget, cutHere, editedTime, editedLength } from './playback.js';
import { createPlayClock } from './play-clock.js';
import { createPreviewPlay } from './preview-play.js';
import { createJumps } from './jumps.js';
import { twinStep, drift, parked, seekLoss, QUIET, TOLERANCE, SEEK_LAG, SETTLE } from './twin-sync.js';

const EPS = 1e-6;
export const LEAD = 3; // s: how far ahead of a cut (or a part's end) the twin gets ready (room for two seeks)
const STANDBY = ['absolute', 'opacity-0', 'pointer-events-none'];

/**
 * @param {HTMLVideoElement} first  the visible video; the hidden twin is made next to it
 * @param {{parts: () => Array<{id:number,path:string,name:string,duration:number}>, cuts: () => Array,
 *          onTime: (i:number, t:number)=>void, onFrame?: (i:number, t:number)=>void, onPart: (i:number)=>void, onError: (name:string)=>void,
 *          preview?: () => ({key:string, file:string, map:Array}|null)}} on  the preview of the edit as it is now (preview.js)
 */
export function createPlayer(first, on) {
  const { convertFileSrc } = window.__TAURI__.core;
  let video = first; // the one you see and hear
  let twin = first.cloneNode ? first.cloneNode(false) : null; // hidden, waits on the far side of the next cut
  const elements = twin ? [first, twin] : [first];
  let cue = null; // what the twin is for: { path, t } the far side of the cut, `at` where the seen one leaves it
  let sought = null; // { aimed, since }: the twin's last seek, to learn seekLag from once it runs steady
  let seekLag = SEEK_LAG; // s the twin falls behind where a seek while playing sends it (learned at each seek)
  let swapTimer = 0; // a swap due within this frame
  let current = 0;
  let through = null; // a cut you chose to play from inside: it plays, the next ones skip
  let selfSeek = false; // our own jump over a cut, not the user's seek

  if (twin) {
    twin.removeAttribute('id');
    standby(twin);
    first.after(twin);
  }
  const preview = on.preview && first.cloneNode ? previewOver(twin ?? first) : null;

  function previewOver(prev) {
    const pv = first.cloneNode(false);
    pv.removeAttribute('id');
    standby(pv);
    prev.after(pv);
    pv.addEventListener('play', () => { paintPlay(true); startGlide(); });
    pv.addEventListener('timeupdate', previewTimeUpdate);
    const stopped = () => { if (preview.shown) leave(false); else if (video.paused) paintPlay(false); };
    pv.addEventListener('pause', stopped);
    pv.addEventListener('ended', stopped); // the end of the edit
    return createPreviewPlay(pv, { convertFileSrc, onFail: () => leave(true) });
  }

  /** Dress `n` as a hidden twin (inaudible, out of the tab order and the accessibility tree). */
  function standby(n) {
    n.classList.add(...STANDBY);
    n.volume = QUIET;
    n.tabIndex = -1;
    n.setAttribute('aria-hidden', 'true');
  }

  /** The twin's cue is void (you seeked or edited): no swap is due, it gets in step again for the next cut. */
  function idle() {
    clearTimeout(swapTimer);
    swapTimer = 0;
    cue = null;
    sought = null;
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
  const holds = (dest) => !!cue && cue.path === pathAt(dest) && Math.abs(cue.t - dest.t) < EPS;

  /** Every frame before a cut: get the twin in step on the far side of the next jump (twinStep says how). */
  function prepare(t) {
    if (!twin) return;
    const { at, dest } = jumps().next(current, t);
    if (!dest || !pathAt(dest) || at - t > LEAD) return;
    if (!holds(dest)) {
      cue = { path: pathAt(dest), t: dest.t };
      sought = null;
      load(twin, on.parts()[dest.i]);
    }
    cue.at = at;
    const settling = sought && performance.now() - sought.since < SETTLE * 1000;
    const busy = twin.seeking || twin.readyState < 2 || settling;
    if (sought && !busy && !twin.paused) { // settled: aim better next time (a start teaches nothing)
      if (sought.aimed !== null) seekLag = seekLoss(sought.aimed, (performance.now() - sought.since) / 1000, twin.playbackRate, twin.currentTime);
      sought = null;
    }
    const step = twinStep({ at, to: cue.t, t }, { paused: twin.paused, busy, time: twin.currentTime }, seekLag);
    if (step.do === 'park') { twin.pause(); twin.currentTime = step.time; }
    else if (step.do === 'seek') { twin.currentTime = step.time; sought = { aimed: step.time, since: performance.now() }; }
    else if (step.do === 'play') { startTwin(); sought = { aimed: null, since: performance.now() }; }
  }

  /** Can the twin take over at `dest` now: in step on the far side, or parked there (then this starts it)? */
  function twinTakes(dest) {
    if (!twin || twin.seeking || !holds(dest)) return false;
    // Started now, its clock moves about when the cut comes (its start lag ≈ the under-a-frame wait).
    if (parked(cue.t, { paused: twin.paused, time: twin.currentTime })) {
      startTwin();
      return true;
    }
    return !twin.paused && Math.abs(drift(cue.at, cue.t, video.currentTime, twin.currentTime)) <= TOLERANCE;
  }

  function startTwin() {
    twin.playbackRate = video.playbackRate; // set now: changing it while playing stalls the picture
    twin.play()?.catch?.(idle); // it won't play: the next cut seeks instead
  }

  /** Go to `dest` while playing: swap to the twin if it can take over, else seek. */
  function jump(dest) {
    if (swapTimer) return;
    if (twinTakes(dest)) return swapOnTime(dest);
    idle();
    if (dest.i === current) { selfSeek = true; video.currentTime = dest.t; }
    else show(dest.i, dest.t, true);
  }

  /** The cut is under a frame away: swap right when it comes, not a frame early. */
  function swapOnTime(dest) {
    const ms = ((cue.at - video.currentTime) / (video.playbackRate || 1)) * 1000;
    if (ms < 4) return swap(dest);
    swapTimer = setTimeout(() => {
      swapTimer = 0;
      // Still playing up to that cut? (A seek of yours meanwhile voids the cue; a pause, the swap.)
      if (!video.paused && holds(dest) && Math.abs(cue.at - video.currentTime) <= TOLERANCE) swap(dest);
    }, ms);
  }

  function swap(dest) {
    const old = video;
    const muted = old.muted, volume = old.volume, focused = document.activeElement === old;
    video = twin;
    twin = old;
    cue = null;
    sought = null;
    const moved = dest.i !== current;
    current = dest.i;
    video.classList.remove(...STANDBY);
    Object.assign(video, { muted, volume });
    video.tabIndex = old.tabIndex;
    video.removeAttribute('aria-hidden');
    video.setAttribute('aria-label', old.getAttribute('aria-label') ?? 'Video player');
    video.id = old.id;
    old.removeAttribute('id');
    standby(old); // it plays on, hidden and inaudible, as the twin for the next cut
    if (focused) video.focus?.();
    meant(); // a twin a hair short of the far side plays that hair, not seeks over it (the seek is the hitch)
    // The glide clock runs on: the twin's clock reads a little behind and settles, and the line must not follow it back.
    if (moved) on.onPart(current);
    on.onTime(current, video.currentTime);
  }

  /** Every frame while playing: jump over the cut ahead (and any cut touching it); get the twin ready. */
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
    if (!playing()) return;
    if (preview?.shown) previewAt(glideClock.read(preview.element.currentTime, performance.now(), { rate: preview.element.playbackRate, key: 'preview' }));
    else shownAt = { i: current, t: glideClock.read(video.currentTime, performance.now(), { rate: video.playbackRate, key: current }) };
    on.onFrame?.(shownAt.i, shownAt.t);
    frameReq = requestAnimationFrame(glide);
  }
  let shownAt = { i: 0, t: 0 }; // where the playhead is shown while playing

  /** The preview is at edit time T: the part and time it plays (the part changes as it crosses into the next). */
  function previewAt(T) {
    const at = preview.where(T);
    const i = on.parts().findIndex((p) => p.id === at.part);
    if (i >= 0 && i !== current) {
      current = i;
      on.onPart(i);
    }
    shownAt = { i: current, t: at.t };
  }

  function previewTimeUpdate() {
    if (!preview.shown) return;
    if (on.preview() !== preview.shown) return leave(true); // you edited: the source plays on until the new one is made
    on.onTime(shownAt.i, shownAt.t); // the glide's (forward-only) spot, not the coarser raw one
  }

  const playing = () => (preview?.shown ? !preview.element.paused : !video.paused);

  /** Play: the preview when it has this spot (not a cut you start in), else the source with its twin. */
  function play() {
    if (playing()) return;
    const p = on.preview?.(), id = part()?.id, t = video.currentTime;
    const T = p && id !== undefined && !cutHere(on.cuts(), id, t) ? preview.editTime(p, id, t) : null;
    if (T === null) return video.play();
    idle();
    if (twin && !twin.paused) twin.pause();
    shownAt = { i: current, t };
    preview.start(p, T, video);
  }

  /** Back from the preview to the source at the same spot; `play` keeps playing there. */
  function leave(play) {
    const at = preview.where();
    preview.stop(video);
    show(Math.max(0, on.parts().findIndex((p) => p.id === at.part)), at.t, play);
  }

  function pause() {
    if (preview?.shown) leave(false);
    else video.pause();
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
    if (!selfSeek) {
      meant();
      glideClock.reset(); // your seek: the line goes straight there (a skipped cut is a jump forward it takes anyway)
    }
    selfSeek = false;
    idle(); // the twin's cue was timed to where you were
    on.onTime(current, video.currentTime);
  });
  listen('play', () => { meant(); paintPlay(true); loop(++run); startGlide(); });
  listen('pause', () => {
    if (twin && !twin.paused) twin.pause(); // it only plays along while you do
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

  /** Go to part `i` at `at`; `play` plays from there (in the preview if it is playing and has that spot). */
  function seek(i, at = 0, play = false) {
    if (preview?.shown) {
      const p = on.parts()[i];
      const T = play && p && !cutHere(on.cuts(), p.id, at) ? preview.editTime(preview.shown, p.id, at) : null;
      if (T !== null) return previewSeek(T);
      leave(false);
    }
    show(i, at, play);
  }

  function previewSeek(T) {
    preview.seek(T);
    glideClock.reset(); // your seek: the line goes straight there, back too
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

  /** The part list changed under the preview: back to the source, found by part (indexes moved). */
  const leftPreview = () => {
    if (!preview?.shown || !on.parts().length) return false;
    leave(false);
    return true;
  };
  const time = () => (preview?.shown ? shownAt.t : video.currentTime || 0);

  return {
    show: seek,
    step: (d) => (preview?.shown ? previewSeek(preview.element.currentTime + d) : step(d)),
    tick, // for tests
    get current() { return current; },
    get time() { return time(); },
    get playing() { return playing(); },
    get element() { return video; }, // for tests
    get lag() { return seekLag; }, // the learned seek lag, for measuring
    toggle: () => (playing() ? pause() : play()),
    play,
    pause,
    /** A part was put back at index `i` (undo of a removal). */
    added(i) {
      idle();
      if (leftPreview()) return;
      if (on.parts().length === 1) show(0);
      else if (i <= current) current++;
    },
    /** The part at index `i` was removed from the list. */
    removed(i) {
      idle();
      if (leftPreview()) return;
      const parts = on.parts();
      if (!parts.length) {
        if (preview?.shown) preview.stop(video);
        if (preview) empty(preview.element);
        empty(video);
        if (twin) empty(twin);
        current = 0;
      } else if (i === current) show(0);
      else if (i < current) current--;
    },
    /** Readout in edited time (cuts out, parts back to back): "01:12" / "23:40"; `original` is the uncut length. */
    times() {
      const parts = on.parts(), cuts = on.cuts();
      return {
        at: clock(editedTime(parts, cuts, current, time())),
        total: clock(editedLength(parts, cuts)),
        original: clock(parts.reduce((s, p) => s + (p.duration || 0), 0)),
      };
    },
  };
}
