// The whole of src/main.js, loaded once on a fake DOM with a fake Tauri: launch reaches Home without an error
// (no use before definition), and asks Rust in order: close whatever a reload left open, sweep, list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';

const doc = makeDocument();
const make = doc.createElement;
doc.createElement = (tag) => {
  const n = make(tag); // plus what a <video> and classList.replace need
  n.classList.replace = (a, b) => n.classes.delete(a) && (n.classes.add(b), true);
  return Object.assign(n, { play: async () => {}, pause() {}, load() {}, currentTime: 0, duration: NaN, paused: true, readyState: 0, src: '', scrollIntoView() {} });
};
doc.createTextNode = (t) => Object.assign(make('#text'), { _text: String(t) });
const byId = {};
doc.getElementById = (id) => (byId[id] ??= Object.assign(doc.createElement('div'), { id }));
doc.querySelector = () => null;
doc.querySelectorAll = () => [];
doc.documentElement = doc.createElement('html');
doc.hasFocus = () => true;

const calls = [];
const errors = [];
const summary = { id: 'p1', name: 'Take one', usedAt: Date.now(), deletesAt: Date.now() + 864e6, locked: false, length: 72, thumb: null, missing: false };
const answers = { close_project: null, sweep_projects: 1, list_projects: [summary], claude_status: { state: 'ready' }, waveform: { seconds: 72, peaks: [] } };
const noop = () => {};
const store = {};

Object.assign(globalThis, {
  document: doc,
  window: globalThis,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  requestAnimationFrame: (f) => setTimeout(f, 0),
  cancelAnimationFrame: (t) => clearTimeout(t),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  devicePixelRatio: 2,
  __TAURI__: {
    core: {
      invoke: async (cmd, args) => { calls.push(cmd); return cmd in answers ? answers[cmd] : null; },
      convertFileSrc: (p) => `asset://${p}`,
    },
    event: { listen: async () => noop },
    webview: { getCurrentWebview: () => ({ onDragDropEvent: async () => noop }) },
    window: { getCurrentWindow: () => ({ onCloseRequested: async () => noop, setTitle: async () => {}, close: async () => {}, destroy: async () => {} }) },
    dialog: { open: async () => null, ask: async () => false },
  },
});
const origError = console.error;
console.error = (...a) => errors.push(a);
process.on('unhandledRejection', (e) => errors.push(['unhandled', e]));

test('launch reaches Home: close, sweep, list, then the cards, with nothing thrown', async () => {
  await import('../src/main.js');
  await new Promise((r) => setTimeout(r, 50));
  console.error = origError;
  assert.deepEqual(errors, []);
  const order = ['close_project', 'sweep_projects', 'list_projects'].map((c) => calls.indexOf(c));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `calls: ${calls.join(', ')}`);
  assert.ok(!byId.home.classes.has('hidden'), 'Home shows when there are projects');
  assert.ok(byId.empty.classes.has('hidden'));
  assert.ok(byId['home-button'].classes.has('hidden'), 'no ‹ on Home');
  assert.equal(byId['home-grid'].children.length, 1, 'one card');
  assert.ok(!calls.includes('save_project'), 'nothing open, nothing saved');
});

test('⌫ on a card asks Rust’s confirm (Cancel the default); answered with Return or Esc, the project stays', async () => {
  answers.confirm_delete = false; // what Rust answers for Return, Esc or Cancel (src-tauri/src/confirm.rs)
  const button = byId['home-grid'].querySelector('button');
  button.onkeydown({ key: 'Backspace', preventDefault() {}, stopPropagation() {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(calls.includes('confirm_delete'), `calls: ${calls.join(', ')}`);
  assert.ok(!calls.includes('delete_project'));
  assert.equal(byId['home-grid'].children.length, 1, 'the card stays');
});

test('a click on the card opens it: the editor and ‹ show, and the new project saves itself a second later', async () => {
  answers.open_project = { summary, parts: [{ id: 'a', path: '/v/take.mov', name: 'take.mov', swap: null }], ui: null, existing: false };
  console.error = (...a) => errors.push(a);
  byId['home-grid'].querySelector('button').onclick();
  await new Promise((r) => setTimeout(r, 1200));
  console.error = origError;
  assert.deepEqual(errors, []);
  assert.ok(!byId.banner.classes.has('flex'), `banner: ${byId['banner-text']?.textContent}`);
  assert.ok(calls.includes('open_project'));
  assert.ok(byId.home.classes.has('hidden'));
  assert.ok(!byId.editor.classes.has('hidden'));
  assert.ok(!byId['home-button'].classes.has('hidden'));
  assert.equal(byId.title.textContent, 'Take one');
  assert.ok(calls.includes('save_project'), `calls: ${calls.join(', ')}`);
});
