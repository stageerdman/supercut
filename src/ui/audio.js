// Replace audio (design/audio-swap.md): the words and labels the button, the drop, the status line and the Audio
// panel show. Pure, no DOM. Tested in test/audio.test.mjs.
import { ext } from './dom.js';
import { VIDEO } from './dropzone.js';

/** What can be a part's new sound (media.rs AUDIO). The picker offers these. */
export const AUDIO = ['wav', 'm4a', 'mp3', 'aif', 'aiff', 'caf', 'aac', 'flac'];

/** One frame at 30 fps: the nudge step (A30). */
export const FRAME = 1 / 30;

const base = (p) => String(p).split('/').pop();

/** Dropped paths split into videos (new parts), audio (new sound) and the rest. */
export function sortDrop(paths) {
  const videos = [], audio = [], other = [];
  for (const p of paths) (VIDEO.includes(ext(p)) ? videos : AUDIO.includes(ext(p)) ? audio : other).push(p);
  return { videos, audio, other };
}

/**
 * What a drag over the window means, so the right target lights up:
 * null (not dragging) · 'video' (new parts) · 'audio' (replace audio) · 'audio-first' (audio, nothing open) · 'no'.
 * Video and audio together: 'video' (the video opens, then the audio lines up).
 */
export function dragKind(paths, hasVideo) {
  if (!paths) return null;
  const { videos, audio, other } = sortDrop(paths);
  if (!paths.length || other.length) return 'no';
  if (videos.length) return 'video';
  return hasVideo ? 'audio' : 'audio-first';
}

/** The toolbar button: "Replace audio" until a part uses mic audio, then the file it uses. */
export function audioButton(parts) {
  const files = [...new Set(parts.filter((p) => p.swap).map((p) => p.swap.recording))];
  if (!files.length) return { text: 'Replace audio', title: 'Replace audio with a better recording', label: 'Replace audio', swapped: false };
  const text = files.length === 1 ? base(files[0]) : `${files.length} mic files`;
  return { text, title: files.map(base).join(', '), label: `Audio: ${text}`, swapped: true };
}

/** "parts 1 and 2", "part 2": `nos` are 1-based. */
const partWords = (nos) => (nos.length === 1 ? `part ${nos[0]}` : `parts ${nos.slice(0, -1).join(', ')} and ${nos.at(-1)}`);

/**
 * The status line after lining up. `fitted`: the 1-based part numbers that took the new sound; `count`: parts in
 * the project. One part: no part numbers.
 */
export function linedUpText(fitted, count) {
  return count > 1 ? `Mic audio lined up · ${partWords(fitted)}` : 'Mic audio lined up';
}

/** The banner when a file fits no part (Rust says it per part; the user hears it once, per file). */
export const noFitText = (path) => `${base(path)} doesn't match this video's sound. Nothing changed.`;

/** True when Rust's error means "this recording is of something else" rather than a broken file. */
export const isNoFit = (e) => String(e).includes("doesn't match this video's sound");

/** A part's row in the Audio panel. */
export const sourceText = (part) => (part.swap ? base(part.swap.recording) : 'Camera audio');

/** The nudge: your change from the match, "0.00 s", "+0.07 s", "−0.03 s". */
export function nudgeText(d) {
  const r = Math.round(d * 100) / 100;
  if (r === 0) return '0.00 s';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(2)} s`;
}

/** For screen readers: "as matched", "7 hundredths of a second later". */
export function nudgeSpoken(d) {
  const n = Math.round(Math.abs(d) * 100);
  if (!n) return 'as matched';
  return `${n} hundredth${n === 1 ? '' : 's'} of a second ${d > 0 ? 'later' : 'earlier'}`;
}

/** "From the camera audio · on this Mac", or "From shure-take.wav · on this Mac": what Generate will hear. */
export const heardFrom = (part) => `From ${part.swap ? base(part.swap.recording) : 'the camera audio'} · on this Mac`;

/** The parts' sound now, for an undo step: [{ id, swap }]. */
export const audioOf = (parts) => parts.map((p) => ({ id: p.id, swap: p.swap ?? null }));
