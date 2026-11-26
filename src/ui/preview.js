// Preview: keeps a rendered preview of the edit (the kept spans back to back in one file, made by Rust:
// src-tauri/src/preview) in step with the cuts. Playing that file crosses every cut without a seek, the one thing
// that freezes WebKit's picture. After an edit it waits a moment (a drag edits many times), then asks for a new one;
// only the answer for the edit you have now is ever used. No DOM. Tested in test/preview.test.mjs.
import { keptSpans } from './playback.js';
import { mediaOf } from './media.js';

const WAIT = 400; // ms after the last edit before a render starts

/**
 * @param {{ invoke: (cmd:string, args:object)=>Promise<{file:string, map:Array}>,
 *           parts: ()=>Array<{id:number,duration:number}>, cuts: ()=>Array,
 *           size: ()=>({width:number,height:number}|null), log?: (msg:string)=>void, now?: ()=>number }} on
 */
export function createPreview(on) {
  let ready = null; // { key, file, map }
  let asked = null; // key of the render under way
  let timer = 0;
  let size = null; // the first video's size, kept: a new size would render every clip again
  let failing = createBackoff();
  const now = on.now ?? Date.now;

  /** What the preview of the edit as it is now would be: its spans and their key; null if it can't be made yet. */
  function wanted() {
    const parts = on.parts();
    if (!parts.length || parts.some((p) => !(p.duration > 0))) return null;
    size ??= on.size();
    if (!size?.width || !size?.height) return null;
    const spans = keptSpans(parts, on.cuts()).map(({ part, s, e }) => ({ part, s: round(s), e: round(e) }));
    // A swapped sound is a new preview too, though no span moved.
    return spans.length ? { spans, key: JSON.stringify([spans, parts.map(mediaOf)]) } : null;
  }

  function render() {
    timer = 0;
    const w = wanted();
    if (!w || w.key === ready?.key || w.key === asked || failing.holds(w.key, now())) return;
    asked = w.key;
    on.invoke('preview', { spans: w.spans, ...size }).then(
      (p) => { if (asked === w.key) { ready = { key: w.key, file: p.file, map: p.map }; asked = null; } },
      (e) => {
        if (asked === w.key) asked = null;
        failing.failed(w.key, now());
        on.log?.(`preview: ${e}`);
      },
    );
  }

  return {
    /** The edit (or a part's length or size) changed: a new preview soon. */
    changed() {
      clearTimeout(timer);
      timer = setTimeout(render, WAIT);
    },
    /** The preview of the edit as it is now ({ file, map }), or null while it is being made. */
    current() {
      const w = wanted();
      if (w && w.key === ready?.key) return ready;
      if (w && w.key !== asked && !timer) render(); // nobody said it changed: ask now
      return null;
    },
    /** A new project: nothing old is of use. */
    reset() { ready = null; asked = null; size = null; failing = createBackoff(); },
  };
}

/**
 * Failed renders of one edit are tried again after 2, 4, then 8 s, then no more: a render that always fails
 * (a broken file, a full disk) must not start an ffmpeg on every frame forever. A new edit starts afresh.
 */
export function createBackoff({ first = 2000, retries = 3 } = {}) {
  let last = null; // { key, fails, until }
  return {
    /** Whether a render of this key must wait (or give up) because it failed before. */
    holds(key, at) {
      return last?.key === key && (last.fails > retries || at < last.until);
    },
    failed(key, at) {
      const fails = last?.key === key ? last.fails + 1 : 1;
      last = { key, fails, until: at + first * 2 ** (fails - 1) };
    },
  };
}

const round = (x) => Math.round(x * 1000) / 1000;
