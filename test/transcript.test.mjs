// Transcript editing: the shared selection (selection.js), the key map, fixes (fix-field.js), following the playhead
// (follow.js), word looks, and the panel itself against a small fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wordsIn, wordSelection, toggleSelection } from '../src/ui/selection.js';
import { transcriptKey, wordClass, wordLabel, createTranscript, noteMarks } from '../src/ui/transcript.js';
import { fixStep, openFixField } from '../src/ui/fix-field.js';
import { createFollow, followTarget, PAUSE_MS } from '../src/ui/follow.js';
import { isCut, cutsOf } from '../src/ui/cuts.js';
import { withWords, partsWithWords, emptyEdit } from '../src/ui/edit.js';
import { createHistory } from '../src/ui/history.js';
import { createMagic } from '../src/ui/magic.js';

const W = (w, s, e) => ({ w, s, e });
// "so I was gonna say hi" with pauses between
const words = [W('so', 0.5, 0.7), W('I', 1.0, 1.1), W('was', 1.3, 1.5), W('gonna', 1.6, 2.0), W('say', 2.4, 2.6), W('hi', 3.0, 3.2)];
const lengths = { 1: 4 };
const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });

// ---------- selection.js ----------

test('words → selection → the same words; a timeline range selects the words whose middle is inside', () => {
  const sel = wordSelection(1, words, 3, 1);
  assert.deepEqual(sel, { part: 1, s: 1.0, e: 2.0, words: true });
  assert.deepEqual(wordsIn(sel, words), { from: 1, to: 3 });
  assert.deepEqual(wordsIn({ part: 1, s: 1.4, e: 2.5 }, words), { from: 2, to: 4 }, 'was (1.4) … say (2.5)');
  assert.deepEqual(wordsIn({ part: 1, s: 2.1, e: 2.3 }, words), null, 'only a pause');
  assert.equal(wordsIn(null, words), null);
});

test('⌫ on words cuts the pause-midpoint range; ⌫ again leaves no cuts', () => {
  const sel = wordSelection(1, words, 1, 2); // "I was"
  const cut = toggleSelection([], sel, words, lengths);
  assert.equal(cut.label, 'Cut 2 words');
  assert.deepEqual(cut.cuts, [you(0.85, 1.55)]);
  const back = toggleSelection(cut.cuts, sel, words, lengths);
  assert.equal(back.label, 'Restored 2 words');
  assert.deepEqual(back.cuts, []);
});

test('⌫ on a timeline range uses the range as dragged; a words selection that holds no words does nothing', () => {
  const r = toggleSelection([], { part: 1, s: 2.1, e: 2.3 }, words, lengths);
  assert.deepEqual(r.cuts, [you(2.1, 2.3)]);
  assert.equal(toggleSelection([], { part: 1, s: 9, e: 9.5, words: true }, words, lengths).label, '');
});

test('what the transcript strikes is what the timeline cuts: one list', () => {
  const { cuts } = toggleSelection([], wordSelection(1, words, 3, 4), words, lengths); // "gonna say"
  const struck = words.filter((w) => isCut(w, cutsOf(cuts, 1))).map((w) => w.w);
  assert.deepEqual(struck, ['gonna', 'say']);
});

// ---------- key map ----------

test('key map: arrows move or extend, Return and letters fix (only with words selected), the rest goes to the app', () => {
  const k = (key, mods = {}) => ({ key, ...mods });
  assert.equal(transcriptKey(k('ArrowLeft'), false), 'prev');
  assert.equal(transcriptKey(k('ArrowRight', { shiftKey: true }), true), 'extendNext');
  assert.equal(transcriptKey(k('Enter'), true), 'fix');
  assert.equal(transcriptKey(k('g'), true), 'type');
  assert.equal(transcriptKey(k('G', { shiftKey: true }), true), 'type');
  assert.equal(transcriptKey(k('g'), false), null, 'nothing selected: nothing to fix');
  for (const key of [' ', 'Backspace', 'Delete', 'Escape', 'Tab']) assert.equal(transcriptKey(k(key), true), null, key);
  assert.equal(transcriptKey(k('z', { metaKey: true }), true), null, '⌘Z is the app’s undo');
  assert.equal(transcriptKey(k('ArrowLeft', { altKey: true }), true), null);
});

