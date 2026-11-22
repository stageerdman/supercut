// Timeline words by zoom: the levels, phrase starts and label layout (word-levels.js), and the strip painter's fades
// (strip-view.js) against a fake canvas and clock. Spec: design/timeline-words-by-zoom.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { secondsPerWord, levelFor, phraseStarts, layoutLabels, GAP, INSET } from '../src/ui/word-levels.js';
import { stripPainter, FADE_IN, CROSSFADE } from '../src/ui/strip-view.js';
import { layout, fitPps } from '../src/ui/timeline-geometry.js';
import { pauses } from '../src/ui/pauses.js';
import { cutsOf } from '../src/ui/cuts.js';
import { MIN_W } from '../src/ui/cut-view.js';

const measure = (text) => text.length * 5.5; // an 11 pt caption, roughly
const you = (s, e, part = 1) => ({ part, s, e, by: 'you' });

// A talk of 72 words in 6 sentences: 0.3 s words, 0.1 s apart, a 1 s silence after sentences 2, 3 and 5 (pauses).
const SENTENCES = [
  'So the first thing we need to do today is open the project.',
  'Then we pick a recording and drop it right on the timeline here.',
  'Magic Cut listens to every word and writes it all down for you.',
  'You can read the transcript and click any word to jump straight there.',
  'Cutting is easy because you just select words and press backspace once.',
  'And when you are happy with the result you export the finished video.',
];
function talk() {
  const out = [];
  let t = 0.5;
  SENTENCES.forEach((sentence, k) => {
    for (const w of sentence.split(' ')) { out.push({ w, s: t, e: t + 0.3 }); t += 0.4; }
    if (k === 1 || k === 2 || k === 4) t += 1;
  });
  return out;
}
const WORDS = talk();
const LEN = WORDS.at(-1).e + 1;
const CUTS = [you(WORDS[14].s - 0.05, WORDS[17].e + 0.05), you(WORDS[50].s - 0.05, WORDS[52].e + 0.05)];
const PAUSES = pauses(WORDS, LEN);

function labelsAt(pps, level, { scroll = 0, width = 100000, cuts = CUTS } = {}) {
  const [box] = layout([{ id: 1, duration: LEN }], pps);
  return { box, labels: layoutLabels({ box, words: WORDS, cuts, pauses: PAUSES, scroll, width, level, measure }) };
}

/** Every rule a label must keep, checked against the fixture. */
function checkRules({ box, labels }, level, scroll = 0) {
  const k = box.w / box.len, X = (t) => box.x + t * k - scroll;
  const blocks = [
    ...PAUSES.map((p) => [X(p.s), X(p.s) + Math.max(2, (p.e - p.s) * k)]),
    ...cutsOf(CUTS, 1).map((c) => [X(c.s), X(c.s) + Math.max(MIN_W, (c.e - c.s) * k)]),
  ];
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  sorted.forEach((l, n) => {
    const i = +l.key.split(':')[1];
    const right = l.x + measure(l.text);
    assert.ok(Math.abs(l.x - (X(WORDS[i].s) + INSET)) < 1e-9, `"${l.text}" sits at its first word's time`);
    const next = sorted[n + 1];
    if (next) assert.ok(right + GAP <= next.x + 1e-9, `"${l.text}" and "${next.text}" don't overlap`);
    assert.ok(right + GAP <= X(box.len) + 1e-9, `"${l.text}" stays inside its part`);
    for (const [a, b] of blocks) {
      assert.ok(!(a <= l.x - INSET && l.x - INSET < b), `"${l.text}" doesn't start inside a pause or cut`);
      if (a > l.x - INSET) assert.ok(right + GAP <= a + 1e-9, `"${l.text}" doesn't run into a pause or cut`);
    }
    const shown = l.text.replace(/…$/, '').split(' ');
    assert.deepEqual(shown, WORDS.slice(i, i + shown.length).map((w) => w.w), 'whole words, in order, from its start');
    if (level === 'words') assert.equal(shown.length, 1);
  });
  return labels;
}

