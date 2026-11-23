// The review bar (review-bar.js) against the fake DOM, and the toolbar's done line: design/cut-review.md, "The bar".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { doneLine } from '../src/ui/magic.js';

const stop = (more = {}) => ({
  end: false, checked: 6, total: 38, toFix: 0, count: 'Cut 7 of 38', removed: '1.2 s cut', edge: null,
  reason: 'Earlier take · kept “so today we want to…”', by: 'magic', more: 0, chosen: null,
  only: 'all', counts: { all: 38, magic: 30, unapproved: 38 }, hasPrev: true, hasNext: true, ...more,
});

async function rig(width = 800) {
  globalThis.document = makeDocument();
  const m = await import('../src/ui/review-bar.js');
  const host = document.createElement('div');
  host.clientWidth = width;
  document.body.append(host);
  const calls = [];
  const menus = [];
  const bar = m.createReviewBar(host, {
    onYes: () => calls.push('yes'), onNo: () => calls.push('no'), onPlay: () => calls.push('play'),
    onPrev: () => calls.push('prev'), onNext: () => calls.push('next'),
    onChoose: (only) => calls.push(`choose:${only}`),
    popup: (items, handlers) => menus.push({ items, handlers }),
  });
  const btn = (name) => bar.el.all().find((n) => n.tag === 'button' && n.attrs['aria-label'] === name);
  const buttons = () => bar.el.all().filter((n) => n.tag === 'button');
  const visible = (n) => { for (let x = n; x; x = x.parent) if (x.classes.has('hidden')) return false; return true; };
  return { ...m, bar, calls, menus, btn, buttons, visible, host };
}

test('lines: count, size and the video edge; reason with Magic, your cut, +1 more', async () => {
  const { barHead, barReason } = await rig();
  assert.equal(barHead(stop()), 'Cut 7 of 38 · 1.2 s cut');
  assert.equal(barHead(stop({ count: 'Cuts 7–8 of 38', edge: 'start' })), 'Cuts 7–8 of 38 · 1.2 s cut · Start of video');
  assert.equal(barHead(stop({ edge: 'end' })), 'Cut 7 of 38 · 1.2 s cut · End of video');
  assert.equal(barReason(stop()), 'Magic: Earlier take · kept “so today we want to…”');
  assert.equal(barReason(stop({ more: 1 })), 'Magic: Earlier take · kept “so today we want to…” · +1 more');
  assert.equal(barReason(stop({ by: 'you', reason: 'Your cut' })), 'Your cut');
});

test('the end line: all checked, or how many, and the cuts to fix; Nothing to fix; No cuts left', async () => {
  const { barHead, barReason } = await rig();
  assert.equal(barHead({ end: true, checked: 38, total: 38, toFix: 3 }), 'All 38 checked');
  assert.equal(barHead({ end: true, checked: 35, total: 38, toFix: 3 }), '35 of 38 checked');
  assert.equal(barReason({ end: true, checked: 38, total: 38, toFix: 1 }), '1 cut to fix');
  assert.equal(barReason({ end: true, checked: 38, total: 38, toFix: 0 }), 'Nothing to fix');
  assert.equal(barHead({ end: true, empty: true, checked: 0, total: 0, toFix: 0 }), 'No cuts left');
  assert.equal(barReason({ end: true, empty: true, checked: 0, total: 0, toFix: 0 }), '');
});

