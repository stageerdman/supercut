// The transcript panel around the words: blocks, search, the divider's width, the rail, and following seeks.
// Spec: design/transcript-panel.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksOf, LONG_PAUSE } from '../src/ui/blocks.js';
import { findMatches, firstFrom, stepMatch, countText, norm } from '../src/ui/search.js';
import { searchKey, mountSearch } from '../src/ui/transcript-search.js';
import { clampWidth, mountDivider, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, VIDEO_MIN } from '../src/ui/divider.js';
import { railSpans, yOf, timeAt, GAP, createRail } from '../src/ui/rail.js';
import { createFollow } from '../src/ui/follow.js';
import { createTranscript, wordClass } from '../src/ui/transcript.js';

const W = (w, s, e) => ({ w, s, e });
/** n words, 0.3 s each with 0.1 s between, starting at `at`. */
const run = (n, at = 0, text = (k) => `w${k}`) => Array.from({ length: n }, (_, k) => W(text(k), at + k * 0.4, at + k * 0.4 + 0.3));

// ---------- blocks ----------

test('blocks: a long pause starts a new block; every word lands in exactly one, in order', () => {
  const a = run(5), b = run(4, a.at(-1).e + LONG_PAUSE);
  const words = [...a, ...b];
  assert.deepEqual(blocksOf(words), [{ from: 0, to: 4 }, { from: 5, to: 8 }]);
  assert.deepEqual(blocksOf([]), []);
  assert.deepEqual(blocksOf(run(1)), [{ from: 0, to: 0 }]);
  const short = [...run(5), ...run(4, a.at(-1).e + LONG_PAUSE - 0.1)];
  assert.equal(blocksOf(short).length, 1, 'a shorter pause stays inside the block');
});

test('blocks: a sentence end splits once a block has 30 words; no punctuation, no pauses → 120 at most', () => {
  const words = run(70, 0, (k) => (k === 9 || k === 39 ? `end${k}.` : `w${k}`));
  assert.deepEqual(blocksOf(words), [{ from: 0, to: 39 }, { from: 40, to: 69 }], 'the "." at word 9 is too early');
  const flat = Array.from({ length: 250 }, (_, k) => W('w', k * 0.3, k * 0.3 + 0.3)); // no gaps at all
  assert.deepEqual(blocksOf(flat).map((b) => b.to - b.from + 1), [120, 120, 10]);
  const loose = run(100); // 0.1 s gaps only: under the loose pause
  assert.equal(blocksOf(loose).length, 1);
});

// ---------- search ----------

const said = [W('So,', 0, 0.2), W('I', 0.3, 0.4), W('was', 0.5, 0.7), W('Going', 0.8, 1), W('to', 1.1, 1.2), W('say', 1.3, 1.5), W('going', 2, 2.2), W('to', 2.3, 2.4)];

test('search: ignores case and punctuation, matches phrases across words, in reading order across parts', () => {
  const parts = [{ id: 7, words: said }, { id: 9, words: [W('going.', 0, 1)] }];
  assert.deepEqual(findMatches(parts, 'going to').map((m) => [m.id, m.from, m.to]), [[7, 3, 4], [7, 6, 7]]);
  assert.deepEqual(findMatches(parts, 'GOING').map((m) => [m.id, m.from]), [[7, 3], [7, 6], [9, 0]]);
  assert.deepEqual(findMatches(parts, 'so i').map((m) => [m.from, m.to]), [[0, 1]], '"So," + "I"');
  assert.deepEqual(findMatches(parts, 'oin').map((m) => m.from), [3, 6, 0], 'inside a word too');
  assert.deepEqual(findMatches(parts, '  '), []);
  assert.deepEqual(findMatches(parts, 'nothing'), []);
  assert.equal(norm("Don't!"), 'dont');
});

test('search: starts at the first match from the playhead; steps wrap; the count reads 2/5', () => {
  const m = findMatches([{ id: 1, words: said }, { id: 2, words: [W('going', 0, 1)] }], 'going');
  assert.equal(firstFrom(m, [1, 2], { i: 0, t: 0 }), 0);
  assert.equal(firstFrom(m, [1, 2], { i: 0, t: 1.5 }), 1);
  assert.equal(firstFrom(m, [1, 2], { i: 1, t: 0 }), 2, 'part 2');
  assert.equal(firstFrom(m, [1, 2], { i: 1, t: 5 }), 0, 'past the last → the first');
  assert.equal(firstFrom([], [1], { i: 0, t: 0 }), -1);
  assert.equal(stepMatch(2, 1, 3), 0);
  assert.equal(stepMatch(0, -1, 3), 2);
  assert.equal(countText(1, 5), '2/5');
  assert.equal(countText(-1, 0), '0/0');
});

