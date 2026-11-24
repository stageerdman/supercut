// Replace audio and Generate transcript: src/ui/audio.js, audio-panel.js, transcript-generate.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import {
  sortDrop, dragKind, audioButton, linedUpText, noFitText, isNoFit, sourceText, nudgeText, nudgeSpoken, heardFrom, audioOf, FRAME,
} from '../src/ui/audio.js';
import { generateView, hintView, regenerateIcon, progressText } from '../src/ui/transcript-generate.js';

globalThis.document = makeDocument();
const { createAudioControl, nudgeOf } = await import('../src/ui/audio-panel.js');

const mic = (offset = 1.2, more = {}) => ({ recording: '/m/shure-take.wav', offset, matched: 1.2, synced: true, media: '/c/1.mov', ...more });
const part = (id, more = {}) => ({ id, name: `${id}.mov`, path: `/v/${id}.mov`, swap: null, transcript: null, error: null, ...more });

// ---------- audio.js ----------

test('a drop splits into videos, audio and the rest', () => {
  assert.deepEqual(sortDrop(['/a.mov', '/b.WAV', '/c.txt', '/d.m4a']), { videos: ['/a.mov'], audio: ['/b.WAV', '/d.m4a'], other: ['/c.txt'] });
});

test('the drag says what a drop will do', () => {
  assert.equal(dragKind(null, true), null);
  assert.equal(dragKind(['/a.wav'], true), 'audio');
  assert.equal(dragKind(['/a.wav'], false), 'audio-first');
  assert.equal(dragKind(['/a.mov', '/a.wav'], false), 'video');
  assert.equal(dragKind(['/a.pdf'], true), 'no');
  assert.equal(dragKind([], true), 'no');
});

test('the button reads Replace audio, then the mic file', () => {
  assert.equal(audioButton([part(1)]).text, 'Replace audio');
  assert.equal(audioButton([part(1)]).swapped, false);
  const one = audioButton([part(1, { swap: mic() }), part(2)]);
  assert.equal(one.text, 'shure-take.wav');
  assert.equal(one.label, 'Audio: shure-take.wav');
  const two = audioButton([part(1, { swap: mic() }), part(2, { swap: mic(0, { recording: '/m/b.wav' }) })]);
  assert.equal(two.text, '2 mic files');
  assert.equal(two.title, 'shure-take.wav, b.wav');
});

test('lined-up and no-fit words', () => {
  assert.equal(linedUpText([1], 1), 'Mic audio lined up');
  assert.equal(linedUpText([2], 2), 'Mic audio lined up · part 2');
  assert.equal(linedUpText([1, 2], 2), 'Mic audio lined up · parts 1 and 2');
  assert.equal(noFitText('/m/other.wav'), "other.wav doesn't match this video's sound. Nothing changed.");
  assert.equal(isNoFit("other.wav doesn't match this video's sound. Nothing changed."), true, "Rust's NoMatch");
  assert.equal(isNoFit("This audio file can't be read. (x: y)"), false);
});

test('rows, nudge and what Generate will hear', () => {
  assert.equal(sourceText(part(1)), 'Camera audio');
  assert.equal(sourceText(part(1, { swap: mic() })), 'shure-take.wav');
  assert.equal(nudgeText(0), '0.00 s');
  assert.equal(nudgeText(0.0667), '+0.07 s');
  assert.equal(nudgeText(-0.03), '−0.03 s');
  assert.equal(nudgeSpoken(0), 'as matched');
  assert.equal(nudgeSpoken(0.07), '7 hundredths of a second later');
  assert.equal(nudgeSpoken(-0.01), '1 hundredth of a second earlier');
  assert.equal(heardFrom(part(1)), 'From the camera audio · on this Mac');
  assert.equal(heardFrom(part(1, { swap: mic() })), 'From shure-take.wav · on this Mac');
  assert.deepEqual(audioOf([part(1), part(2, { swap: mic() })]), [{ id: 1, swap: null }, { id: 2, swap: mic() }]);
});

// ---------- audio-panel.js ----------

function rig(parts) {
  const doc = globalThis.document;
  const [button, panel, rows, replace, camera] = ['button', 'div', 'div', 'button', 'button'].map((t) => doc.createElement(t));
  panel.classList.add('hidden');
  panel.append(rows, replace, camera);
  doc.body.append(button, panel);
  const said = [];
  const c = createAudioControl({ button, panel, rows, replace, camera }, {
    parts: () => parts,
    onPick: () => said.push('pick'),
    onCamera: () => said.push('camera'),
    onNudge: (id, offset) => { said.push(['nudge', id, +offset.toFixed(4)]); parts.find((p) => p.id === id).swap.offset = offset; },
    onClose: () => said.push('close'),
  });
  return { c, button, panel, rows, replace, camera, said };
}

