// The review bar (review-bar.js) against the fake DOM, and the toolbar's done line: design/cut-review.md, "The bar" (v4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { doneLine } from '../src/ui/magic.js';

const stop = (more = {}) => ({
  end: false, checked: 6, total: 38, approved: 6, toFix: 0, first: 7, last: 7,
  reason: 'Earlier take · kept “so today we want to…”', by: 'magic', more: 0, chosen: null,
  only: 'all', counts: { all: 38, magic: 30, unapproved: 32 }, hasPrev: true, hasNext: true, ...more,
});
const end = (more = {}) => ({ end: true, checked: 38, total: 38, approved: 38, toFix: 0, only: 'all', counts: {}, hasPrev: true, hasNext: false, ...more });

async function rig(width = 800) {
  globalThis.document = makeDocument();
  const m = await import('../src/ui/review-bar.js');
  const host = document.createElement('div');
  host.clientWidth = width;
  document.body.append(host);
  const calls = [];
  const bar = m.createReviewBar(host, {
    onYes: () => calls.push('yes'), onPlay: () => calls.push('play'),
    onPrev: () => calls.push('prev'), onNext: () => calls.push('next'),
    onChoose: (only) => calls.push(`choose:${only}`),
  });
  const btn = (name) => bar.el.all().find((n) => n.tag === 'button' && n.attrs['aria-label'] === name);
  const seg = (only) => bar.el.all().find((n) => n.tag === 'button' && n.dataset.only === only);
  const buttons = () => bar.el.all().filter((n) => n.tag === 'button');
  const visible = (n) => { for (let x = n; x; x = x.parent) if (x.classes.has('hidden')) return false; return true; };
  const text = () => bar.el.all().filter((n) => visible(n) && !n.attrs['aria-live'] && n.children.length === 0).map((n) => n.textContent).filter(Boolean);
  return { ...m, bar, calls, btn, seg, buttons, visible, text, host };
}

test('the counter: "7 of 38", "7–8 of 38" for close cuts; nothing else around it', async () => {
  const { bar, barCount, text } = await rig();
  assert.equal(barCount(stop()), '7 of 38');
  assert.equal(barCount(stop({ last: 8 })), '7–8 of 38');
  bar.paint(stop());
  assert.deepEqual(text(), ['All', 'Magic', 'Unapproved', '7 of 38'], 'no words on the buttons, no reason, no size');
});

test('icons only: ‹ ▶ ✓ ›, each named in its tooltip; no Fix later, no way out in the bar', async () => {
  const { bar, btn, buttons, calls, visible } = await rig();
  bar.paint(stop());
  assert.equal(bar.el.attrs.role, 'region');
  assert.equal(bar.el.attrs['aria-label'], 'Cut review');
  for (const name of ['Previous cut (←)', 'Play (R)', 'Looks good (Y)', 'Next cut (→)']) {
    const b = btn(name);
    assert.ok(visible(b), name);
    assert.equal(b.title, name, 'the tooltip names it');
    assert.equal(b.textContent, '', 'an icon, no words');
  }
  assert.ok(!buttons().some((b) => /fix later|stop|close|escape/i.test(`${b.attrs['aria-label']} ${b.textContent}`)));
  assert.ok(btn('Looks good (Y)').classes.has('bg-accent'), 'the one primary');
  assert.equal(document.activeElement, btn('Looks good (Y)'), 'Return is Yes');
  btn('Previous cut (←)').click(); btn('Play (R)').click(); btn('Looks good (Y)').click(); btn('Next cut (→)').click();
  assert.deepEqual(calls, ['prev', 'play', 'yes', 'next']);
});

test('Tab order: the filter, then ‹ ▶ ✓ ›', async () => {
  const { bar, buttons } = await rig();
  bar.paint(stop());
  assert.deepEqual(buttons().map((b) => b.attrs['aria-label'] ?? b.textContent),
    ['All', 'Magic', 'Unapproved', 'Previous cut (←)', 'Play (R)', 'Looks good (Y)', 'Next cut (→)']);
});

test('an approved cut: ✓ turns green and pressed, a green ✓ beside the counter, said to the screen reader', async () => {
  const { bar, btn, visible } = await rig();
  const mark = () => bar.el.all().find((n) => /of 38$/.test(n.textContent) && n.tag === 'span').parent.children[0];
  bar.paint(stop());
  assert.equal(btn('Looks good (Y)').attrs['aria-pressed'], 'false');
  assert.ok(!visible(mark()), 'no mark before a Looks good');
  bar.paint(stop({ chosen: 'yes' }));
  const yes = btn('Looks good (Y)');
  assert.ok(yes.classes.has('bg-ok') && !yes.classes.has('bg-accent'));
  assert.equal(yes.attrs['aria-pressed'], 'true');
  assert.equal(yes.title, 'Approved · Y for the next cut');
  assert.ok(visible(mark()));
  const live = bar.el.all().find((n) => n.attrs['aria-live'] === 'polite');
  assert.match(live.textContent, /Approved\.$/);
  bar.paint(stop({ chosen: 'no' }));
  assert.ok(btn('Looks good (Y)').classes.has('bg-accent') && !visible(mark()), 'an old No reads as not approved');
});

