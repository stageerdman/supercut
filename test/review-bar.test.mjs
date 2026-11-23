// The review bar (review-bar.js) against the fake DOM, and the toolbar's done line: design/cut-review.md, "The bar".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { doneLine } from '../src/ui/magic.js';

const stop = (more = {}) => ({
  end: false, checked: 6, total: 38, toFix: 0, count: 'Cut 7 of 38', removed: '1.2 s cut', edge: null,
  reason: 'Earlier take · kept “so today we want to…”', by: 'magic', more: 0, chosen: null, ...more,
});

async function rig(width = 800) {
  globalThis.document = makeDocument();
  const m = await import('../src/ui/review-bar.js');
  const host = document.createElement('div');
  host.clientWidth = width;
  document.body.append(host);
  const calls = [];
  const bar = m.createReviewBar(host, {
    onYes: () => calls.push('yes'), onNo: () => calls.push('no'), onReplay: () => calls.push('replay'),
    onClose: () => calls.push('close'), onFixFirst: () => calls.push('fixFirst'),
  });
  const btn = (name) => bar.el.all().find((n) => n.tag === 'button' && n.attrs['aria-label'] === name);
  const visible = (n) => { for (let x = n; x; x = x.parent) if (x.classes.has('hidden')) return false; return true; };
  return { ...m, bar, calls, btn, visible, host };
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

test('the end line: all checked, or how many, and the cuts to fix', async () => {
  const { barHead, barReason } = await rig();
  assert.equal(barHead({ end: true, checked: 38, total: 38, toFix: 3 }), 'All 38 checked');
  assert.equal(barHead({ end: true, checked: 35, total: 38, toFix: 3 }), '35 of 38 checked');
  assert.equal(barReason({ end: true, checked: 38, total: 38, toFix: 1 }), '1 cut to fix');
});

test('a stop: one region, three named actions with key caps, focus on Looks good, the buttons call back', async () => {
  const { bar, btn, calls, visible } = await rig();
  bar.paint(stop());
  assert.equal(bar.el.attrs.role, 'region');
  assert.equal(bar.el.attrs['aria-label'], 'Cut review');
  for (const name of ['Looks good (Y)', 'Fix later (N)', 'Replay (R)', 'Stop reviewing (Escape)']) assert.ok(visible(btn(name)), name);
  assert.ok(!visible(btn('Fix the first (Option Right Arrow)')));
  assert.equal(document.activeElement, btn('Looks good (Y)'), 'Return is Yes');
  assert.equal(btn('Looks good (Y)').children[0].textContent, 'Y');
  assert.ok(btn('Looks good (Y)').classes.has('bg-accent'), 'the one primary');
  btn('Looks good (Y)').click(); btn('Fix later (N)').click(); btn('Replay (R)').click(); btn('Stop reviewing (Escape)').click();
  assert.deepEqual(calls, ['yes', 'no', 'replay', 'close']);
});

test('the verdict given shows by a ✓ and the word Noted, not by colour alone', async () => {
  const { bar, btn } = await rig();
  bar.paint(stop({ chosen: 'yes' }));
  assert.equal(btn('Looks good (Y)').textContent, 'Y✓ Looks good');
  assert.equal(btn('Looks good (Y)').attrs['aria-pressed'], 'true');
  bar.paint(stop({ chosen: 'no' }));
  assert.equal(btn('Fix later (N)').textContent, 'NNoted');
  assert.equal(btn('Looks good (Y)').textContent, 'YLooks good');
});

test('the live region reads the count and the full reason once per stop', async () => {
  const { bar } = await rig();
  const live = () => bar.el.all().find((n) => n.attrs['aria-live'] === 'polite');
  bar.paint(stop());
  assert.equal(live().textContent, 'Cut 7 of 38. Magic: Earlier take · kept “so today we want to…”');
  bar.paint(stop({ count: 'Cut 8 of 38' }));
  assert.equal(live().textContent, 'Cut 8 of 38. Magic: Earlier take · kept “so today we want to…”');
});

test('the end line with Nos: Fix the first is the primary and takes focus; without Nos only ✕', async () => {
  const { bar, btn, visible, calls } = await rig();
  bar.paint(stop());
  bar.paint({ end: true, checked: 38, total: 38, toFix: 3 });
  assert.ok(!visible(btn('Looks good (Y)')) && !visible(btn('Fix later (N)')) && !visible(btn('Replay (R)')));
  assert.ok(visible(btn('Fix the first (Option Right Arrow)')));
  assert.equal(document.activeElement, btn('Fix the first (Option Right Arrow)'));
  btn('Fix the first (Option Right Arrow)').click();
  assert.deepEqual(calls, ['fixFirst']);
  bar.paint(null);
  assert.ok(!visible(bar.el));
});

test('480 pt wide, at most the player − 32; narrow keeps only the key caps, names stay', async () => {
  const wide = await rig(800);
  wide.bar.paint(stop());
  assert.equal(wide.bar.el.style.width, '480px');
  const narrow = await rig(380);
  narrow.bar.paint(stop());
  assert.equal(narrow.bar.el.style.width, '348px');
  const yes = narrow.btn('Looks good (Y)');
  assert.ok(!narrow.visible(yes.children[1]) && narrow.visible(yes.children[0]));
  assert.equal(yes.attrs['aria-label'], 'Looks good (Y)');
});

test('the done line offers R to review before ⌘Z, and the notes after it', () => {
  assert.equal(doneLine('38 cuts · 24:10 → 14:52 · ⌘Z to undo', 0, true), '38 cuts · 24:10 → 14:52 · R to review · ⌘Z to undo');
  assert.equal(doneLine('38 cuts · 24:10 → 14:52 · ⌘Z to undo', 2, true), '38 cuts · 24:10 → 14:52 · R to review · 2 notes to check · ⌥→ · ⌘Z to undo');
  assert.equal(doneLine('Nothing cut.', 0, false), 'Nothing cut.');
});
