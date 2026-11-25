// Export: src/ui/export.js — the pure views, then the button and popover on fake export commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';

globalThis.document = makeDocument();
const {
  exportSpans, lengthOf, estimate, sizeText, factsText, spaceView, progressText, percent, buttonView, popoverView, baseName,
  createExport, CANCELLED, NOTHING,
} = await import('../src/ui/export.js');

const T = { folder: '/Users/me/Movies', folderName: 'Movies', name: 'talk – cut.mp4', free: 500e9, width: 3840, height: 2160, fps: 29.97 };
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- Pure ----------

test('the spans are what playback plays, to the millisecond', () => {
  const parts = [{ id: 1, duration: 10 }, { id: 2, duration: 5 }];
  const spans = exportSpans(parts, [{ part: 1, s: 2.00049, e: 3.5 }, { part: 2, s: 0, e: 5 }]);
  assert.deepEqual(spans, [{ part: 1, s: 0, e: 2 }, { part: 1, s: 3.5, e: 10 }]);
  assert.equal(lengthOf(spans), 8.5);
  assert.deepEqual(exportSpans(parts, [{ part: 1, s: 0, e: 10 }, { part: 2, s: 0, e: 5 }]), []);
});

test('sizes read as Finder counts them', () => {
  assert.equal(sizeText(2.14e9), '2.1 GB');
  assert.equal(sizeText(8e8), '800 MB');
  assert.equal(sizeText(1200), '1 KB');
  assert.ok(estimate('prores', T, 60) > estimate('mp4', T, 60) * 5);
});

test('the facts line names codec, picture, rate and length', () => {
  assert.equal(factsText('mp4', T, 892), 'H.264 · 3840 × 2160 · 29.97 fps · 14:52');
  assert.equal(factsText('prores', { ...T, fps: 30 }, 60), 'ProRes 422 HQ · .mov · 3840 × 2160 · 30 fps · 01:00');
});

test('not enough space says so, in the folder’s name', () => {
  assert.deepEqual(spaceView('mp4', T, 60).short, false);
  assert.match(spaceView('mp4', T, 60).text, /^about \d+ MB$/);
  const v = spaceView('prores', { ...T, free: 1e9 }, 3600);
  assert.equal(v.short, true);
  assert.match(v.text, /^Not enough space in Movies: needs about [\d.]+ GB, 1\.0 GB free$/);
  assert.equal(spaceView('prores', { ...T, free: 0 }, 3600).short, false); // unknown free space never blocks
});

test('progress: starting, percent, a time left after 3 s, finishing', () => {
  assert.equal(progressText(0, 100, 0), 'Starting…');
  assert.equal(progressText(25, 100, 1000), '25 %');
  assert.equal(progressText(25, 100, 60000), '25 % · about 3 min left');
  assert.equal(progressText(100, 100, 9000), '100 % · finishing');
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(5, 0), 0);
});

test('the button: plain, filled when all is reviewed, disabled when all is cut, its run and its result', () => {
  assert.deepEqual(buttonView({ kind: 'idle' }), { label: 'Export', glyph: true, look: 'plain', disabled: false });
  assert.equal(buttonView({ kind: 'idle' }, { primary: true }).look, 'filled');
  assert.deepEqual(buttonView({ kind: 'idle' }, { primary: true, nothing: true }), { label: 'Export', glyph: true, look: 'plain', disabled: true });
  assert.equal(buttonView({ kind: 'exporting', done: 42, total: 100 }).label, 'Exporting 42 %');
  assert.equal(buttonView({ kind: 'done', fresh: true }).label, 'Exported');
  assert.equal(buttonView({ kind: 'done', fresh: false }).label, 'Export');
  assert.equal(popoverView({ kind: 'idle' }), 'ready');
  assert.equal(popoverView({ kind: 'exporting' }), 'exporting');
  assert.equal(popoverView({ kind: 'done' }), 'done');
  assert.equal(baseName('/a/b/my video – cut.mp4'), 'my video – cut.mp4');
});