// ---------- fixes ----------

test('a fix: new words share the old time, label names what was there, same or empty text is no step', () => {
  const r = fixStep(words, 3, 3, 'going to');
  assert.equal(r.label, 'Fixed “gonna”');
  assert.deepEqual(r.words.slice(3, 5).map((w) => w.w), ['going', 'to']);
  assert.equal(r.words[3].s, 1.6);
  assert.equal(r.words[4].e, 2.0);
  assert.equal(r.words.length, words.length + 1);
  assert.equal(fixStep(words, 0, 5, 'x').label, 'Fixed “so I was…”');
  assert.equal(fixStep(words, 3, 3, '  gonna '), null);
  assert.equal(fixStep(words, 3, 3, '   '), null);
});

test('a fix is one undo step, and the cut it sits in stays', () => {
  const cuts = toggleSelection([], wordSelection(1, words, 3, 3), words, lengths).cuts;
  const h = createHistory({ cuts, words: { 1: words } });
  const r = fixStep(words, 3, 3, 'going to');
  h.push(withWords(h.edit, 1, r.words), r.label);
  assert.ok(r.words.slice(3, 5).every((w) => isCut(w, cuts)), 'still cut');
  assert.equal(h.undo().label, 'Fixed “gonna”');
  assert.equal(h.edit.words[1], words);
  assert.equal(h.undo(), null, 'one step');
});

test('Magic reads the fixed words', async () => {
  const parts = [{ id: 1, name: 'a.mov', transcript: { seconds: 4, words } }];
  const edit = withWords(emptyEdit(), 1, fixStep(words, 3, 3, 'going to').words);
  let sent = null;
  const m = createMagic({
    runner: { async run({ parts: p }) { sent = p; return { summary: '', cuts: [] }; }, cancel() {} },
    claude: async () => ({ state: 'ready', message: '' }),
    project: () => ({ parts: partsWithWords(parts, edit), transcribing: false }),
    paint() {}, flash() {}, banner() {}, onResult() {},
    store: { getItem: () => null, setItem() {} },
  });
  m.update();
  await m.press();
  assert.deepEqual(sent[0].words.map((w) => w.w), ['so', 'I', 'was', 'going', 'to', 'say', 'hi']);
});

// ---------- following ----------

test('follow: pauses 4 s after you scroll, then picks up again', () => {
  let t = 0;
  const f = createFollow(() => t);
  assert.equal(f.on, true);
  f.scrolled();
  t = PAUSE_MS - 1;
  assert.equal(f.on, false);
  t = PAUSE_MS;
  assert.equal(f.on, true);
});

test('followTarget: in the comfortable band → stay; out of it → a third from the top', () => {
  assert.equal(followTarget(300, 20, 0, 600), null);
  assert.equal(followTarget(700, 20, 0, 600), 500, 'below → 700 − 200');
  assert.equal(followTarget(10, 20, 100, 600), 0, 'above, near the top → 0');
});

// ---------- looks ----------

test('a cut word is struck in its owner’s colour; lit keeps the strike; labels say the state', () => {
  const mine = wordClass({ cut: you(0, 1), lit: false, selected: false });
  assert.match(mine, /line-through/);
  assert.match(mine, /decoration-text-secondary/);
  assert.match(mine, /text-text-secondary/);
  const magic = wordClass({ cut: { by: 'magic' }, lit: true, selected: true });
  assert.match(magic, /decoration-accent/);
  assert.match(magic, /text-accent/);
  assert.doesNotMatch(magic, /text-text-secondary/);
  assert.match(magic, /bg-accent\/20/);
  assert.doesNotMatch(wordClass({ cut: null, lit: false, selected: false }), /line-through/);
  assert.equal(wordLabel('gonna', { by: 'magic' }), 'gonna, cut by Magic');
  assert.equal(wordLabel('gonna', you(0, 1)), 'gonna, cut');
  assert.equal(wordLabel('gonna', null), 'gonna');
});

