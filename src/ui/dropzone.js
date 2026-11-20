// DropZone: drag-over feedback. The whole window takes drops; this only paints the answer.
// States: idle · drag-valid (solid accent, 8 % fill) · drag-invalid (solid hairline, "Only video files open here").
// With a project open, the timeline's add-slot answers instead ("Add as part 2").
import { $, ext } from './dom.js';

export const VIDEO = ['mp4', 'mov', 'm4v'];

/** Pure: null = not dragging, true = every file is a video, false = something isn't. */
export const dropVerdict = (paths) => (paths ? paths.length > 0 && paths.every((p) => VIDEO.includes(ext(p))) : null);

export function paintDrag(paths, nextPart) {
  const v = dropVerdict(paths);
  const zone = $('dropzone');
  zone.classList.toggle('border-solid', v !== null);
  zone.classList.toggle('border-dashed', v === null);
  zone.classList.toggle('border-accent', v === true);
  zone.classList.toggle('bg-accent/8', v === true);
  $('drop-headline').textContent = v === null ? 'Drop a video here' : v ? 'Drop to open' : 'Only video files open here';
  const slot = $('add-slot');
  if (slot) {
    slot.classList.toggle('border-accent', v === true);
    slot.classList.toggle('text-text', v === true);
    slot.textContent = v ? `Add as part ${nextPart}` : `+ Add part ${nextPart}`;
  }
}
