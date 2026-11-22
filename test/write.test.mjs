// Writing words (design/missed-words.md, "Where words go"): the write rule, Remove Text, unheard speech, the
// right-click menu. Pure, no window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeWords, writeTarget, removeText, fixWords } from '../src/ui/fix.js';
import { unheard, MIN_UNHEARD } from '../src/ui/unheard.js';
import { menuFor, popup } from '../src/ui/context-menu.js';
import { toggleSelection, wordSelection } from '../src/ui/selection.js';
import { isCut, cutsOf } from '../src/ui/cuts.js';
import { withWords } from '../src/ui/edit.js';
import { createHistory } from '../src/ui/history.js';
import { pauses } from '../src/ui/pauses.js';
import { layoutLabels } from '../src/ui/word-levels.js';

const W = (w, s, e) => ({ w, s, e });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const text = (ws) => ws.map((w) => w.w).join(' ');

// "it's _~~~_ working": speech at the words and at 0.6–0.9 (the unheard "not"), silence between.
const ITS = [W("it's", 0, 0.4), W('working', 1.2, 1.7)];
const SPEECH = [{ s: 0, e: 0.4 }, { s: 0.6, e: 0.9 }, { s: 1.2, e: 1.7 }];

// ---------- unheard speech ----------

test('unheard: speech runs minus words; short pieces dropped; no runs → none; memoised', () => {
  assert.deepEqual(unheard(SPEECH, ITS), [{ s: 0.6, e: 0.9 }]);
  assert.deepEqual(unheard([{ s: 0, e: 1.7 }], ITS), [{ s: 0.4, e: 1.2 }], 'a hole between words');
  assert.deepEqual(unheard([{ s: 0, e: 0.6 }], ITS), [], `0.2 s left: under ${MIN_UNHEARD} s`);
  assert.deepEqual(unheard([{ s: 0, e: 0.4 }], ITS), [], 'covered by a word');
  assert.deepEqual(unheard(undefined, ITS), []);
  assert.equal(unheard(SPEECH, ITS), unheard(SPEECH, ITS), 'same words → same array');
});

// ---------- the examples table in the spec ----------

test('the pill: "not" lands on the unheard time', () => {
  const r = writeWords(ITS, { s: 0.6, e: 0.9, unheard: true }, 'not', unheard(SPEECH, ITS));
  assert.equal(text(r.words), "it's not working");
  assert.deepEqual(r.words[1], { w: 'not', s: 0.6, e: 0.9, fixed: true });
  assert.equal(r.label, 'Added “not”');
  assert.deepEqual(unheard(SPEECH, r.words), [], 'the pill is gone');
});

test('retyping "working" as "not working": working keeps its time, "not" goes into the unheard gap', () => {
  const r = writeWords(ITS, wordSelection(1, ITS, 1, 1), 'not working', unheard(SPEECH, ITS));
  assert.equal(text(r.words), "it's not working");
  assert.equal(r.words[2], ITS[1], 'working untouched');
  assert.deepEqual(r.words[1], { w: 'not', s: 0.6, e: 0.9, fixed: true });
  assert.equal(r.label, 'Added “not”');
  const plain = writeWords(ITS, wordSelection(1, ITS, 1, 1), 'not working');
  assert.deepEqual(plain.words[1], { w: 'not', s: 0.4, e: 1.2, fixed: true }, 'no unheard speech: the whole gap');
});

test('a drag over the gap with no unheard speech: the word fills the free time, not the neighbours', () => {
  const r = writeWords(ITS, { part: 1, s: 0.3, e: 1.3 }, 'not');
  assert.deepEqual(r.words.map((w) => [w.w, w.s, w.e]), [["it's", 0, 0.4], ['not', 0.4, 1.2], ['working', 1.2, 1.7]]);
  const inside = writeWords(ITS, { part: 1, s: 0.5, e: 0.8, pause: true }, 'not');
  assert.deepEqual([inside.words[1].s, inside.words[1].e], [0.5, 0.8], 'a pause: its own time');
});

test('fixing one word keeps its time; one word to two shares it by letters (today)', () => {
  const cling = [W('use', 0, 0.3), W('cling', 0.4, 0.8), W('today', 0.9, 1.3)];
  const r = writeWords(cling, wordSelection(1, cling, 1, 1), 'Gling');
  assert.deepEqual(r.words[1], { w: 'Gling', s: 0.4, e: 0.8, fixed: true });
  assert.equal(r.label, 'Fixed “cling”');
  const g = writeWords([W('gonna', 1, 2)], { s: 1, e: 2 }, 'going to');
  assert.deepEqual(g.words, fixWords([W('gonna', 1, 2)], 0, 0, 'going to'));
  close(g.words[0].e, 1 + 5 / 7);
});

