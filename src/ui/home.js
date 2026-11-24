// Home's words, menu and focus rules (design/home-screen.md). Pure, no DOM. Tested in test/home.test.mjs.
// A summary is Rust's Summary: { id, name, usedAt, locked, deletesAt|null, length, thumb|null } (times in ms).

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local midnight of a time, so "days" are calendar days. */
const midnight = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Calendar days from `a` to `b` (b later → positive). Rounded: a DST day is 23 or 25 hours. */
const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / DAY);

/** "Nov 2", or "Nov 2, 2025" when not this year. */
export function dateText(ms, now) {
  const d = new Date(ms);
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}

/** When it was last used: "Today", "Yesterday", "Monday" (within 6 days), else a date. */
export function whenText(usedAt, now) {
  const ago = daysBetween(usedAt, now);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago <= 6) return WEEKDAYS[new Date(usedAt).getDay()];
  return dateText(usedAt, now);
}

/** Days until the sweep, in words; '' when locked. `soon`: the last 3 days (brighter, never red). */
export function keepText(deletesAt, now) {
  if (deletesAt == null) return { text: '', soon: false };
  const left = daysBetween(now, deletesAt);
  const text = left >= 2 ? `${left} days left` : left === 1 ? 'Deletes tomorrow' : 'Deletes today';
  return { text, soon: left <= 3 };
}

/** The card's meta line: { when, keep, soon }. */
export function cardMeta(s, now) {
  const keep = keepText(s.locked ? null : s.deletesAt, now);
  return { when: whenText(s.usedAt, now), keep: keep.text, soon: keep.soon };
}

/** The length chip: 892 → "14:52", 3725 → "1:02:05". */
export function lengthText(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The length for a screen reader: "14 minutes 52 seconds". */
export function lengthSpoken(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const bits = [h && plural(h, 'hour'), m && plural(m, 'minute'), (sec || !(h || m)) && plural(sec, 'second')];
  return bits.filter(Boolean).join(' ');
}

/** The card button's label: "my-video, edited yesterday, 14 minutes 52 seconds, 29 days left" / "…, locked". */
export function cardLabel(s, now) {
  const { when, keep } = cardMeta(s, now);
  const edited = /^(Today|Yesterday)$/.test(when) ? when.toLowerCase() : `on ${when}`;
  return [s.name, `edited ${edited}`, lengthSpoken(s.length), s.locked ? 'locked' : keep.toLowerCase()].join(', ');
}

/** The right-click menu: Open, Lock / Unlock, Delete…. Never only destructive. */
export const homeMenu = (s) => [
  { id: 'open', text: 'Open' },
  { separator: true },
  { id: 'lock', text: s.locked ? 'Unlock' : 'Lock' },
  { separator: true },
  { id: 'remove', text: 'Delete…', accelerator: 'Backspace' },
];

/** The heading's tail after the start-up sweep; '' when none went. */
export const sweptText = (n) => (n > 0 ? (n === 1 ? '1 old project was deleted' : `${n} old projects were deleted`) : '');

/** Who gets focus after deleting `removedId`: the next card, else the previous, else null (the strip's button). */
export function nextFocus(ids, removedId) {
  const i = ids.indexOf(removedId);
  if (i < 0) return ids[0] ?? null;
  return ids[i + 1] ?? ids[i - 1] ?? null;
}

/**
 * Arrow keys across the grid: the index focus moves to from `i` among `count` cards, `columns` per row; null for a
 * key that doesn't move. Left/right by one, up/down by a row (staying put at the edges), Home/End: first/last.
 */
export function gridMove(key, i, count, columns) {
  const cols = Math.max(1, columns);
  const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: count - 1 }[key];
  if (to == null) return null;
  return to >= 0 && to < count ? to : i;
}

/** The confirm's words. */
export const deleteConfirm = (s) => ({
  title: `Delete “${s.name}”?`,
  message: 'Its cuts, notes and transcript will be removed. Your video files stay where they are.',
});

/** The status line after a drop found the video's project: "Opened your project from Nov 22". `usedAt`: when it
 *  was last used before this open (Home's list knew), or null. */
export function reopenedText(usedAt, now) {
  if (usedAt == null || daysBetween(usedAt, now) <= 0) return 'Opened your project';
  const when = whenText(usedAt, now);
  return `Opened your project from ${when === 'Yesterday' ? 'yesterday' : when}`;
}