test('before any swap the button opens the picker, hidden with no video and in review', () => {
  const parts = [];
  const r = rig(parts);
  r.c.paint();
  assert.ok(r.button.classes.has('hidden'));
  parts.push(part(1));
  r.c.paint();
  assert.ok(!r.button.classes.has('hidden'));
  assert.equal(r.button.getAttribute('aria-label'), 'Replace audio');
  r.button.click();
  assert.deepEqual(r.said, ['pick']);
  assert.ok(r.panel.classes.has('hidden'), 'no panel yet');
  r.c.paint({ hidden: true });
  assert.ok(r.button.classes.has('hidden'));
  r.c.paint({ busy: true });
  assert.equal(r.button.disabled, true, 'not while lining up');
});

test('after a swap the button opens the panel: a row per part, a nudge on mic rows', () => {
  const parts = [part(1, { swap: mic() }), part(2)];
  const r = rig(parts);
  r.c.paint();
  r.button.click();
  assert.equal(r.c.open, true);
  assert.equal(r.button.getAttribute('aria-expanded'), 'true');
  assert.equal(r.rows.children.length, 2);
  assert.match(r.rows.children[0].textContent, /Part 1shure-take\.wav‹0\.00 s›/);
  assert.equal(r.rows.children[1].textContent, 'Part 2Camera audio');
  const spin = r.rows.querySelector('[data-nudge="1"]');
  assert.equal(document.activeElement, spin, 'focus on the nudge');
  assert.equal(spin.getAttribute('aria-label'), 'Audio timing, part 1');
  spin.fire('keydown', { key: 'ArrowRight' });
  assert.deepEqual(r.said.at(-1), ['nudge', 1, +(1.2 + FRAME).toFixed(4)]);
  r.c.repaint();
  assert.equal(nudgeOf(parts[0]).toFixed(3), FRAME.toFixed(3));
  assert.match(r.rows.children[0].textContent, /\+0\.03 s/);
});

test('Esc closes the panel and ends the nudge; Use camera audio and Replace… report', () => {
  const parts = [part(1, { swap: mic() })];
  const r = rig(parts);
  r.c.paint();
  r.button.click();
  assert.equal(r.rows.children[0].textContent.startsWith('Part'), false, 'one part: no part numbers');
  document.listeners.keydown.at(-1)({ key: 'Escape', preventDefault() {} });
  assert.equal(r.c.open, false);
  assert.ok(r.said.includes('close'));
  r.button.click();
  r.camera.click();
  assert.equal(r.said.at(-1), 'camera');
  r.button.click();
  r.replace.click();
  assert.equal(r.said.at(-1), 'pick');
});

// ---------- transcript-generate.js ----------

test('a part with no words offers Generate, naming the audio it will hear', () => {
  assert.deepEqual(generateView(part(1), null, null), { kind: 'generate', button: 'Generate transcript', caption: 'From the camera audio · on this Mac' });
  assert.equal(generateView(part(1, { swap: mic() }), null, null).caption, 'From shure-take.wav · on this Mac');
  assert.equal(generateView(part(1, { transcript: { words: [] } }), null, null), null);
});

test('Generate shows its progress in place, and failure offers Try again', () => {
  const working = generateView(part(1, { wanted: true }), { part: 1, stage: 'transcribe', done: 42, total: 100 }, null);
  assert.equal(working.kind, 'working');
  assert.equal(working.text, 'Transcribing… 42 %');
  assert.equal(generateView(part(2, { wanted: true }), { part: 1, done: 1, total: 2 }, null).text, 'Transcribing…', "another part's progress");
  assert.equal(generateView(part(1, { error: 'x' }), null, null).button, 'Try again');
  assert.match(progressText({ stage: 'download', done: 1, total: 600e6 }, null).text, /^Downloading speech model · 600 MB/);
});

test('after new audio: the hint offers Regenerate once; ↻ stays while words are stale', () => {
  const stalePart = part(1, { transcript: { words: [] }, heard: '/v/1.mov', swap: mic() });
  const fresh = part(2, { transcript: { words: [] }, heard: '/v/2.mov' });
  assert.equal(hintView([stalePart], { on: true }).actions, true);
  assert.equal(hintView([stalePart], { on: false }), null, 'dismissed');
  assert.equal(hintView([fresh], { on: true }), null, 'nothing to regenerate');
  assert.deepEqual(regenerateIcon([stalePart, fresh]), { visible: true, disabled: false });
  assert.deepEqual(regenerateIcon([fresh]), { visible: false, disabled: false });
  const going = { ...stalePart, wanted: true };
  assert.equal(hintView([going], { on: false, progress: { part: 1, done: 1, total: 4 } }).text, 'Regenerating… 25 %');
  assert.deepEqual(regenerateIcon([going]), { visible: true, disabled: true });
});