test('a stop: one region, Play · Fix later · Looks good with key caps, focus on Looks good, no way out in the bar', async () => {
  const { bar, btn, buttons, calls, visible } = await rig();
  bar.paint(stop());
  assert.equal(bar.el.attrs.role, 'region');
  assert.equal(bar.el.attrs['aria-label'], 'Cut review');
  for (const name of ['Play (R)', 'Fix later (N)', 'Looks good (Y)', 'Which cuts: All cuts']) assert.ok(visible(btn(name)), name);
  assert.ok(!buttons().some((b) => /stop|close|escape|fix the first/i.test(b.attrs['aria-label'])), 'Stop review is the toolbar’s');
  assert.equal(document.activeElement, btn('Looks good (Y)'), 'Return is Yes');
  assert.equal(btn('Looks good (Y)').children.at(-1).textContent, 'Y', 'the cap at the right end');
  assert.equal(btn('Play (R)').textContent, '▶PlayR');
  assert.ok(btn('Looks good (Y)').classes.has('bg-accent'), 'the one primary');
  assert.ok(!btn('Play (R)').classes.has('bg-accent') && !btn('Fix later (N)').classes.has('bg-accent'));
  btn('Looks good (Y)').click(); btn('Fix later (N)').click(); btn('Play (R)').click();
  assert.deepEqual(calls, ['yes', 'no', 'play']);
});

test('Tab order: ‹ ›, which cuts, then Play, Fix later, Looks good (the primary at the far right)', async () => {
  const { bar, buttons } = await rig();
  bar.paint(stop());
  assert.deepEqual(buttons().map((b) => b.attrs['aria-label']),
    ['Previous cut (←)', 'Next cut (→)', 'Which cuts: All cuts', 'Play (R)', 'Fix later (N)', 'Looks good (Y)']);
});

test('the verdict given shows by a ✓ and the word Noted, not by colour alone', async () => {
  const { bar, btn } = await rig();
  bar.paint(stop({ chosen: 'yes' }));
  assert.equal(btn('Looks good (Y)').textContent, '✓ Looks goodY');
  bar.paint(stop({ chosen: 'no' }));
  assert.equal(btn('Fix later (N)').textContent, 'NotedN');
  assert.equal(btn('Looks good (Y)').textContent, 'Looks goodY');
});

test('which cuts: a menu with ✓ on the choice, empty choices dimmed; a pick calls back', async () => {
  const { bar, btn, menus, calls, choiceMenu } = await rig();
  bar.paint(stop({ only: 'magic', counts: { all: 5, magic: 0, unapproved: 5 } }));
  assert.equal(btn('Which cuts: Magic’s cuts').attrs['aria-haspopup'], 'menu');
  btn('Which cuts: Magic’s cuts').click();
  assert.deepEqual(menus[0].items, choiceMenu('magic', { all: 5, magic: 0, unapproved: 5 }));
  assert.deepEqual(menus[0].items.map((x) => [x.text, x.checked, x.enabled !== false]),
    [['All cuts', false, true], ['Magic’s cuts', true, false], ['Not approved yet', false, true]]);
  menus[0].handlers.unapproved();
  assert.deepEqual(calls, ['choose:unapproved']);
});

test('the live region reads the count and the full reason once per stop; first how to stop', async () => {
  const { bar } = await rig();
  const live = () => bar.el.all().find((n) => n.attrs['aria-live'] === 'polite');
  bar.paint(stop());
  assert.equal(live().textContent, 'Reviewing 38 cuts. Stop review is in the toolbar. Cut 7 of 38. Magic: Earlier take · kept “so today we want to…”');
  bar.paint(stop({ count: 'Cut 8 of 38' }));
  assert.equal(live().textContent, 'Cut 8 of 38. Magic: Earlier take · kept “so today we want to…”');
});

test('the end line: no actions, focus rests on the bar; null hides it', async () => {
  const { bar, btn, visible } = await rig();
  bar.paint(stop());
  bar.paint({ end: true, checked: 38, total: 38, toFix: 3, only: 'all', counts: {} });
  assert.ok(!visible(btn('Looks good (Y)')) && !visible(btn('Fix later (N)')) && !visible(btn('Play (R)')));
  assert.ok(visible(btn('Which cuts: All cuts')), 'another set can still be picked');
  assert.equal(document.activeElement, bar.el);
  bar.paint(null);
  assert.ok(!visible(bar.el));
});