test('search keys: Enter / ↓ next, ⇧Enter / ↑ previous, Esc; letters and ⌘ keys are the field’s', () => {
  assert.equal(searchKey({ key: 'Enter' }), 'next');
  assert.equal(searchKey({ key: 'Enter', shiftKey: true }), 'prev');
  assert.equal(searchKey({ key: 'ArrowDown' }), 'next');
  assert.equal(searchKey({ key: 'ArrowUp' }), 'prev');
  assert.equal(searchKey({ key: 'Escape' }), 'escape');
  assert.equal(searchKey({ key: 'a' }), null);
  assert.equal(searchKey({ key: 'Enter', metaKey: true }), null, '⌘↩ is Magic');
});

// ---------- width ----------

test('width: between 260 and 720, and the video keeps 360; garbage → 320', () => {
  assert.equal(clampWidth(400, 1440), 400);
  assert.equal(clampWidth(100, 1440), MIN_WIDTH);
  assert.equal(clampWidth(2000, 1440), MAX_WIDTH);
  assert.equal(clampWidth(700, 960), 960 - VIDEO_MIN);
  assert.equal(clampWidth(NaN, 1440), DEFAULT_WIDTH);
  assert.equal(clampWidth(500, 400), MIN_WIDTH, 'a tiny window still shows the panel');
});

// ---------- a small fake DOM ----------

function node(tag = 'div') {
  const n = {
    tag, id: '', title: '', textContent: '', dataset: {}, attrs: {}, children: [], parent: null, listeners: {}, style: {},
    classes: new Set(), value: '', disabled: false,
    get className() { return [...this.classes].join(' '); },
    set className(v) { this.classes = new Set(String(v).split(' ').filter(Boolean)); },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    append(...c) { for (const x of c) { if (typeof x === 'object') x.parent = this; this.children.push(x); } },
    replaceChildren(...c) { this.children = []; this.append(...c); },
    addEventListener(k, f) { (this.listeners[k] ??= []).push(f); },
    closest(sel) {
      for (let x = this; x; x = x.parent) if (sel === 'span[data-i]' ? x.tag === 'span' && x.dataset.i != null : false) return x;
      return null;
    },
    focus() { n.focused = true; }, blur() { n.focused = false; }, select() {},
    getBoundingClientRect() { return n.rect?.() ?? { top: 0, bottom: 0, height: 0 }; },
    fire(kind, e = {}) { this.listeners[kind]?.forEach((f) => f({ preventDefault() {}, stopPropagation() {}, button: 0, target: this, ...e })); },
  };
  n.classList = { toggle: (c, on) => (on ? n.classes.add(c) : n.classes.delete(c)), add: (c) => n.classes.add(c), remove: (c) => n.classes.delete(c) };
  return n;
}
const memory = (init = {}) => { const m = { ...init }; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, m }; };

test('divider: drag left widens, the width is saved; ← → by 16; double-click back to 320; a small window clamps', () => {
  globalThis.innerWidth = 1440;
  const handle = node(), panel = node('aside'), store = memory({ transcriptWidth: '400' });
  const d = mountDivider(handle, panel, store);
  assert.equal(panel.style.width, '400px', 'remembered');
  handle.fire('pointerdown', { clientX: 1000 });
  handle.fire('pointermove', { clientX: 900 });
  assert.equal(panel.style.width, '500px');
  assert.equal(store.m.transcriptWidth, '400', 'saved when you let go');
  handle.fire('pointerup');
  assert.equal(store.m.transcriptWidth, '500');
  assert.equal(handle.attrs.role, 'separator');
  assert.equal(handle.attrs['aria-valuenow'], '500');
  let stopped = 0;
  handle.fire('keydown', { key: 'ArrowLeft', stopPropagation: () => stopped++ });
  assert.equal(d.width, 516);
  assert.equal(stopped, 1, 'not the playhead');
  handle.fire('dblclick');
  assert.equal(d.width, DEFAULT_WIDTH);
  delete globalThis.innerWidth;
});

// ---------- rail ----------

