// Cut review: playing one stop's window on the normal player (design/cut-review.md, "The window"). The player
// already skips every cut, so a window is just "start at its first span, pause at its end". No DOM of its own:
// the player is passed in, and the app feeds `at(i, t)` from the player's time updates. Tested in
// test/review-play.test.mjs.
import { editedTime } from './playback.js';

const EPS = 1e-3;
const LANDING = 0.25; // s: a seek lands within this of where it was sent

/**
 * @param {{show:(i:number,t:number,play:boolean)=>void, pause:()=>void, play:()=>void, playing:boolean}} player
 * @param {{parts:()=>Array<{id:number,duration:number}>, cuts:()=>Array, onEnd?:()=>void}} on
 */
export function createWindowPlay(player, on) {
  let win = null; // { from, to, spans }
  let ended = false;
  let heardTo = 0; // edited time reached in this window
  let landed = false; // the player has reported a time inside the window since it started

  function play(w) {
    if (!w.spans.length) throw new RangeError('review: a window with nothing to play');
    win = w;
    ended = false;
    landed = false;
    heardTo = w.from;
    const first = w.spans[0];
    player.show(on.parts().findIndex((p) => p.id === first.part), first.s, true);
  }

  return {
    play,
    /** R, or Space once the window has ended: from its start again. */
    replay: () => win && play(win),
    /** Space: pause / play; after the window has ended, replay. */
    toggle() {
      if (!win) return;
      if (ended) play(win);
      else if (player.playing) player.pause();
      else player.play();
    },
    /** The player is at part index i, source time t: pause and wait once the window's end is reached. */
    at(i, t) {
      if (!win || ended || !player.playing) return;
      const now = editedTime(on.parts(), on.cuts(), i, t);
      // Until the seek lands, the player may still report where it was: only time inside the window counts.
      if (!landed && (now < win.from - LANDING || now >= win.to)) return;
      landed = true;
      heardTo = Math.max(heardTo, now);
      if (heardTo < win.to - EPS) return;
      ended = true;
      player.pause();
      on.onEnd?.();
    },
    /** Seconds into the window the verdict came (verdict.after: is 6 s the right length?). */
    get after() { return win ? Math.max(0, Math.min(heardTo, win.to) - win.from) : 0; },
    get ended() { return ended; },
    get window() { return win; },
    /** Leaving review: the player pauses where it is, the window is forgotten. */
    stop() {
      if (win && player.playing) player.pause();
      win = null;
      ended = false;
    },
  };
}