test('"so um the" → "so the": the text goes, its time is left free', () => {
  const ws = [W('so', 0, 0.3), W('um', 0.4, 0.7), W('the', 0.8, 1)];
  const r = writeWords(ws, wordSelection(1, ws, 0, 2), 'so the');
  assert.deepEqual(r.words, [ws[0], ws[2]]);
  assert.equal(r.label, 'Removed text “um”');
  assert.equal(pauses(r.words, 1).some((p) => p.s < 0.55 && 0.55 < p.e), true, 'a pause where "um" was (no speech runs)');
});

test('a drag inside one word has no room: that word is replaced', () => {
  const ws = [W('the', 0, 0.3), W('plan', 0.5, 1)];
  const sel = { part: 1, s: 0.5, e: 0.7 };
  assert.deepEqual(writeTarget(ws, sel), { replace: { from: 1, to: 1 } });
  const r = writeWords(ws, sel, 'planet');
  assert.deepEqual(r.words, [ws[0], { w: 'planet', s: 0.5, e: 1, fixed: true }]);
});

test('empty or same text → no change; labels quote three words then …', () => {
  assert.equal(writeWords(ITS, wordSelection(1, ITS, 0, 1), '   '), null);
  assert.equal(writeWords(ITS, wordSelection(1, ITS, 0, 1), " it's  working "), null);
  assert.equal(writeWords(ITS, { s: 0.5, e: 0.8 }, 'one two three four').label, 'Added “one two three…”');
});

test('adding after the last word goes up to the part’s end; unknown end → shares the word', () => {
  const r = writeWords(ITS, wordSelection(1, ITS, 1, 1), 'working now', [], 2.5);
  assert.equal(r.words[1], ITS[1]);
  assert.deepEqual(r.words[2], { w: 'now', s: 1.7, e: 2.5, fixed: true });
  const shared = writeWords(ITS, wordSelection(1, ITS, 1, 1), 'working now');
  assert.deepEqual(shared.words.slice(1).map((w) => [w.s, w.e]).flat().map((x) => +x.toFixed(4)), [1.2, 1.55, 1.55, 1.7]);
});

// ---------- the guarantee ----------

function rng(seed) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test('invariant over random writes: in order, no overlaps, nothing outside the replaced words changes', () => {
  const r = rng(7);
  const vocab = ['a', 'not', 'working', 'hello', 'um', 'Gling', 'so', 'yes'];
  for (let n = 0; n < 2000; n++) {
    const words = [];
    let t = r() * 0.5;
    const count = Math.floor(r() * 7);
    for (let k = 0; k < count; k++) {
      const s = t + r() * 0.6, e = s + 0.05 + r() * 0.5;
      words.push(W(vocab[Math.floor(r() * vocab.length)], s, e));
      t = e;
    }
    const length = t + r();
    const speech = [{ s: 0, e: length }].filter(() => r() < 0.5);
    const un = unheard(speech, words);
    const a = r() * length, b = r() * length;
    const sel = { part: 1, s: Math.min(a, b), e: Math.max(a, b) };
    const old = words.map((w) => w.w);
    const typed = Array.from({ length: Math.floor(r() * 4) }, () => (r() < 0.5 && old.length ? old[Math.floor(r() * old.length)] : vocab[Math.floor(r() * vocab.length)])).join(' ');
    const target = writeTarget(words, sel, un);
    const out = writeWords(words, sel, typed, un, length);
    const ctx = JSON.stringify({ words, sel, typed });
    if (!out) continue;
    for (let k = 1; k < out.words.length; k++) assert.ok(out.words[k - 1].e <= out.words[k].s + 1e-9, `overlap: ${ctx}`);
    for (const w of out.words) assert.ok(w.s < w.e + 1e-9 && w.s >= -1e-9, `bad time: ${ctx}`);
    const [from, to] = target.replace ? [target.replace.from, target.replace.to] : [target.insert.at, target.insert.at - 1];
    assert.deepEqual(out.words.slice(0, from), words.slice(0, from), `before changed: ${ctx}`);
    const after = words.length - 1 - to;
    assert.deepEqual(after ? out.words.slice(-after) : [], words.slice(to + 1), `after changed: ${ctx}`);
    for (const w of out.words) if (!words.includes(w)) assert.equal(w.fixed, true, `written word not fixed: ${ctx}`);
  }
});

// ---------- with cuts and undo ----------