test('docked, never over the video: one slim row in the player column’s flow, under the player', async () => {
  const { bar, host } = await rig();
  bar.paint(stop());
  assert.equal(host.children.at(-1), bar.el, 'the column’s last child: under the player');
  for (const c of ['absolute', 'fixed', 'shadow-lg', 'hidden']) assert.ok(!bar.el.classes.has(c), c);
  assert.ok(bar.el.classes.has('h-10') && bar.el.classes.has('flex') && bar.el.classes.has('border-t'), 'one 40 pt row');
  bar.paint(null);
  assert.ok(bar.el.classes.has('hidden') && !bar.el.classes.has('flex'), 'takes no space when not reviewing');
});

test('‹ ›: previous and next cut call back; dimmed (not disabled) where there is nowhere to go', async () => {
  const { bar, btn, calls } = await rig();
  bar.paint(stop());
  btn('Previous cut (←)').click(); btn('Next cut (→)').click();
  assert.deepEqual(calls, ['prev', 'next']);
  assert.equal(btn('Previous cut (←)').attrs['aria-disabled'], undefined);
  bar.paint(stop({ hasPrev: false }));
  assert.equal(btn('Previous cut (←)').attrs['aria-disabled'], 'true', 'the first cut');
  assert.equal(btn('Previous cut (←)').disabled, false, 'focus can stay on it');
  bar.paint(stop({ hasNext: false }));
  assert.equal(btn('Previous cut (←)').attrs['aria-disabled'], undefined);
  assert.equal(btn('Next cut (→)').attrs['aria-disabled'], 'true', 'the last cut');
  bar.paint({ end: true, checked: 38, total: 38, toFix: 0, only: 'all', counts: {}, hasPrev: true, hasNext: false });
  assert.equal(btn('Previous cut (←)').attrs['aria-disabled'], undefined, 'the end line: ‹ goes to the last cut');
  assert.equal(btn('Next cut (→)').attrs['aria-disabled'], 'true');
});

test('the row sheds as the player narrows: the reason first, then the buttons’ words; names, ▶ and caps stay', async () => {
  const { barFit } = await rig();
  assert.deepEqual(barFit(900), { reason: true, words: true });
  assert.deepEqual(barFit(640), { reason: false, words: true });
  assert.deepEqual(barFit(480), { reason: false, words: false });
  const mid = await rig(640);
  mid.bar.paint(stop());
  const reasonOf = (r) => r.bar.el.all().find((n) => n.title === 'Magic: Earlier take · kept “so today we want to…”');
  assert.ok(!mid.visible(reasonOf(mid)) && mid.visible(mid.btn('Looks good (Y)').children[0]));
  const narrow = await rig(480);
  narrow.bar.paint(stop());
  const yes = narrow.btn('Looks good (Y)');
  assert.ok(!narrow.visible(yes.children[0]) && narrow.visible(yes.children.at(-1)));
  const play = narrow.btn('Play (R)');
  assert.ok(narrow.visible(play.children[0]) && !narrow.visible(play.children[1]) && narrow.visible(play.children[2]));
  for (const n of ['Which cuts: All cuts', 'Previous cut (←)', 'Next cut (→)']) assert.ok(narrow.visible(narrow.btn(n)), n);
  assert.equal(yes.attrs['aria-label'], 'Looks good (Y)');
  const wide = await rig(900);
  wide.bar.paint(stop());
  assert.ok(wide.visible(reasonOf(wide)));
});

test('the done line offers R to review before ⌘Z, and the notes after it', () => {
  assert.equal(doneLine('38 cuts · 24:10 → 14:52 · ⌘Z to undo', 0, true), '38 cuts · 24:10 → 14:52 · R to review · ⌘Z to undo');
  assert.equal(doneLine('38 cuts · 24:10 → 14:52 · ⌘Z to undo', 2, true), '38 cuts · 24:10 → 14:52 · R to review · 2 notes to check · ⌥→ · ⌘Z to undo');
  assert.equal(doneLine('Nothing cut.', 0, false), 'Nothing cut.');
});