test('secondsPerWord: span over count, summed across parts; no words → null', () => {
  const a = [{ w: 'a', s: 1, e: 1.3 }, { w: 'b', s: 1.4, e: 2 }];
  const b = [{ w: 'c', s: 0, e: 0.5 }];
  assert.equal(secondsPerWord([a, b]), (1 + 0.5) / 3);
  assert.equal(secondsPerWord([[], undefined]), null);
  assert.equal(secondsPerWord([]), null);
});

test('levelFor: words from 32, phrases from 5, none below; hysteresis 28 / 4 on the way down', () => {
  assert.equal(levelFor(40), 'words');
  assert.equal(levelFor(20), 'phrases');
  assert.equal(levelFor(2), 'none');
  assert.equal(levelFor(null), 'none');
  assert.equal(levelFor(30, 'words'), 'words', 'from words, 30 stays');
  assert.equal(levelFor(27, 'words'), 'phrases', '…27 drops');
  assert.equal(levelFor(30, 'phrases'), 'phrases', 'going up, 30 is not yet words');
  assert.equal(levelFor(4.5, 'none'), 'none', 'from none, 4.5 stays');
  assert.equal(levelFor(5, 'none'), 'phrases', '…5 rises');
  assert.equal(levelFor(4.5, 'phrases'), 'phrases');
  assert.equal(levelFor(3.9, 'phrases'), 'none');
  assert.equal(levelFor(3, 'words'), 'none', 'a jump skips a level');
});

test('phraseStarts: part start, after . ? ! … (closing quote too), after a 0.4 s gap, first kept after a cut', () => {
  const w = (word, s) => ({ w: word, s, e: s + 0.2 });
  const words = [
    w('Hi.', 0), w('Ok?', 0.3), w('"Yes!"', 0.6), w('well…', 0.9), w('so', 1.2), // sentence ends
    w('and', 1.5), w('then', 2.1), // a 0.4 s gap before "then"
    w('we', 2.4), w('cut', 2.7), w('this', 3.0), w('out', 3.3), w('ok', 3.6),
  ];
  assert.deepEqual(phraseStarts(words, []), [0, 1, 2, 3, 4, 6]);
  assert.deepEqual(phraseStarts(words, [you(2.65, 3.25)]), [0, 1, 2, 3, 4, 6, 10], '"out" after the cut');
  assert.deepEqual(phraseStarts(words, [you(0, 0.25)]), [1, 2, 3, 4, 6], 'first word cut: the first kept starts');
  assert.deepEqual(phraseStarts([], []), []);
});

test('fit on a 20-minute part is none; a 10-second view is words', () => {
  const part = { id: 1, duration: 20 * 60 };
  const spw = 0.4;
  assert.equal(levelFor(fitPps([part], 1200) * spw), 'none');
  assert.equal(levelFor((1200 / 10) * spw), 'words');
  assert.equal(levelFor(100 * secondsPerWord([WORDS])), 'words', 'the fixture at 100 pt/s');
  assert.equal(levelFor(30 * secondsPerWord([WORDS])), 'phrases', '…at 30 pt/s');
  assert.equal(levelFor(5 * secondsPerWord([WORDS])), 'none', '…at 5 pt/s');
});

test('words level: every kept word whole, at its time, none overlapping, none in a cut', () => {
  const at = labelsAt(150, 'words');
  checkRules(at, 'words');
  const keys = new Set(at.labels.map((l) => +l.key.split(':')[1]));
  for (const i of [14, 15, 16, 17, 50, 51, 52]) assert.ok(!keys.has(i), `cut word ${WORDS[i].w} is not laid out`);
  assert.ok(at.labels.length >= 60, `nearly every kept word is shown at 150 pt/s (${at.labels.length})`);
  // Zoomed less: still whole and apart, just fewer of them.
  const tight = checkRules(labelsAt(80, 'words'), 'words');
  assert.ok(tight.length < at.labels.length);
});