// ---------- the panel, against a fake DOM ----------

function fakeDom() {
  const make = (tag) => {
    const n = {
      tag, id: '', title: '', textContent: '', dataset: {}, attrs: {}, children: [], parent: null, listeners: {},
      classes: new Set(), style: {},
      querySelectorAll(sel) {
        const out = [];
        const walk = (x) => { if (typeof x !== 'object') return; if (x !== this && matches(x, sel)) out.push(x); x.children.forEach(walk); };
        walk(this);
        return out;
      },
      get className() { return [...this.classes].join(' '); },
      set className(v) { this.classes = new Set(String(v).split(' ').filter(Boolean)); },
      classList: null,
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
      append(...c) { for (const x of c) { if (typeof x === 'object') x.parent = this; this.children.push(x); } },
      replaceChildren(...c) { this.children = []; this.append(...c); },
      addEventListener(k, f) { (this.listeners[k] ??= []).push(f); },
      closest(sel) {
        for (let x = this; x; x = x.parent) if (matches(x, sel)) return x;
        return null;
      },
      focus() {},
      before(x) { x.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this), 0, x); },
      after(x) { x.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, x); },
      remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
      fire(kind, e) { this.listeners[kind]?.forEach((f) => f(e)); },
    };
    n.classList = { toggle: (c, on) => (on ? n.classes.add(c) : n.classes.delete(c)), add: (c) => n.classes.add(c), remove: (c) => n.classes.delete(c) };
    if (tag === 'span' || tag === 'h3') n.classes = new Set();
    return n;
  };
  const matches = (x, sel) => {
    if (sel === 'span[data-i]') return x.tag === 'span' && x.dataset.i != null;
    if (sel === '[contenteditable]') return !!x.contentEditable;
    if (sel === 'p') return x.tag === 'p';
    if (sel === '[data-note-bar]') return x.dataset?.noteBar != null;
    return false;
  };
  globalThis.document = {
    createElement: make,
    createRange: () => ({ selectNodeContents() {}, collapse() {} }),
  };
  globalThis.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  return make;
}

test('fix field: opens in place of the words, keys stay inside, Return commits, Esc cancels, blur commits once', () => {
  const make = fakeDom();
  const para = make('p');
  const a = make('span'), b = make('span');
  a.dataset.w = 'gonna'; b.dataset.w = 'say';
  para.append(a, b);
  const done = [];
  const open = () => openFixField([a, b], { text: 'g', selectAll: false, onDone: (t) => done.push(t) });
  open();
  const field = para.children[0];
  assert.equal(field.attrs['aria-label'], 'Fix words, gonna say');
  assert.ok(a.classes.has('hidden') && b.classes.has('hidden'), 'the words make room');
  let stopped = 0, prevented = 0;
  const key = (k) => field.fire('keydown', { key: k, stopPropagation: () => stopped++, preventDefault: () => prevented++ });
  key('Backspace'); key(' '); key('ArrowLeft');
  assert.equal(stopped, 3, '⌫, Space and ← edit the text, not the video');
  assert.equal(prevented, 0);
  field.textContent = 'going to';
  key('Enter');
  field.fire('blur', {});
  assert.deepEqual(done, ['going to'], 'once');
  assert.ok(!para.children.includes(field) && !a.classes.has('hidden'));
  open();
  para.children[0].fire('keydown', { key: 'Escape', stopPropagation() {}, preventDefault() {} });
  assert.deepEqual(done, ['going to', null]);
  delete globalThis.document;
  delete globalThis.getSelection;
});

