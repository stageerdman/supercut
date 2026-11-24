// Home's words, menu and focus rules (src/ui/home.js): design/home-screen.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardMeta, lengthText, lengthSpoken, cardLabel, homeMenu, sweptText, nextFocus, gridMove, deleteConfirm, reopenedText,
} from '../src/ui/home.js';

const DAY = 86400000;
const NOW = new Date(2026, 10, 24, 15, 0).getTime(); // Tue Nov 24 2026, 3 pm local
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const card = (more = {}) => ({ id: 'a', name: 'my-video', usedAt: NOW, locked: false, deletesAt: NOW + 30 * DAY, length: 892, thumb: null, ...more });

test('when: today, yesterday, a weekday within 6 days, a date, the year when not this year', () => {
  const when = (usedAt) => cardMeta(card({ usedAt }), NOW).when;
  assert.equal(when(at(2026, 10, 24, 0, 5)), 'Today');
  assert.equal(when(at(2026, 10, 23, 23)), 'Yesterday', 'calendar days, not 24 hours');
  assert.equal(when(at(2026, 10, 23, 1)), 'Yesterday');
  assert.equal(when(at(2026, 10, 18)), 'Wednesday', '6 days ago');
  assert.equal(when(at(2026, 10, 17)), 'Nov 17', '7 days ago');
  assert.equal(when(at(2026, 0, 2)), 'Jan 2');
  assert.equal(when(at(2025, 10, 2)), 'Nov 2, 2025');
});

test('days left: 12, 3 (soon), 2, 1 (tomorrow), 0 and past (today); locked says nothing', () => {
  const keep = (days, h = 15) => cardMeta(card({ deletesAt: at(2026, 10, 24 + days, h) }), NOW);
  assert.deepEqual(keep(12), { when: 'Today', keep: '12 days left', soon: false });
  assert.deepEqual(keep(4), { when: 'Today', keep: '4 days left', soon: false });
  assert.deepEqual(keep(3), { when: 'Today', keep: '3 days left', soon: true });
  assert.equal(keep(2).keep, '2 days left');
  assert.deepEqual(keep(1, 1), { when: 'Today', keep: 'Deletes tomorrow', soon: true });
  assert.equal(keep(0, 23).keep, 'Deletes today');
  assert.equal(keep(-2).keep, 'Deletes today', 'overdue: the sweep takes it next launch');
  assert.deepEqual(cardMeta(card({ locked: true, deletesAt: null }), NOW), { when: 'Today', keep: '', soon: false });
  assert.equal(cardMeta(card({ locked: true }), NOW).keep, '', 'locked wins over a stale deletesAt');
});

test('length chip and its spoken form', () => {
  assert.equal(lengthText(892.4), '14:52');
  assert.equal(lengthText(3.2), '0:03');
  assert.equal(lengthText(0), '0:00');
  assert.equal(lengthText(3725), '1:02:05');
  assert.equal(lengthSpoken(892), '14 minutes 52 seconds');
  assert.equal(lengthSpoken(60), '1 minute');
  assert.equal(lengthSpoken(3601), '1 hour 1 second');
  assert.equal(lengthSpoken(0), '0 seconds');
});

test('the card button says everything the card shows', () => {
  assert.equal(cardLabel(card({ usedAt: NOW - DAY, deletesAt: NOW + 29 * DAY }), NOW), 'my-video, edited yesterday, 14 minutes 52 seconds, 29 days left');
  assert.equal(cardLabel(card({ locked: true, deletesAt: null }), NOW), 'my-video, edited today, 14 minutes 52 seconds, locked');
  assert.equal(cardLabel(card({ usedAt: at(2026, 10, 2) }), NOW).split(', ')[1], 'edited on Nov 2');
});

test('the menu: Open, Lock or Unlock, Delete…', () => {
  const ids = (s) => homeMenu(s).map((i) => i.text ?? '—');
  assert.deepEqual(ids(card()), ['Open', '—', 'Lock', '—', 'Delete…']);
  assert.deepEqual(ids(card({ locked: true })), ['Open', '—', 'Unlock', '—', 'Delete…']);
  assert.deepEqual(homeMenu(card()).filter((i) => i.id).map((i) => i.id), ['open', 'lock', 'remove']);
});

test('what the sweep deleted', () => {
  assert.equal(sweptText(0), '');
  assert.equal(sweptText(1), '1 old project was deleted');
  assert.equal(sweptText(2), '2 old projects were deleted');
});

test('focus after a delete: the next card, else the previous, else the strip', () => {
  assert.equal(nextFocus(['a', 'b', 'c'], 'a'), 'b');
  assert.equal(nextFocus(['a', 'b', 'c'], 'b'), 'c');
  assert.equal(nextFocus(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(nextFocus(['a'], 'a'), null);
});

test('arrows move across the grid, staying put at the edges', () => {
  assert.equal(gridMove('ArrowRight', 0, 6, 4), 1);
  assert.equal(gridMove('ArrowLeft', 0, 6, 4), 0);
  assert.equal(gridMove('ArrowDown', 1, 6, 4), 5);
  assert.equal(gridMove('ArrowDown', 2, 6, 4), 2, 'no card below');
  assert.equal(gridMove('ArrowUp', 5, 6, 4), 1);
  assert.equal(gridMove('Home', 4, 6, 4), 0);
  assert.equal(gridMove('End', 0, 6, 4), 5);
  assert.equal(gridMove('a', 0, 6, 4), null);
});

test('the confirm and the reopened line', () => {
  assert.equal(deleteConfirm(card()).title, 'Delete “my-video”?');
  assert.match(deleteConfirm(card()).message, /Your video files stay where they are/);
  assert.equal(reopenedText(at(2026, 10, 22), NOW), 'Opened your project from Sunday');
  assert.equal(reopenedText(at(2026, 9, 2), NOW), 'Opened your project from Oct 2');
  assert.equal(reopenedText(NOW - DAY, NOW), 'Opened your project from yesterday');
  assert.equal(reopenedText(NOW, NOW), 'Opened your project');
  assert.equal(reopenedText(null, NOW), 'Opened your project');
});