test('phrases level: the first words of each phrase, "…" only when it goes on and fits; rules kept', () => {
  for (const pps of [12, 20, 30, 45, 70]) {
    const at = labelsAt(pps, 'phrases');
    checkRules(at, 'phrases');
    const starts = phraseStarts(WORDS, CUTS);
    for (const l of at.labels) {
      const i = +l.key.split(':')[1];
      assert.ok(starts.includes(i), `"${l.text}" starts a phrase`);
      const n = l.text.replace(/…$/, '').split(' ').length;
      const stop = starts[starts.indexOf(i) + 1] ?? WORDS.length;
      const phraseLen = WORDS.slice(i, stop).findIndex((w, j) => CUTS.some((c) => c.s <= w.s && w.s < c.e));
      const len = phraseLen < 0 ? stop - i : phraseLen;
      assert.equal(l.text.endsWith('…'), n < len, `"${l.text}": "…" exactly when the phrase goes on`);
    }
  }
  assert.deepEqual(labelsAt(20, 'phrases').labels.map((l) => l.text),
    ['So the first…', 'and drop…', 'Magic Cut…', 'You can read…', 'is easy…', 'And when you are…'],
    'part start, after cuts ("and drop…", "is easy…"), after sentence ends; "Then" has no room before its cut');
});

test('a label that does not fit is skipped, never clipped; the next one keeps its place', () => {
  const words = [{ w: 'Extraordinarily', s: 0, e: 0.3 }, { w: 'ok', s: 0.4, e: 0.6 }];
  const [box] = layout([{ id: 1, duration: 1 }], 100); // "Extraordinarily" needs 82.5 pt, it gets 40 − 6
  const labels = layoutLabels({ box, words, cuts: [], pauses: [], scroll: 0, width: 1000, level: 'words', measure });
  assert.deepEqual(labels.map((l) => l.text), ['ok']);
  assert.equal(labels[0].x, box.x + 40 + INSET);
});

test('none level, no words, or a part out of view → no labels; only what is in view (plus one before)', () => {
  assert.deepEqual(labelsAt(5, 'none').labels, []);
  const [box] = layout([{ id: 1, duration: LEN }], 150);
  assert.deepEqual(layoutLabels({ box, words: [], cuts: [], pauses: [], scroll: 0, width: 1000, level: 'words', measure }), []);
  assert.deepEqual(layoutLabels({ box, words: WORDS, cuts: CUTS, pauses: PAUSES, scroll: 1e6, width: 1000, level: 'words', measure }), []);
  const view = checkRules(labelsAt(150, 'words', { scroll: 1000, width: 400 }), 'words', 1000);
  assert.ok(view.length > 0 && view.length < 20);
  assert.ok(view.every((l) => l.x <= 400), 'nothing past the view');
  assert.equal(view.filter((l) => l.x < 0).length, 1, 'one label before it');
});

// ---------- strip-view.js: drawing and fades ----------

function fakeCanvas() {
  const calls = [];
  return {
    calls,
    measureText: (s) => ({ width: measure(s) }),
    fillText: (text, x, y) => calls.push({ op: 'fillText', text, x, y, style: calls.style }),
    set fillStyle(v) { calls.style = v; },
    get fillStyle() { return calls.style; },
    clip: () => calls.push({ op: 'clip' }),
    rect() {}, save() {}, restore() {}, beginPath() {}, fillRect() {},
  };
}
const alphaOf = (style) => +style.match(/, ([\d.]+)\)$/)[1];

function setup({ reduce = false } = {}) {
  let t = 0;
  const painter = stripPainter({ now: () => t, reduceMotion: () => reduce, moreContrast: () => false });
  const paint = (pps, cuts = CUTS) => {
    const g = fakeCanvas();
    const boxes = layout([{ id: 1, duration: LEN }], pps);
    const fading = painter.draw(g, { boxes, scroll: 0, width: 100000, pps, words: () => WORDS, cuts, pauses: () => PAUSES });
    return { texts: g.calls.filter((c) => c.op === 'fillText'), clips: g.calls.filter((c) => c.op === 'clip'), fading, boxes };
  };
  return { painter, paint, tick: (ms) => { t += ms; } };
}

test('the strip painter draws exactly the layout\'s labels at three zooms, with no clipping', () => {
  for (const [pps, level] of [[150, 'words'], [30, 'phrases'], [5, 'none']]) {
    const { paint, tick, painter } = setup({ reduce: true });
    const { texts, clips, boxes } = paint(pps);
    assert.equal(painter.level(), level);
    const want = layoutLabels({ box: boxes[0], words: WORDS, cuts: CUTS, pauses: PAUSES, scroll: 0, width: 100000, level, measure });
    assert.deepEqual(texts.map((c) => c.text), want.map((l) => l.text), `${level}: the strings drawn`);
    texts.forEach((c, n) => assert.ok(Math.abs(c.x - want[n].x) < 1e-9));
    assert.equal(clips.length, 0, 'never clipped');
    tick(16);
  }
});