// ---------- The button and popover ----------

function rig({ spans = [{ part: 1, s: 0, e: 60 }], target = T, video } = {}) {
  const doc = makeDocument();
  globalThis.document = doc;
  const button = doc.createElement('button');
  const popup = doc.createElement('section');
  popup.classList.add('hidden');
  doc.body.append(button, popup);
  const calls = [];
  const events = {};
  const banners = [];
  const mem = new Map();
  let finish;
  const invoke = (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'export_target') return Promise.resolve({ ...target, name: args.format === 'prores' ? 'talk – cut.mov' : target.name });
    if (cmd === 'export_video') return video ?? new Promise((res, rej) => { finish = { res, rej }; });
    return Promise.resolve();
  };
  const x = createExport({ button, popup }, {
    invoke,
    listen: (k, f) => { events[k] = f; },
    chooseFolder: async () => '/Volumes/Edit',
    spans: () => spans,
    store: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) },
    showBanner: (text, action) => banners.push({ text, action }),
    now: () => 0,
  });
  x.paint({ hidden: false, nothing: !spans.length, primary: false });
  const find = (text) => popup.all().find((n) => n.tag === 'button' && n.textContent === text);
  return { doc, button, popup, calls, events, banners, mem, x, find, done: (v) => finish.res(v), fail: (e) => finish.rej(e) };
}

test('hidden with no video; disabled, with why, when everything is cut', () => {
  const r = rig({ spans: [] });
  assert.equal(r.button.disabled, true);
  assert.equal(r.button.title, NOTHING);
  r.button.click();
  assert.equal(r.x.isOpen(), false);
  r.x.paint({ hidden: true });
  assert.ok(r.button.classList.contains('hidden'));
});

test('open: Ready asks Rust for the target, focuses Export; Esc closes back to the button', async () => {
  const r = rig();
  r.button.click();
  assert.equal(r.x.isOpen(), true);
  assert.deepEqual(r.calls[0], ['export_target', { folder: null, format: 'mp4' }]);
  assert.equal(r.doc.activeElement, r.find('Export'), 'Export has focus before Rust answers');
  await tick();
  assert.match(r.popup.textContent, /H\.264 · 3840 × 2160 · 29\.97 fps · 01:00/);
  assert.match(r.popup.textContent, /Movies/);
  assert.equal(r.doc.activeElement, r.find('Export'));
  assert.equal(r.button.getAttribute('aria-expanded'), 'true');
  const ev = r.popup.fire('keydown', { key: 'Escape' });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(r.x.isOpen(), false);
  assert.equal(r.doc.activeElement, r.button);
});

test('⌘E then Return at once exports: Export waits for the target, a second press does nothing', async () => {
  const r = rig();
  r.x.open();
  r.doc.activeElement.click(); // Return on the focused Export, before export_target has answered
  r.doc.activeElement?.click?.();
  await tick();
  await tick();
  const videos = r.calls.filter(([c]) => c === 'export_video');
  assert.equal(videos.length, 1);
  assert.equal(videos[0][1].out, '/Users/me/Movies/talk – cut.mp4');
});

test('the format is remembered and switches the file’s name', async () => {
  const r = rig();
  r.x.open();
  await tick();
  r.popup.all().find((n) => n.dataset.format === 'prores').click();
  assert.equal(r.mem.get('export.format'), 'prores');
  assert.deepEqual(r.calls.at(-1), ['export_target', { folder: null, format: 'prores' }]);
  await tick();
  assert.match(r.popup.textContent, /ProRes 422 HQ/);
});

test('Change… picks a folder and remembers it', async () => {
  const r = rig();
  r.x.open();
  await tick();
  r.find('Change…').click();
  await tick();
  assert.equal(r.mem.get('export.folder'), '/Volumes/Edit');
  assert.deepEqual(r.calls.at(-1), ['export_target', { folder: '/Volumes/Edit', format: 'mp4' }]);
});