function panel(edit, sel = { now: null }) {
  const make = fakeDom();
  const box = make('div'), aside = make('aside');
  const log = { seeks: [], selects: [], fixes: [], menus: [], notes: [] };
  const parts = [
    { id: 1, name: 'a', transcript: { seconds: 4, words } },
    { id: 2, name: 'b', transcript: { seconds: 2, words: [W('two', 0.2, 0.5), W('more', 0.6, 0.9)] } },
  ];
  const t = createTranscript(box, aside, {
    parts: () => partsWithWords(parts, edit()),
    cuts: () => edit().cuts,
    selection: () => sel.now,
    onSelect: (s) => { sel.now = s; log.selects.push(s); t.paintSelection(); },
    onSeek: (i, s) => log.seeks.push([i, s]),
    onFix: (id, w, label) => log.fixes.push([id, w, label]),
    onMenu: (at) => log.menus.push(at),
    notes: () => edit().notes ?? [],
    onNote: (id, o) => log.notes.push([id, o]),
  });
  t.render();
  const spans = (part) => { // the words of a part, through its blocks
    const out = [];
    const walk = (n) => {
      if (typeof n !== 'object') return;
      if (n.tag === 'span' && n.dataset.i != null) out.push(n);
      n.children.forEach(walk);
    };
    walk(box.children.filter((c) => c.tag === 'section')[part]);
    return out;
  };
  const fire = (kind, target, extra = {}) => {
    const e = { target, button: 0, preventDefault() {}, stopPropagation() {}, ...extra };
    box.listeners[kind]?.forEach((f) => f(e));
  };
  return { t, box, aside, spans, fire, log, sel };
}

test('panel: click selects and seeks; ⇧-click extends; dragging into part 2 stops at part 1’s last word', () => {
  let edit = { cuts: [], words: { 1: words, 2: [W('two', 0.2, 0.5), W('more', 0.6, 0.9)] } };
  const { spans, fire, log, sel, aside } = panel(() => edit);
  assert.ok(aside.classes.has('flex'), 'panel shows once there are words');
  fire('pointerdown', spans(0)[1]);
  assert.deepEqual(sel.now, { part: 1, s: 1.0, e: 1.1, words: true });
  assert.deepEqual(log.seeks.at(-1), [0, 1.0]);
  assert.equal(spans(0)[1].attrs['aria-selected'], 'true');
  fire('pointerdown', spans(0)[3], { shiftKey: true });
  assert.deepEqual(wordsIn(sel.now, words), { from: 1, to: 3 });
  fire('pointerover', spans(1)[0]); // still pressed: drag into part 2
  assert.deepEqual(wordsIn(sel.now, words), { from: 1, to: 5 }, 'clamped to part 1');
  assert.equal(sel.now.part, 1);
  delete globalThis.document;
});

test('panel: cut words strike in place, by owner; a timeline range highlights its words', () => {
  let edit = { cuts: [], words: { 1: words, 2: [] } };
  const p = panel(() => edit);
  edit = { ...edit, cuts: [you(1.55, 2.2), { part: 1, s: 2.8, e: 4, by: 'magic', reason: 'earlier take' }] };
  p.t.paintCuts();
  const s = p.spans(0);
  assert.match(s[3].className, /decoration-text-secondary/, 'gonna: yours');
  assert.match(s[5].className, /decoration-accent/, 'hi: Magic');
  assert.equal(s[5].attrs['aria-label'], 'hi, cut by Magic');
  assert.match(s[5].title, /Magic Cut: earlier take/);
  assert.doesNotMatch(s[0].className, /line-through/);
  p.sel.now = { part: 1, s: 1.4, e: 2.5 }; // dragged on the timeline
  p.t.paintSelection();
  assert.deepEqual(s.map((x) => x.attrs['aria-selected'] === 'true'), [false, false, true, true, true, false]);
  assert.match(s[2].className, /bg-accent\/20/);
  delete globalThis.document;
});

const noteOf = (id, s, e, more = {}) => ({ id, part: 1, s, e, text: '', color: 'yellow', by: 'you', done: false, ...more });