test('rail: parts stack by length with a gap; time ↔ height round-trips; a gap belongs to the part above', () => {
  const lens = [30, 10];
  const [a, b] = railSpans(lens);
  assert.equal(a[0], 0);
  assert.ok(Math.abs(b[1] - 1) < 1e-9);
  assert.ok(Math.abs(b[0] - a[1] - GAP) < 1e-9);
  assert.ok(Math.abs((a[1] - a[0]) / (b[1] - b[0]) - 3) < 1e-9, 'three times as long');
  for (const [i, t] of [[0, 0], [0, 12.5], [1, 4], [1, 10]]) {
    const back = timeAt(lens, yOf(lens, i, t));
    assert.equal(back.i, i);
    assert.ok(Math.abs(back.t - t) < 1e-9, `${i} ${t}`);
  }
  assert.deepEqual(timeAt(lens, a[1] + GAP / 2), { i: 0, t: 30 });
  assert.equal(timeAt([], 0.5), null);
  assert.deepEqual(railSpans([0, 0]).map(([x, y]) => +(y - x).toFixed(3)), [0.494, 0.494], 'unknown lengths share');
});

test('rail: click seeks where you clicked, drag keeps seeking, hover says the time, ↓ steps 5 s', () => {
  globalThis.document = { createElement: node };
  const box = node();
  box.rect = () => ({ top: 100, height: 200 });
  const seeks = [];
  let head = { i: 0, t: 10 };
  const rail = createRail(box, { lengths: () => [60], playhead: () => head, onSeek: (i, t) => seeks.push([i, t]) });
  rail.paintTrack();
  rail.paintHead();
  assert.equal(box.attrs.role, 'slider');
  assert.equal(box.attrs['aria-valuetext'], '00:10');
  box.fire('pointerdown', { clientY: 200 });
  box.fire('pointermove', { clientY: 250 });
  box.fire('pointerup');
  box.fire('pointermove', { clientY: 150 });
  assert.deepEqual(seeks, [[0, 30], [0, 45]], 'hovering after letting go does not seek');
  const tip = box.children[3];
  assert.equal(tip.textContent, '00:15');
  box.fire('keydown', { key: 'ArrowDown' });
  assert.deepEqual(seeks.at(-1), [0, 15]);
  rail.paintView({ i: 0, t: 0 }, { i: 0, t: 30 });
  assert.equal(box.children[1].style.top, '0.000%');
  assert.equal(box.children[1].style.height, 'max(4px, 50.000%)');
  delete globalThis.document;
});

// ---------- the panel ----------

/** A transcript panel on the fake DOM, with a fake layout: each block's words in a line, 20 px per line. */
function panel(words, opts = {}) {
  globalThis.document = { createElement: node };
  const box = node(), aside = node('aside');
  box.scrollTop = 0;
  box.clientHeight = 100;
  box.scrolls = [];
  box.scrollTo = ({ top, behavior }) => { box.scrolls.push([top, behavior]); box.scrollTop = top; };
  box.rect = () => ({ top: 0, bottom: 100, height: 100 });
  const parts = [{ id: 1, name: 'a', transcript: { seconds: 100, words } }];
  let head = { i: 0, t: 0 };
  const views = [];
  const t = createTranscript(box, aside, {
    parts: () => parts, cuts: () => [], selection: () => null,
    onSelect() {}, onSeek() {}, onFix() {},
    playhead: () => head, onView: (a, b) => views.push([a, b]), ...opts,
  });
  t.render();
  const all = [];
  const walk = (n) => { if (typeof n !== 'object') return; if (n.tag === 'span' && n.dataset.i != null) all.push(n); n.children.forEach(walk); };
  walk(box);
  all.forEach((s, k) => { s.rect = () => ({ top: k * 20 - box.scrollTop, bottom: k * 20 + 20 - box.scrollTop, height: 20 }); });
  return { t, box, spans: all, views, setHead: (h) => { head = h; } };
}

test('panel: words sit in blocks, each with its start time; blocks are only layout', () => {
  const words = [...run(3, 1), ...run(2, 10)];
  const { box, spans } = panel(words);
  const section = box.children[0];
  assert.equal(section.tag, 'section');
  assert.equal(section.attrs['aria-label'], 'Part 1');
  const blocks = section.children;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((b) => b.children[0].textContent), ['00:01', '00:10']);
  assert.equal(blocks[0].children[0].attrs['aria-hidden'], 'true');
  assert.deepEqual(spans.map((s) => s.dataset.i), [0, 1, 2, 3, 4], 'one run of words, in order');
  delete globalThis.document;
});

