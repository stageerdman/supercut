// A "bit": how far ← / → move the playhead. It's the smallest step at the cutting timeline's
// current zoom. Until that timeline exists it's one frame. The timeline's zoom sets it here — the only place.
export const FRAME = 1 / 30;

let seconds = FRAME;

/** Seconds per bit. */
export const bit = () => seconds;

/** The timeline zoom calls this with its smallest step, in seconds. */
export function setBit(s) {
  seconds = s > 0 ? s : FRAME;
}