test('a new label fades in over 120 ms; a phrase gaining a word keeps its alpha', () => {
  const { paint, tick } = setup();
  let f = paint(150);
  assert.ok(f.texts.every((c) => alphaOf(c.style) === 0), 'a new key starts at 0');
  assert.equal(f.fading, true);
  tick(FADE_IN / 2);
  f = paint(150);
  assert.ok(f.texts.every((c) => alphaOf(c.style) > 0 && alphaOf(c.style) < 0.9));
  tick(FADE_IN / 2);
  f = paint(150);
  assert.ok(f.texts.every((c) => alphaOf(c.style) === 0.9), 'full by 120 ms');
  assert.equal(f.fading, false, 'nothing left to animate');

  // Inside the phrases level, zooming in grows "So the…" → "So the first…": the same key, no fade.
  const p = setup();
  p.paint(20); p.tick(CROSSFADE + FADE_IN); p.paint(20);
  const before = p.paint(20).texts.find((c) => c.text.startsWith('So '));
  p.tick(16);
  const after = p.paint(26).texts.find((c) => c.text.startsWith('So '));
  assert.notEqual(before.text, after.text, `the phrase grows (${before.text} → ${after.text})`);
  assert.equal(alphaOf(after.style), 0.9, 'same key: no fade');
});

test('crossing a level draws both sets for 150 ms, then only the new one; Reduce Motion switches at once', () => {
  const { paint, tick } = setup();
  paint(30); tick(1000); paint(30); // phrases, settled
  tick(16);
  const words = layoutLabels({ box: layout([{ id: 1, duration: LEN }], 150)[0], words: WORDS, cuts: CUTS, pauses: PAUSES, scroll: 0, width: 100000, level: 'words', measure });
  const phrases = layoutLabels({ box: layout([{ id: 1, duration: LEN }], 150)[0], words: WORDS, cuts: CUTS, pauses: PAUSES, scroll: 0, width: 100000, level: 'phrases', measure });
  let f = paint(150); // to words: the first frame is still all old
  assert.deepEqual(f.texts.map((c) => c.text), phrases.map((l) => l.text), 'frame one: the old set, at full');
  assert.equal(f.fading, true);
  tick(CROSSFADE / 2);
  f = paint(150);
  assert.equal(f.texts.length, phrases.length + words.length, 'halfway: both sets');
  const [out, inn] = [f.texts.slice(0, phrases.length), f.texts.slice(phrases.length)];
  assert.ok(out.every((c) => alphaOf(c.style) < 0.9 && alphaOf(c.style) > 0), 'old fading out');
  assert.ok(inn.every((c) => alphaOf(c.style) < 0.9 && alphaOf(c.style) > 0), 'new fading in');
  tick(CROSSFADE / 2);
  f = paint(150);
  assert.deepEqual(f.texts.map((c) => c.text), words.map((l) => l.text), 'then only the new set');
  assert.ok(f.texts.every((c) => alphaOf(c.style) === 0.9), '…fully shown, no second fade');

  const r = setup({ reduce: true });
  r.paint(30);
  r.tick(16);
  f = r.paint(150);
  assert.deepEqual(f.texts.map((c) => c.text), words.map((l) => l.text), 'Reduce Motion: only the new set');
  assert.ok(f.texts.every((c) => alphaOf(c.style) === 0.9));
  assert.equal(f.fading, false);
});

test('pinching on a threshold does not flicker: hysteresis holds the level', () => {
  const { paint, tick, painter } = setup();
  const spw = secondsPerWord([WORDS]);
  paint(33 / spw);
  assert.equal(painter.level(), 'words');
  for (const ppw of [31, 29, 30.5, 28.5, 31.9]) { tick(16); paint(ppw / spw); assert.equal(painter.level(), 'words'); }
  tick(16); paint(27 / spw);
  assert.equal(painter.level(), 'phrases');
  for (const ppw of [29, 31, 28.2]) { tick(16); paint(ppw / spw); assert.equal(painter.level(), 'phrases'); }
});
