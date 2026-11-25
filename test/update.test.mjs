// The update pill (src/ui/update.js, design/update-prompt.md): hidden unless there's news; one click downloads with
// progress; the next saves and restarts; failures go to the banner with Try again; a reload joins a running download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { updateView, createUpdatePill } from '../src/ui/update.js';

const U = { version: '0.2.0', notes: 'Faster audio swap\nAnd more', date: null };
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup({ check = U, install, storage } = {}) {
  const doc = makeDocument();
  const els = Object.fromEntries(['button', 'glyph', 'label', 'notes', 'track', 'bar'].map((k) => [k, doc.createElement(k === 'button' ? 'button' : 'span')]));
  els.button.classList.add('hidden');
  const calls = [];
  let progress = null;
  let finish;
  const errors = [];
  const saved = [];
  const pill = createUpdatePill(els, {
    invoke: async (cmd) => {
      calls.push(cmd);
      if (cmd === 'update_check') return typeof check === 'function' ? check() : check;
      if (cmd === 'update_install') return install ? install() : new Promise((res, rej) => { finish = { res, rej }; });
      return null;
    },
    listen: (name, f) => { assert.equal(name, 'update://progress'); progress = f; },
    storage,
    beforeRestart: async () => { saved.push('saved'); },
    onError: (m, retry) => errors.push({ m, retry }),
  });
  return { els, pill, calls, errors, saved, emit: (p) => progress({ payload: p }), finish: () => finish };
}

const shown = (els) => !els.button.classes.has('hidden');

test('view: hidden with nothing new; version and the first line of the notes when there is', () => {
  assert.equal(updateView({ phase: 'none' }), null);
  const v = updateView({ phase: 'available', update: U });
  assert.equal(v.label, 'Update to 0.2.0');
  assert.equal(v.notes, 'Faster audio swap');
  assert.match(v.title, /And more/);
  assert.equal(updateView({ phase: 'available', update: { ...U, notes: '' } }).notes, '');
});

test('view: progress in percent, or megabytes when the size is unknown', () => {
  assert.equal(updateView({ phase: 'downloading', update: U, downloaded: 21e6, total: 50e6 }).label, 'Updating… 42 %');
  const unknown = updateView({ phase: 'downloading', update: U, downloaded: 12e6, total: null });
  assert.equal(unknown.label, 'Updating… 12 MB');
  assert.equal(unknown.pct, null);
  assert.equal(updateView({ phase: 'ready', update: U }).label, 'Restart to update');
});

test('no update, offline or a failed check: the pill never shows', async () => {
  for (const check of [null, () => { throw new Error('offline'); }]) {
    const t = setup({ check });
    await t.pill.check();
    assert.ok(!shown(t.els));
  }
});

test('available → click downloads with progress → ready → click saves, then restarts', async () => {
  const t = setup();
  await t.pill.check();
  assert.ok(shown(t.els));
  assert.equal(t.els.label.textContent, 'Update to 0.2.0');
  assert.equal(t.els.notes.textContent, 'Faster audio swap');

  t.els.button.click();
  assert.equal(t.pill.state.phase, 'downloading');
  t.emit({ downloaded: 25, total: 100 });
  assert.equal(t.els.label.textContent, 'Updating… 25 %');
  assert.equal(t.els.bar.style.width, '25%');
  assert.ok(!t.els.track.classes.has('hidden'));
  assert.equal(t.els.button.getAttribute('aria-disabled'), 'true');
  t.els.button.click(); // busy: a second click starts nothing
  assert.equal(t.calls.filter((c) => c === 'update_install').length, 1);

  t.finish().res(null);
  await tick();
  assert.equal(t.els.label.textContent, 'Restart to update');
  assert.ok(t.els.track.classes.has('hidden'));
  t.els.button.click();
  await tick();
  await tick();
  assert.deepEqual(t.saved, ['saved'], 'the project is saved first');
  assert.equal(t.calls.at(-1), 'update_restart');
});

test('a failed download: back to Update, and the banner gets the message with Try again', async () => {
  const t = setup();
  await t.pill.check();
  t.els.button.click();
  t.finish().rej("Couldn't download the update. Check your connection and try again.");
  await tick();
  assert.equal(t.pill.state.phase, 'available');
  assert.equal(t.errors.length, 1);
  assert.match(t.errors[0].m, /Couldn't download/);
  t.errors[0].retry();
  assert.equal(t.pill.state.phase, 'downloading');
});

test('a page reload during a download joins it instead of offering Update again', async () => {
  const mem = {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const first = setup({ storage });
  await first.pill.check();
  first.els.button.click();
  const again = setup({ storage, install: async () => null }); // Rust: finished already, resolves at once
  await again.pill.check();
  await tick();
  assert.equal(again.pill.state.phase, 'ready');
  assert.ok(again.calls.includes('update_install'));
});
