// Home's view (home-view.js, project-card.js) on the fake DOM: design/home-screen.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';

const DAY = 86400000;
const NOW = new Date(2026, 10, 24, 15).getTime();
const card = (id, more = {}) => ({ id, name: `video-${id}`, usedAt: NOW, locked: false, deletesAt: NOW + 30 * DAY, length: 65, thumb: null, ...more });

async function rig({ confirm = true, list = [card('a'), card('b'), card('c')], swept = 0, failRemove = false } = {}) {
  globalThis.document = makeDocument();
  const { createHomeView } = await import('../src/ui/home-view.js');
  const node = (tag) => { const n = document.createElement(tag); document.body.append(n); return n; };
  const strip = node('section');
  const text = document.createElement('p');
  text.dataset.stripText = '';
  const choose = document.createElement('button');
  strip.append(text, choose);
  const nodes = { strip, heading: node('h2'), grid: node('ul') };
  nodes.grid.clientWidth = 4 * 208 + 3 * 24; // 4 columns
  const calls = [];
  let menu = null;
  const view = createHomeView(nodes, {
    open: (id) => calls.push(`open:${id}`),
    setLocked: async (id, locked) => { calls.push(`lock:${id}:${locked}`); return { ...card(id), locked, deletesAt: locked ? null : NOW + 30 * DAY }; },
    remove: async (id) => { calls.push(`remove:${id}`); if (failRemove) throw new Error('busy'); },
    confirm: async (words) => { calls.push(`confirm:${words.title}`); return confirm; },
    popup: async (items, handlers) => { menu = { items, handlers }; },
    failed: (t) => calls.push(`failed:${t}`),
    changed: () => calls.push('changed'),
    now: () => NOW,
    fadeMs: 0,
  });
  view.show(list, swept);
  const cards = () => nodes.grid.children;
  const button = (id) => nodes.grid.all().find((n) => n.dataset.card === id);
  const lock = (id) => nodes.grid.all().find((n) => n.dataset.lock === id);
  const settle = () => new Promise((r) => setTimeout(r, 5));
  return { view, nodes, calls, cards, button, lock, settle, choose, text, menu: () => menu };
}

test('a card per project, newest first as given, as a labelled list', async () => {
  const { nodes, cards, button, view } = await rig();
  assert.equal(nodes.grid.attrs.role, 'list');
  assert.equal(nodes.grid.attrs['aria-label'], 'Projects');
  assert.deepEqual(cards().map((c) => c.dataset.id), ['a', 'b', 'c']);
  assert.equal(cards()[0].attrs.role, 'listitem');
  assert.equal(button('a').attrs['aria-label'], 'video-a, edited today, 1 minute 5 seconds, 30 days left');
  assert.match(button('a').textContent, /1:05.*video-a.*Today · 30 days left/);
  assert.equal(nodes.heading.textContent, 'Projects');
  assert.equal(view.count, 3);
});

test('card states: no picture → the film tile; a picture; locked; the last 3 days brighter', async () => {
  const { button, lock } = await rig({ list: [
    card('a'), card('b', { thumb: '/p/b/thumb.jpg' }), card('c', { locked: true, deletesAt: null }), card('d', { deletesAt: NOW + 2 * DAY }),
  ] });
  assert.ok(!button('a').all().some((n) => n.tag === 'img'), 'no thumb: no image');
  assert.equal(button('b').all().find((n) => n.tag === 'img').src, '/p/b/thumb.jpg');
  assert.equal(lock('c').attrs['aria-pressed'], 'true');
  assert.equal(lock('c').attrs['aria-label'], 'Unlock video-c');
  assert.ok(!lock('c').classes.has('opacity-0'), 'locked: the lock always shows');
  assert.ok(lock('a').classes.has('opacity-0') && lock('a').classes.has('group-hover:opacity-100'), 'unlocked: on hover only');
  assert.doesNotMatch(button('c').textContent, /left|Deletes/);
  const soon = button('d').all().find((n) => n.textContent === '2 days left');
  assert.ok(soon.classes.has('text-text'), 'brighter, never red');
  assert.ok(!button('a').all().find((n) => n.textContent === '30 days left').classes.has('text-text'));
});