test('a written word inside a cut stays cut; cuts never change; one undo step brings the old words back', () => {
  const ws = [W('so', 0.5, 0.7), W('um', 1.0, 1.3), W('yes', 2.0, 2.4)];
  const cuts = toggleSelection([], wordSelection(1, ws, 1, 1), ws, { 1: 3 }).cuts; // um: 0.85–1.65
  const h = createHistory({ cuts, words: { 1: ws } });
  const r = writeWords(ws, { part: 1, s: 1.35, e: 1.6 }, 'like'); // free time inside the cut
  h.push(withWords(h.edit, 1, r.words), r.label);
  assert.equal(h.edit.cuts, cuts, 'cuts untouched');
  assert.equal(isCut(r.words[2], cutsOf(cuts, 1)), true, '"like" is in the cut, so it is cut');
  const past = writeWords(ws, { part: 1, s: 1.7, e: 1.9 }, 'like');
  assert.equal(isCut(past.words[2], cutsOf(cuts, 1)), false, 'past the cut: not cut');
  const inCut = writeWords(ws, wordSelection(1, ws, 1, 1), 'uh huh');
  assert.ok(inCut.words.slice(1, 3).every((w) => isCut(w, cutsOf(cuts, 1))));
  assert.equal(h.undo().label, 'Added “like”');
  assert.equal(h.edit.words[1], ws);
});

test('a word written into a pause removes the pause; the strip lays it out like any word', () => {
  const ws = [W('hello', 0, 0.5), W('there', 2, 2.5)];
  assert.equal(pauses(ws, 3).length, 2);
  const r = writeWords(ws, { part: 1, s: 0.6, e: 1.9, pause: true }, 'out');
  assert.equal(pauses(r.words, 3).some((p) => p.s < 1.25 && 1.25 < p.e), false, 'no pause over "out"');
  const labels = layoutLabels({
    box: { id: 1, x: 0, w: 3000, len: 3 }, words: r.words, pauses: pauses(r.words, 3), scroll: 0, width: 3000,
    level: 'words', measure: (s) => s.length * 6,
  });
  assert.deepEqual(labels.map((l) => l.text), ['hello', 'out', 'there']);
});

// ---------- Remove Text ----------

test('Remove Text: the words go, the video stays, the time is free (unheard where speech was heard)', () => {
  const ws = [W('so', 0, 0.3), W('um', 0.4, 0.9), W('yes', 1.0, 1.3)];
  const r = removeText(ws, 1, 1);
  assert.deepEqual(r.words, [ws[0], ws[2]]);
  assert.equal(r.label, 'Removed text “um”');
  assert.deepEqual(unheard([{ s: 0, e: 1.3 }], r.words), [{ s: 0.3, e: 1.0 }]);
  assert.throws(() => removeText(ws, 2, 5), RangeError);
});

// ---------- right-click ----------

test('menuFor: words, unheard, a pause or range, a cut — Cut becomes Restore when all of it is cut', () => {
  const ids = (items) => items.map((i) => i.id ?? '—');
  const words = menuFor({ part: 1, s: 0, e: 1, words: true }, { words: true });
  assert.deepEqual(words.map((i) => i.text ?? '—'), ['Fix Text', 'Cut', '—', 'Remove Text']);
  assert.deepEqual(words.map((i) => i.accelerator ?? ''), ['Enter', 'Backspace', '', '']);
  assert.equal(menuFor({ s: 0, e: 1, words: true }, { words: true, restore: true })[1].text, 'Restore');
  assert.deepEqual(menuFor({ s: 0, e: 1, unheard: true }).map((i) => i.text), ['Write What’s Said…', 'Cut']);
  assert.deepEqual(menuFor({ s: 0, e: 1, pause: true }).map((i) => i.text), ['Write Words Here…', 'Cut']);
  assert.deepEqual(menuFor({ s: 0, e: 1 }, { restore: true }).map((i) => i.text), ['Write Words Here…', 'Restore']);
  assert.deepEqual(ids(menuFor({ s: 0, e: 1, cut: true }, { words: true })), ['toggle']);
  assert.deepEqual(menuFor(null), []);
});

test('popup: native items run their handler; separators are native; no Tauri → nothing', async () => {
  let made = null, at = 'unset';
  const tauri = {
    menu: { Menu: { new: async (o) => { made = o; return { popup: async (p) => { at = p; } }; } } },
    dpi: { LogicalPosition: class { constructor(x, y) { this.x = x; this.y = y; } } },
  };
  const ran = [];
  const items = menuFor({ s: 0, e: 1, words: true }, { words: true });
  await popup(items, { write: () => ran.push('write'), toggle: () => ran.push('toggle'), removeText: () => ran.push('remove') }, { x: 5, y: 9 }, tauri);
  assert.deepEqual(made.items[2], { item: 'Separator' });
  made.items.filter((i) => i.action).forEach((i) => i.action());
  assert.deepEqual(ran, ['write', 'toggle', 'remove']);
  assert.deepEqual({ ...at }, { x: 5, y: 9 });
  await popup(items, {}, null, {}); // no menu API: no throw
});