test('the filter: a segmented control, the choice pressed, an empty choice dimmed and inert; a pick calls back', async () => {
  const { bar, seg, calls } = await rig();
  bar.paint(stop({ only: 'magic', counts: { all: 5, magic: 3, unapproved: 0 } }));
  assert.deepEqual(['all', 'magic', 'unapproved'].map((o) => seg(o).attrs['aria-pressed']), ['false', 'true', 'false']);
  assert.equal(seg('unapproved').attrs['aria-disabled'], 'true');
  assert.equal(seg('all').attrs['aria-disabled'], undefined);
  seg('unapproved').click();
  seg('all').click();
  assert.deepEqual(calls, ['choose:all']);
  assert.ok(seg('all').title, 'a hover says what it holds');
});

test('the live region reads the count and the full reason once per stop; first how to stop', async () => {
  const { bar } = await rig();
  const live = () => bar.el.all().find((n) => n.attrs['aria-live'] === 'polite');
  bar.paint(stop());
  assert.equal(live().textContent, 'Reviewing 38 cuts. Stop review is in the toolbar. Cut 7 of 38. Magic: Earlier take · kept “so today we want to…”.');
  bar.paint(stop({ first: 8, last: 8, more: 1 }));
  assert.equal(live().textContent, 'Cut 8 of 38. Magic: Earlier take · kept “so today we want to…” · +1 more.');
});

test('the counter’s hover is the reason', async () => {
  const { bar, text } = await rig();
  bar.paint(stop({ by: 'you', reason: 'Your cut · start of the video' }));
  const count = bar.el.all().find((n) => n.textContent === '7 of 38' && n.tag === 'span');
  assert.equal(count.title, 'Your cut · start of the video');
  assert.ok(!text().includes('Your cut · start of the video'));
});

test('All done: every cut gone through; a green check, friendly words, only ‹ and the filter left', async () => {
  const { bar, btn, barEnd, visible, text } = await rig();
  assert.deepEqual(barEnd(end()), { title: 'All done', line: 'All 38 cuts approved' });
  assert.deepEqual(barEnd(end({ approved: 36 })), { title: 'All done', line: '36 of 38 approved' }, 'two put back');
  assert.deepEqual(barEnd(end({ checked: 30, approved: 30 })), { title: 'End of cuts', line: '30 of 38 approved' });
  assert.deepEqual(barEnd(end({ total: 1, checked: 1, approved: 1 })), { title: 'All done', line: 'The cut is approved' });
  assert.deepEqual(barEnd(end({ empty: true, total: 0, checked: 0, approved: 0 })), { title: 'No cuts left', line: '' });
  bar.paint(stop());
  bar.paint(end());
  assert.deepEqual(text(), ['All', 'Magic', 'Unapproved', 'All done', 'All 38 cuts approved']);
  assert.ok(visible(btn('Previous cut (←)')), '‹ goes back to the last cut');
  for (const n of ['Play (R)', 'Looks good (Y)', 'Next cut (→)']) assert.ok(!visible(btn(n)), n);
  const check = bar.el.all().find((n) => n.classes.has('bg-ok') && visible(n));
  assert.ok(check, 'the green check');
  assert.equal(document.activeElement, bar.el, 'focus rests on the bar: nothing to press by accident');
  bar.paint(end({ checked: 30, approved: 30 }));
  assert.ok(!bar.el.all().some((n) => n.classes.has('bg-ok') && visible(n)), 'no check when some were skipped');
  assert.deepEqual(text().slice(3), ['End of cuts', '30 of 38 approved']);
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

test('‹ ›: dimmed (not disabled) where there is nowhere to go', async () => {
  const { bar, btn } = await rig();
  bar.paint(stop({ hasPrev: false }));
  assert.equal(btn('Previous cut (←)').attrs['aria-disabled'], 'true', 'the first cut');
  assert.equal(btn('Previous cut (←)').disabled, false, 'focus can stay on it');
  assert.equal(btn('Next cut (→)').attrs['aria-disabled'], undefined, '› on the last cut opens the end');
  bar.paint(stop());
  assert.equal(btn('Previous cut (←)').attrs['aria-disabled'], undefined);
});

test('the done line offers R to review before ⌘Z, and the notes after it', () => {
  assert.equal(doneLine('38 cuts · 24:10 → 14:52 · ⌘Z to undo', 0, true), '38 cuts · 24:10 → 14:52 · R to review · ⌘Z to undo');
  assert.equal(doneLine('38 cuts · 24:10 → 14:52 · ⌘Z to undo', 2, true), '38 cuts · 24:10 → 14:52 · R to review · 2 notes to check · ⌥→ · ⌘Z to undo');
  assert.equal(doneLine('Nothing cut.', 0, false), 'Nothing cut.');
});