test('notes in the words: a section underlines the words whose middle is inside, a moment puts a bar before its word', () => {
  const marks = noteMarks(words, [noteOf('a', 1.2, 2.1), noteOf('m', 2.2, 2.2), noteOf('d', 0, 4, { done: true })]);
  assert.deepEqual(marks.under.map((n) => n?.id ?? null), [null, null, 'a', 'a', null, null], 'was, gonna; a done note marks nothing');
  assert.deepEqual(marks.bars.map((b) => [b.k, b.note.id]), [[4, 'm']], 'in the gap before "say": on "say"');
  assert.deepEqual(noteMarks(words, [noteOf('late', 9, 9)]).bars, [], 'after the last word: no bar');
  assert.equal(transcriptKey({ key: 'm' }, true), null, 'M is the app\'s (a note), not the fix field\'s');
  assert.equal(transcriptKey({ key: 'M' }, true), null);
  assert.equal(transcriptKey({ key: 'n' }, true), 'type', 'another letter still types');
});

test('panel: noted words get the underline in the note\'s colour (with the strike when cut), a name and a hover line', () => {
  let edit = { cuts: [you(1.55, 2.2)], words: { 1: words, 2: [] }, notes: [noteOf('a', 1.2, 2.1, { color: 'blue', text: 'retake?' })] };
  const p = panel(() => edit);
  const s = p.spans(0);
  assert.match(s[3].style.backgroundImage, /90 169 255 \/ 0\.6/);
  assert.match(s[3].className, /line-through/, 'gonna is cut too: both');
  assert.equal(s[2].attrs['aria-label'], 'was, has a note');
  assert.equal(s[3].attrs['aria-label'], 'gonna, cut, has a note');
  assert.match(s[2].title, /Note: retake\?/);
  assert.ok(!s[0].style.backgroundImage);
  edit = { ...edit, notes: [{ ...edit.notes[0], done: true }] };
  p.t.paintCuts();
  assert.ok(!s[2].style.backgroundImage, 'done: the mark goes');
  assert.equal(s[2].attrs['aria-label'], 'was');
  delete globalThis.document;
});

test('panel: clicking a noted word selects it and opens the card unfocused; clicking a bar opens it to write', () => {
  const edit = { cuts: [], words: { 1: words, 2: [] }, notes: [noteOf('a', 1.2, 2.1), noteOf('m', 2.2, 2.2)] };
  const p = panel(() => edit);
  p.fire('pointerdown', p.spans(0)[2]);
  assert.deepEqual(wordsIn(p.sel.now, words), { from: 2, to: 2 }, 'selected as usual');
  assert.deepEqual(p.log.notes, [['a', { focus: false, seek: false }]]);
  const para = p.spans(0)[4].parent;
  const bar = para.children[para.children.indexOf(p.spans(0)[4]) - 1];
  assert.equal(bar.dataset.noteBar, 'm');
  assert.equal(bar.attrs.role, 'button');
  p.fire('pointerdown', bar);
  assert.deepEqual(p.log.notes.at(-1), ['m', { focus: true }]);
  p.fire('pointerdown', p.spans(0)[0]);
  assert.equal(p.log.notes.length, 2, 'a plain word opens nothing');
  p.t.paintCuts();
  assert.equal(para.children.filter((c) => c.dataset?.noteBar).length, 1, 'repainting keeps one bar');
  delete globalThis.document;
});

test('panel: ← → move the selection one word, ⇧ extends, and the keys stop there (not the playhead)', () => {
  let edit = { cuts: [], words: { 1: words, 2: [] } };
  const { spans, fire, box, sel, log } = panel(() => edit);
  fire('pointerdown', spans(0)[2]);
  let stopped = 0;
  const key = (k, mods = {}) => fire('keydown', box, { key: k, stopPropagation: () => stopped++, ...mods });
  key('ArrowRight');
  assert.deepEqual(wordsIn(sel.now, words), { from: 3, to: 3 });
  assert.deepEqual(log.seeks.at(-1), [0, 1.6]);
  key('ArrowRight', { shiftKey: true });
  assert.deepEqual(wordsIn(sel.now, words), { from: 3, to: 4 });
  assert.equal(stopped, 2);
  key('Backspace');
  assert.equal(stopped, 2, '⌫ goes on to the app (cut)');
  delete globalThis.document;
});