test('click opens; the lock toggles without opening', async () => {
  const { button, lock, calls, settle } = await rig();
  button('b').click();
  lock('a').click();
  await settle();
  assert.deepEqual(calls, ['open:b', 'lock:a:true']);
  assert.equal(lock('a').attrs['aria-pressed'], 'true', 'repainted from Rust’s summary');
});

test('just swept: the heading says how many went', async () => {
  const { nodes } = await rig({ swept: 2 });
  assert.equal(nodes.heading.textContent, 'Projects · 2 old projects were deleted');
});

test('Delete… only after the confirm; focus goes to the next card', async () => {
  const { button, calls, cards, settle } = await rig();
  button('a').fire('keydown', { key: 'Backspace' });
  await settle();
  assert.deepEqual(calls, ['confirm:Delete “video-a”?', 'remove:a', 'changed']);
  assert.deepEqual(cards().map((c) => c.dataset.id), ['b', 'c']);
  assert.equal(document.activeElement, button('b'));
});

test('Cancel changes nothing', async () => {
  const { button, calls, cards, settle } = await rig({ confirm: false });
  button('b').fire('keydown', { key: 'Delete' });
  await settle();
  assert.deepEqual(calls, ['confirm:Delete “video-b”?']);
  assert.equal(cards().length, 3);
});

test('deleting the last card focuses the previous; the only one, the strip’s button', async () => {
  let r = await rig();
  r.button('c').fire('keydown', { key: 'Backspace' });
  await r.settle();
  assert.equal(document.activeElement, r.button('b'));
  r = await rig({ list: [card('a')] });
  r.button('a').fire('keydown', { key: 'Backspace' });
  await r.settle();
  assert.equal(r.view.count, 0);
  assert.equal(document.activeElement, r.choose);
});

test('a delete that fails keeps the card and says so', async () => {
  const { button, calls, cards, settle } = await rig({ failRemove: true });
  button('a').fire('keydown', { key: 'Backspace' });
  await settle();
  assert.equal(calls.at(-1), 'failed:Couldn\'t delete video-a. Try again.');
  assert.equal(cards().length, 3);
});

test('right-click: Open · Lock · Delete…, each doing what its gesture does', async () => {
  const { button, calls, menu, settle } = await rig();
  const e = button('a').fire('contextmenu', { clientX: 10, clientY: 20 });
  assert.ok(e.defaultPrevented);
  assert.deepEqual(menu().items.filter((i) => i.text).map((i) => i.text), ['Open', 'Lock', 'Delete…']);
  menu().handlers.open();
  menu().handlers.remove();
  await settle();
  assert.deepEqual(calls, ['open:a', 'confirm:Delete “video-a”?', 'remove:a', 'changed']);
});

test('arrows move focus across the grid', async () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => card(id));
  const { button } = await rig({ list });
  button('a').fire('keydown', { key: 'ArrowRight' });
  assert.equal(document.activeElement, button('b'));
  button('b').fire('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, button('f'));
  button('f').fire('keydown', { key: 'Home' });
  assert.equal(document.activeElement, button('a'));
});

test('first card focused, so Return goes back to work', async () => {
  const { view, button } = await rig();
  view.focusFirst();
  assert.equal(document.activeElement, button('a'));
});

test('drag over: the strip says what a drop would do', async () => {
  const { view, nodes, text } = await rig();
  view.drag('video');
  assert.equal(text.textContent, 'Drop to open');
  assert.ok(nodes.strip.classes.has('border-accent') && nodes.strip.classes.has('border-solid'));
  view.drag('audio-first');
  assert.equal(text.textContent, 'Add the video first');
  view.drag('no');
  assert.equal(text.textContent, 'Only video files open here');
  view.drag(null);
  assert.equal(text.textContent, 'Drop a video to start a new project');
  assert.ok(nodes.strip.classes.has('border-dashed') && !nodes.strip.classes.has('border-accent'));
});
