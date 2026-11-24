// DropZone: drag-over feedback. The whole window takes drops; this only paints the answer, from audio.js dragKind():
// Empty state: idle · 'video' (solid accent, 8 % fill, "Drop to open") · 'audio-first' (solid secondary, "Add the
// video first") · 'no' (solid hairline, "Only video and audio files open here").
// With a project open: 'video' → the timeline's add-slot ("Add as part 2"); 'audio' → the timeline outlined,
// "Drop to replace audio" (design/audio-swap.md). Nothing appears over the video.
import { $ } from './dom.js';

export const VIDEO = ['mp4', 'mov', 'm4v'];

const HEADLINE = { video: 'Drop to open', 'audio-first': 'Add the video first', no: 'Only video and audio files open here' };

export function paintDrag(kind, nextPart) {
  const zone = $('dropzone');
  zone.classList.toggle('border-solid', kind !== null);
  zone.classList.toggle('border-dashed', kind === null);
  zone.classList.toggle('border-accent', kind === 'video');
  zone.classList.toggle('bg-accent/8', kind === 'video');
  zone.classList.toggle('border-text-secondary', kind === 'audio-first');
  $('drop-headline').textContent = HEADLINE[kind] ?? 'Drop a video here';
  const slot = $('add-slot');
  if (slot) {
    const v = kind === 'video';
    slot.classList.toggle('border-accent', v);
    slot.classList.toggle('text-text', v);
    slot.textContent = v ? `Add as part ${nextPart}` : `+ Add part ${nextPart}`;
  }
  const audio = $('audio-drop');
  audio.classList.toggle('opacity-0', kind !== 'audio');
  $('audio-drop-text').textContent = kind === 'audio' ? 'Drop to replace audio' : '';
}