const fieldIn = (n) => {
  if (typeof n !== 'object') return null;
  if (n.contentEditable) return n;
  for (const c of n.children) { const f = fieldIn(c); if (f) return f; }
  return null;
};
const enter = (f) => f.fire('keydown', { key: 'Enter', stopPropagation() {}, preventDefault() {} });

test('panel: typing on a selected pause opens an empty field before the next word; Return adds the word in that time', () => {
  let edit = { cuts: [], words: { 1: words, 2: [] } };
  const p = panel(() => edit, { now: { part: 1, s: 2.05, e: 2.35, pause: true } });
  p.t.write('n');
  const field = fieldIn(p.box);
  assert.ok(field, 'a field opens');
  assert.equal(field.attrs['aria-label'], 'Write words here');
  const say = p.spans(0)[4];
  assert.equal(say.parent.children.indexOf(field), say.parent.children.indexOf(say) - 1, 'right before “say”');
  assert.ok(!p.spans(0).some((s) => s.classes.has('hidden')), 'no word is hidden');
  field.textContent = 'not';
  enter(field);
  const [id, w, label] = p.log.fixes.at(-1);
  assert.equal(id, 1);
  assert.equal(label, 'Added “not”');
  const k = w.findIndex((x) => x.w === 'not');
  assert.equal(k, 4);
  assert.ok(w[k].s >= 2.05 - 1e-9 && w[k].e <= 2.35 + 1e-9, 'inside the selected time');
  assert.deepEqual(w.filter((x) => x.w !== 'not'), words, 'the neighbours keep their times');
  delete globalThis.document;
});

test('panel: a selection with no room between words opens the field over the words it overlaps', () => {
  let edit = { cuts: [], words: { 1: words, 2: [] } };
  const p = panel(() => edit, { now: { part: 1, s: 1.6, e: 1.75 } });
  p.t.write('g');
  const field = fieldIn(p.box);
  assert.equal(field.attrs['aria-label'], 'Fix words, gonna');
  assert.ok(p.spans(0)[3].classes.has('hidden'));
  field.fire('keydown', { key: 'Escape', stopPropagation() {}, preventDefault() {} });
  assert.equal(p.log.fixes.length, 0, 'Esc changes nothing');
  delete globalThis.document;
});

test('panel: a cut selection never opens the field', () => {
  let edit = { cuts: [], words: { 1: words, 2: [] } };
  const p = panel(() => edit, { now: { part: 1, s: 2.05, e: 2.35, cut: true } });
  p.t.write('n');
  assert.equal(fieldIn(p.box), null);
  delete globalThis.document;
});

test('panel: right-click on a word outside the selection selects it, then opens the menu', () => {
  let edit = { cuts: [], words: { 1: words, 2: [] } };
  const p = panel(() => edit);
  p.fire('pointerdown', p.spans(0)[1]);
  p.fire('contextmenu', p.spans(0)[4], { clientX: 10, clientY: 20 });
  assert.deepEqual(wordsIn(p.sel.now, words), { from: 4, to: 4 });
  assert.deepEqual(p.log.menus.at(-1), { x: 10, y: 20 });
  p.fire('pointerdown', p.spans(0)[2]);
  p.fire('pointerdown', p.spans(0)[3], { shiftKey: true });
  p.fire('contextmenu', p.spans(0)[3], { clientX: 1, clientY: 2 });
  assert.deepEqual(wordsIn(p.sel.now, words), { from: 2, to: 3 }, 'inside: the selection stays');
  assert.equal(p.log.menus.length, 2);
  delete globalThis.document;
});