test('not enough space: Export is off and the line says why', async () => {
  const r = rig({ target: { ...T, free: 1e6 } });
  r.x.open();
  await tick();
  assert.equal(r.find('Export').disabled, true);
  assert.match(r.popup.textContent, /Not enough space in Movies/);
});

test('export: spans and path to Rust, progress on the button and in the popover, then Done → Show in Finder', async () => {
  const r = rig();
  r.x.open();
  await tick();
  r.find('Export').click();
  await tick();
  assert.deepEqual(r.calls.at(-1), ['export_video', { spans: [{ part: 1, s: 0, e: 60 }], out: '/Users/me/Movies/talk – cut.mp4', format: 'mp4' }]);
  assert.match(r.popup.textContent, /Exporting talk – cut\.mp4/);
  assert.notEqual(r.doc.activeElement, r.find('Cancel')); // a second Return never cancels
  r.events['export://progress']({ payload: { done: 450, total: 1800 } });
  assert.equal(r.button.getAttribute('aria-label'), 'Exporting 25 %');
  assert.match(r.popup.textContent, /25 %/);
  r.events['export://done']({ payload: '/Users/me/Movies/talk – cut.mp4' }); // ours: the promise answers
  r.done({ file: '/Users/me/Movies/talk – cut.mp4', seconds: 60 });
  await tick();
  assert.equal(r.x.state.kind, 'done');
  assert.match(r.popup.textContent, /Exported/);
  assert.match(r.popup.textContent, /talk – cut\.mp4 · 01:00/);
  assert.equal(r.button.getAttribute('aria-label'), 'Exported');
  r.find('Show in Finder').click();
  assert.deepEqual(r.calls.at(-1), ['export_reveal', { path: '/Users/me/Movies/talk – cut.mp4' }]);
  assert.equal(r.x.isOpen(), false);
  assert.equal(r.x.state.kind, 'idle'); // seen: the next open is Ready
});

test('the popover can close while it runs; reopening shows the run', async () => {
  const r = rig();
  r.x.open();
  await tick();
  r.find('Export').click();
  await tick();
  r.x.close();
  r.events['export://progress']({ payload: { done: 900, total: 1800 } });
  assert.equal(r.button.getAttribute('aria-label'), 'Exporting 50 %');
  r.button.click();
  assert.match(r.popup.textContent, /Exporting talk/);
});

test('Cancel: no banner, back to Ready', async () => {
  const r = rig();
  r.x.open();
  await tick();
  r.find('Export').click();
  await tick();
  r.find('Cancel').click();
  assert.equal(r.calls.at(-1)[0], 'export_cancel');
  r.fail(CANCELLED);
  await tick();
  assert.equal(r.x.state.kind, 'idle');
  assert.equal(r.banners.length, 0);
  assert.ok(r.find('Export'));
});

test('a failure: one banner with Try again', async () => {
  const r = rig();
  r.x.open();
  await tick();
  r.find('Export').click();
  await tick();
  r.fail('The disk is full.');
  await tick();
  assert.equal(r.banners.length, 1);
  assert.equal(r.banners[0].text, 'The disk is full.');
  assert.equal(r.banners[0].action.label, 'Try again');
});

test('an export already running when the page loads is picked up from its progress', () => {
  const r = rig();
  r.events['export://progress']({ payload: { done: 10, total: 100 } });
  assert.equal(r.x.state.kind, 'exporting');
  assert.equal(r.button.getAttribute('aria-label'), 'Exporting 10 %');
  r.events['export://done']({ payload: '/x/y.mp4' });
  assert.equal(r.x.state.kind, 'done');
  assert.equal(r.button.getAttribute('aria-label'), 'Exported');
});

test('filled once everything is reviewed', () => {
  const r = rig();
  r.x.paint({ primary: true });
  assert.ok(r.button.className.includes('bg-accent'));
});