test('panel: search lights every match, the current one stronger; steps scroll; a render keeps the match', () => {
  const words = run(12, 0, (k) => (k % 4 === 0 ? 'um' : `w${k}`));
  const { t, spans, box, setHead } = panel(words);
  setHead({ i: 0, t: 1 }); // the playhead is past the first "um" (0 s), before the second (1.6 s)
  assert.deepEqual(t.search('UM'), { k: 1, n: 3 }, 'starts at the one after the playhead');
  assert.deepEqual([0, 4, 8].map((k) => spans[k].state.match), [1, 2, 1]);
  assert.match(spans[4].className, /bg-accent\/35/);
  assert.match(spans[0].className, /bg-white\/14/);
  assert.deepEqual(t.step(1), { k: 2, n: 3 });
  assert.equal(box.scrolls.at(-1)[0], Math.round(8 * 20 - 100 / 3), 'scrolled to the match');
  assert.deepEqual(t.step(1), { k: 0, n: 3 }, 'wraps');
  t.render();
  assert.equal(t.search('um', true).k, 0);
  t.search('');
  const now = box.children[0].children.flatMap((b) => b.children[1].children.filter((c) => typeof c === 'object'));
  assert.equal(now.length, 12);
  assert.ok(now.every((s) => !s.state.match), 'the new words, after the render');
  delete globalThis.document;
});

test('panel: a seek elsewhere scrolls there and lights the word even right after you scrolled; playback does not', () => {
  const words = run(20);
  const { t, box, spans } = panel(words);
  box.fire('wheel'); // you scroll by hand
  t.highlight(0, 15 * 0.4 + 0.1); // playback reaches word 15
  assert.equal(box.scrolls.length, 0, 'playback leaves you alone');
  assert.equal(spans[15].state.lit, true);
  box.fire('wheel');
  t.goTo(0, 12 * 0.4 + 0.1); // a click on the timeline
  assert.equal(spans[12].state.lit, true);
  assert.equal(box.scrolls.at(-1)[0], Math.round(12 * 20 - 100 / 3));
  t.goTo(0, 3 * 0.4 + 0.35); // into the pause after word 3
  assert.ok(spans.every((s) => !s.state.lit), 'a pause lights nothing');
  assert.equal(box.scrolls.at(-1)[0], Math.round(4 * 20 - 100 / 3), 'word 4 in view');
  assert.equal(box.scrolls.at(-1)[1], 'auto', 'quick seeks (a scrub) scroll at once');
  delete globalThis.document;
});

test('panel: the rail hears what is on screen', () => {
  const words = run(20);
  const { box, views } = panel(words);
  box.scrollTop = 100;
  box.fire('scroll');
  const [from, to] = views.at(-1);
  assert.deepEqual(from, { i: 0, t: words[5].s });
  assert.deepEqual(to, { i: 0, t: words[9].e });
  delete globalThis.document;
});

test('search field: count and arrows only with a query; Enter steps; Esc clears, then Esc gives focus to the words', () => {
  const ui = { input: node('input'), count: node('span'), prev: node('button'), next: node('button'), tools: node('span') };
  const calls = [];
  const fake = {
    search: (q) => { calls.push(['search', q]); return q ? { k: 0, n: 2 } : { k: -1, n: 0 }; },
    step: (d) => { calls.push(['step', d]); return { k: 1, n: 2 }; },
    focus: () => calls.push(['focus']),
  };
  mountSearch(ui, fake);
  ui.input.value = 'um';
  ui.input.fire('input');
  assert.equal(ui.count.textContent, '1/2');
  assert.equal(ui.count.attrs['aria-label'], '1 of 2');
  assert.ok(ui.tools.classes.has('flex'));
  ui.input.fire('keydown', { key: 'Enter' });
  ui.input.fire('keydown', { key: 'Enter', shiftKey: true });
  ui.next.fire('click');
  assert.deepEqual(calls.slice(1), [['step', 1], ['step', -1], ['step', 1]]);
  assert.equal(ui.count.textContent, '2/2');
  ui.input.fire('keydown', { key: 'Escape' });
  assert.equal(ui.input.value, '');
  assert.ok(ui.tools.classes.has('hidden'));
  ui.input.fire('keydown', { key: 'Escape' });
  assert.deepEqual(calls.at(-1), ['focus']);
  ui.input.value = 'zzz';
  fake.search = () => ({ k: -1, n: 0 });
  ui.input.fire('input');
  assert.equal(ui.count.textContent, '0/0');
  assert.equal(ui.next.disabled, true);
});

test('follow: a seek elsewhere switches following back on at once', () => {
  let now = 0;
  const f = createFollow(() => now);
  f.scrolled();
  assert.equal(f.on, false);
  f.reset();
  assert.equal(f.on, true);
});

test('looks: the current match beats the selection, a match beats hover', () => {
  assert.match(wordClass({ selected: true, match: 2 }), /bg-accent\/35/);
  assert.match(wordClass({ selected: true, match: 1 }), /bg-accent\/20/);
  assert.match(wordClass({ match: 1 }), /bg-white\/14/);
  assert.match(wordClass({}), /hover:bg-raised/);
});
