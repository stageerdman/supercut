// UI logic, run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, eta } from '../src/ui/dom.js';
import { workText, makeEta, createStatusLine } from '../src/ui/status.js';
import { magicView, createMagic, claudeBanner, NOT_CONNECTED } from '../src/ui/magic.js';
import { isCut, toggleCut, createHistory, withMagic } from '../src/ui/cuts.js';
import { cutTitle } from '../src/ui/transcript.js';
import { bit, setBit } from '../src/ui/bit.js';
import { dropVerdict } from '../src/ui/dropzone.js';
import { runner, summary } from '../src/ai.js';
import { parseRules, rulesText, createRulesStore, mountRules } from '../src/ui/rules.js';

test('clock and eta read plainly', () => {
  assert.equal(clock(75), '01:15');
  assert.equal(clock(3725), '1:02:05');
  assert.equal(eta(NaN), '');
  assert.equal(eta(20), 'less than a minute');
  assert.equal(eta(185), 'about 3 min');
});

test('status line says one thing at a time', () => {
  assert.deepEqual(workText({}), { text: '', pct: null });
  assert.equal(workText({ waiting: true }).text, 'Transcribing…');
  const p = { part: 1, stage: 'transcribe', done: 12, total: 100 };
  assert.deepEqual(workText({ progress: p }), { text: 'Transcribing… 12 %', pct: 0.12 });
  assert.equal(workText({ progress: p, partNo: 2, secondsLeft: 185 }).text, 'Transcribing part 2… 12 % · about 3 min');
  assert.equal(workText({ progress: p, magicQueued: true }).text, 'Transcribing… 12 % · Magic Cut starts when the transcript is ready');
  const d = { part: 1, stage: 'download', done: 335e6, total: 670e6 };
  assert.equal(workText({ progress: d }).text, 'Downloading speech model · 670 MB · 50 %');
  assert.deepEqual(workText({ magicStage: 'Choosing the best takes' }), { text: 'Choosing the best takes…', pct: null });
  assert.equal(workText({ progress: p, magicStage: 'Choosing the best takes' }).text, 'Transcribing… 12 %', 'a new part transcribing wins');
});

test('toolbar status shows a labeled bar while transcribing, then goes away', () => {
  const fake = () => {
    const cls = new Set(['hidden']);
    return { cls, style: {}, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; },
      classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
  };
  const els = { box: fake(), text: fake(), track: fake(), bar: fake() };
  let work = { text: 'Transcribing… 42 %', pct: 0.42 };
  const line = createStatusLine(els, () => work);
  line.render();
  assert.equal(els.box.cls.has('hidden'), false);
  assert.equal(els.track.cls.has('hidden'), false);
  assert.equal(els.text.textContent, 'Transcribing… 42 %');
  assert.equal(els.bar.style.width, '42%');
  assert.equal(els.track.attrs['aria-valuenow'], '42');
  work = { text: '', pct: null };
  line.render();
  assert.equal(els.box.cls.has('hidden'), true, 'done → gone');
});

test('time left waits for real speed, then extrapolates', () => {
  let now = 0;
  const left = makeEta(() => now);
  assert.ok(Number.isNaN(left({ part: 1, stage: 'transcribe', done: 0, total: 100 })));
  now = 1000;
  assert.ok(Number.isNaN(left({ part: 1, stage: 'transcribe', done: 5, total: 100 })), 'too early');
  now = 10000;
  assert.equal(left({ part: 1, stage: 'transcribe', done: 50, total: 100 }), 10);
  assert.ok(Number.isNaN(left({ part: 2, stage: 'transcribe', done: 0, total: 100 })), 'new part restarts');
});

test('a word is cut when its middle is', () => {
  const cuts = [{ part: 1, s: 1, e: 2 }];
  assert.equal(isCut({ s: 1.2, e: 1.5 }, cuts), true);
  assert.equal(isCut({ s: 0.5, e: 1.4 }, cuts), false);
  assert.equal(isCut({ s: 2, e: 2.3 }, cuts), false);
});

const W = [{ s: 0, e: 0.4 }, { s: 0.5, e: 0.9 }, { s: 1, e: 1.4 }, { s: 1.5, e: 2 }];

test('Backspace cuts the selected words; again brings them back', () => {
  const cut = toggleCut([], 1, W.slice(1, 3));
  assert.deepEqual(cut, [{ part: 1, s: 0.5, e: 1.4 }]);
  assert.deepEqual(W.map((w) => isCut(w, cut)), [false, true, true, false]);
  assert.deepEqual(toggleCut(cut, 1, W.slice(1, 3)), [], 'all cut → restored');
  const more = toggleCut(cut, 1, W.slice(2, 4));
  assert.deepEqual(W.map((w) => isCut(w, more)), [false, true, true, true], 'partly cut → all cut');
  assert.deepEqual(toggleCut(cut, 2, W.slice(1, 3)).length, 2, 'other part is separate');
});

test('restoring one word splits a long cut (e.g. from Magic)', () => {
  const magic = [{ part: 1, s: 0, e: 2 }, { part: 2, s: 0, e: 2 }];
  const back = toggleCut(magic, 1, [W[1]]);
  assert.deepEqual(back, [{ part: 1, s: 0, e: 0.5 }, { part: 1, s: 0.9, e: 2 }, { part: 2, s: 0, e: 2 }]);
  assert.deepEqual(W.map((w) => isCut(w, back.filter((c) => c.part === 1))), [true, false, true, true]);
  const why = toggleCut([{ part: 1, s: 0, e: 2, reason: 'earlier take' }], 1, [W[1]]);
  assert.deepEqual(why.map((c) => c.reason), ['earlier take', 'earlier take'], 'the pieces keep the reason');
});

test("Magic's cuts join yours; a second run replaces the first run's", () => {
  const mine = { part: 1, s: 5, e: 6 };
  const first = withMagic([mine], [{ part: 1, from: 0, to: 3, s: 0, e: 2, reason: 'earlier take' }]);
  assert.deepEqual(first, [mine, { part: 1, s: 0, e: 2, reason: 'earlier take' }]);
  assert.deepEqual(withMagic(first, [{ part: 1, s: 8, e: 9, reason: 'fumble' }]), [mine, { part: 1, s: 8, e: 9, reason: 'fumble' }]);
  assert.deepEqual(withMagic(first, []), [mine], 'nothing found: only yours stay');
});

test('a cut word says why on hover', () => {
  assert.equal(cutTitle(undefined, 75), '01:15');
  assert.equal(cutTitle({ s: 70, e: 80 }, 75), 'Cut · 01:15 · Backspace brings it back');
  assert.equal(cutTitle({ s: 70, e: 80, reason: 'earlier take' }, 75), 'Magic Cut: earlier take · Backspace brings it back');
});

test('⌘Z / ⇧⌘Z walk the cuts; a removed part leaves history', () => {
  const h = createHistory();
  h.push([{ part: 1, s: 0, e: 1 }]);
  h.push([{ part: 1, s: 0, e: 1 }, { part: 2, s: 0, e: 1 }]);
  assert.equal(h.undo().length, 1);
  assert.equal(h.undo().length, 0);
  assert.equal(h.undo().length, 0, 'nothing left to undo');
  assert.equal(h.redo().length, 1);
  h.push([]);
  assert.equal(h.redo().length, 0, 'a new cut clears redo');
  h.undo();
  assert.deepEqual(h.forget(1), []);
});

test('← → step one bit: a frame until the timeline sets its zoom', () => {
  assert.equal(bit(), 1 / 30);
  setBit(0.5);
  assert.equal(bit(), 0.5);
  setBit(0);
  assert.equal(bit(), 1 / 30);
});

test('drop verdict', () => {
  assert.equal(dropVerdict(null), null);
  assert.equal(dropVerdict(['/a/Take.MOV', '/b.mp4']), true);
  assert.equal(dropVerdict(['/a.mov', '/b.m4a']), false);
});

test('magic button looks', () => {
  assert.equal(magicView({ kind: 'off' }).visible, false);
  assert.deepEqual(magicView({ kind: 'ready' }), { visible: true, pill: false, label: '✦ Magic Cut' });
  assert.equal(magicView({ kind: 'queued' }).label, 'Magic Cut queued');
  assert.equal(magicView({ kind: 'running', stage: 'Choosing the best takes' }).label, 'Magic Cut', 'the stage is in the status line');
  assert.equal(claudeBanner({ state: 'signed-out' })[1].label, 'Copy command');
  assert.equal(claudeBanner({ state: 'missing' }).length, 1);
});

// ---------- Magic controller with fakes ----------

function rig({ runner, claudeState = 'ready', transcribing = false } = {}) {
  const log = { states: [], flashes: [], banners: [], results: [] };
  const project = {
    parts: [{ id: 1, name: 'a.mov', transcript: { seconds: 2, words: [{ w: 'hi', s: 0, e: 0.4 }] } }],
    transcribing,
  };
  const store = new Map();
  const m = createMagic({
    runner,
    claude: async () => ({ state: claudeState, message: '' }),
    project: () => project,
    paint: (s) => log.states.push(s.kind),
    flash: (t) => log.flashes.push(t),
    banner: (t, a) => log.banners.push([t, a?.label]),
    onResult: (c) => log.results.push(c),
    store: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  });
  return { m, log, project };
}

const okRunner = (result = { summary: '3 cuts', cuts: [{ part: 1, s: 0, e: 0.4 }] }) => ({
  calls: 0, cancelled: 0,
  async run({ parts, onStage }) { this.calls++; this.sent = parts; onStage('Choosing the best takes'); return result; },
  cancel() { this.cancelled++; },
});

test('no runner yet: Magic still shows, and pressing it says it is not connected', async () => {
  const { m, log } = rig({ runner: null });
  m.update();
  assert.equal(m.state.kind, 'ready');
  await m.press();
  assert.deepEqual(log.banners, [[NOT_CONNECTED, undefined]]);
  assert.equal(m.state.kind, 'ready');
});

test('no video, no Magic', () => {
  const { m, project } = rig({ runner: null });
  m.update();
  project.parts = [];
  m.update();
  assert.equal(m.state.kind, 'off');
});

test('Magic runs, sends only text, hands on the cuts, says privacy once', async () => {
  const r = okRunner();
  const { m, log } = rig({ runner: r });
  m.update();
  await m.press();
  assert.deepEqual(r.sent, [{ id: 1, name: 'a.mov', seconds: 2, words: [{ w: 'hi', s: 0, e: 0.4 }] }]);
  assert.deepEqual(log.states, ['ready', 'running', 'running', 'ready']);
  assert.deepEqual(log.results, [[{ part: 1, s: 0, e: 0.4 }]]);
  assert.match(log.flashes[0], /Only the text/);
  assert.equal(log.flashes[1], '3 cuts');
  await m.press();
  assert.equal(log.flashes.filter((f) => /Only the text/.test(f)).length, 1, 'privacy note shows once');
});

test('pressed while transcribing: queues, then starts by itself', async () => {
  const r = okRunner();
  const { m, project } = rig({ runner: r, transcribing: true });
  m.update();
  await m.press();
  assert.equal(m.state.kind, 'queued');
  assert.equal(r.calls, 0);
  project.transcribing = false;
  m.update();
  await new Promise((ok) => setTimeout(ok));
  assert.equal(r.calls, 1);
  assert.equal(m.state.kind, 'ready');
});

test('pressing the pill cancels the queue', async () => {
  const { m } = rig({ runner: okRunner(), transcribing: true });
  m.update();
  await m.press();
  await m.press();
  assert.equal(m.state.kind, 'ready');
});

test('signed out: banner with the command, nothing runs', async () => {
  const r = okRunner();
  const { m, log } = rig({ runner: r, claudeState: 'signed-out' });
  m.update();
  await m.press();
  assert.equal(r.calls, 0);
  assert.deepEqual(log.banners, [['Sign in to Claude to use Magic Cut: open Terminal and run `claude`.', 'Copy command']]);
});

test('a failed run leaves the project untouched and offers Try again', async () => {
  const r = { async run() { throw new Error('Claude is busy. Try again in a minute.'); }, cancel() {} };
  const { m, log } = rig({ runner: r });
  m.update();
  await m.press();
  assert.deepEqual(log.results, []);
  assert.deepEqual(log.banners, [['Claude is busy. Try again in a minute.', 'Try again']]);
  assert.equal(m.state.kind, 'ready');
});

test('cancel while running drops the late result', async () => {
  let finish;
  const r = { cancelled: 0, run: () => new Promise((ok) => (finish = ok)), cancel() { this.cancelled++; } };
  const { m, log } = rig({ runner: r });
  m.update();
  const running = m.press();
  await new Promise((ok) => setTimeout(ok));
  assert.equal(m.state.kind, 'running');
  await m.press(); // the pill's ✕
  finish({ summary: 'x', cuts: [{ part: 1, s: 0, e: 1 }] });
  await running;
  assert.equal(r.cancelled, 1);
  assert.deepEqual(log.results, []);
  assert.equal(m.state.kind, 'ready');
});

// ---------- The connected runner (src/ai.js) ----------

test('Magic summary: cuts and the length before → after, across parts', () => {
  const parts = [{ seconds: 30 }, { seconds: 12.5 }];
  assert.equal(summary([{ s: 4, e: 8 }, { s: 18.2, e: 22.4 }, { s: 31.8, e: 33.8 }], parts), '3 cuts · 00:42 → 00:32 · ⌘Z to undo');
  assert.equal(summary([{ s: 0, e: 2 }], parts), '1 cut · 00:42 → 00:40 · ⌘Z to undo');
  assert.match(summary([], parts), /Nothing cut/);
});

test('the runner asks Rust auto_cut with the parts and hands back its cuts', async () => {
  const cuts = [{ part: 1, from: 0, to: 2, s: 0, e: 1, reason: 'earlier take' }];
  const asked = [];
  globalThis.window = { __TAURI__: { core: { invoke: async (cmd, args) => (asked.push([cmd, args]), cuts) } } };
  const stages = [];
  const parts = [{ id: 1, name: 'a.mov', seconds: 10, words: [] }];
  const result = await runner.run({ parts, onStage: (s) => stages.push(s) });
  assert.deepEqual(asked, [['auto_cut', { parts }]]);
  assert.deepEqual(result, { summary: '1 cut · 00:10 → 00:09 · ⌘Z to undo', cuts });
  assert.deepEqual(stages, ['Choosing the best takes']);
  delete globalThis.window;
});

// ---------- Your rules (src/ui/rules.js) ----------

function fakeRulesDisk(start = [], { failSave = false } = {}) {
  const calls = [];
  let disk = start;
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'get_rules') return disk;
    if (failSave) throw "Your rules couldn't be saved."; // Rust rejects with a plain string
    return (disk = args.rules);
  };
  let fire = null;
  const store = createRulesStore(invoke, { timer: (f) => (fire = f), clear: () => (fire = null) });
  return { store, calls, disk: () => disk, tick: () => fire?.() };
}

test('a rule is a trimmed, non-empty line', () => {
  assert.deepEqual(parseRules('  Keep my jokes \n\n Cut every um\nKeep my jokes'), ['Keep my jokes', 'Cut every um'], 'like Rust: no repeats');
  assert.deepEqual(parseRules(''), []);
  assert.equal(rulesText(['a', 'b']), 'a\nb');
});

test('rules: load shows what is saved; typing saves after a pause, cleaned', async () => {
  const r = fakeRulesDisk(['Keep my jokes']);
  assert.equal(r.store.loaded, false);
  assert.equal(await r.store.load(), 'Keep my jokes');
  r.store.edit('Keep my jokes\n  Cut every um  \n');
  assert.equal(r.calls.length, 1, 'nothing saved before the pause');
  r.tick();
  await r.store.flush();
  assert.deepEqual(r.disk(), ['Keep my jokes', 'Cut every um']);
  assert.equal(await r.store.load(), 'Keep my jokes\n  Cut every um  \n', 'reopening keeps the box as typed');
  assert.equal(r.calls.filter(([c]) => c === 'get_rules').length, 1, 'loaded once');
});

test('rules: deleting every line saves an empty list; no change, no save', async () => {
  const r = fakeRulesDisk(['Cut every um']);
  await r.store.load();
  r.store.edit('Cut every um\n');
  await r.store.flush();
  assert.equal(r.calls.length, 1, 'same rules → not saved again');
  r.store.edit('');
  await r.store.flush();
  assert.deepEqual(r.disk(), []);
});

test('rules: a failed save rejects with the message and tries again next time', async () => {
  const r = fakeRulesDisk([], { failSave: true });
  await r.store.load();
  r.store.edit('Keep my jokes');
  await assert.rejects(r.store.flush(), /couldn't be saved/);
  await assert.rejects(r.store.flush(), /couldn't be saved/);
  assert.equal(r.calls.filter(([c]) => c === 'save_rules').length, 2);
});

test('rules: after a failed save, changing the text back to the saved rules saves nothing and does not fail', async () => {
  let failing = true;
  const calls = [];
  const store = createRulesStore(async (cmd, args) => {
    calls.push(cmd);
    if (cmd === 'get_rules') return ['Keep my jokes'];
    if (failing) throw "Your rules couldn't be saved.";
    return args.rules;
  }, { timer: () => null, clear: () => {} });
  await store.load();
  store.edit('Keep my jokes\nCut every um');
  await assert.rejects(store.flush(), /couldn't be saved/);
  failing = false;
  store.edit('Keep my jokes');
  await store.flush(); // resolves: no stale error, so Magic Cut isn't blocked
  assert.deepEqual(calls, ['get_rules', 'save_rules'], 'nothing new to save');
});

test('rules panel: gear opens it filled, typing + Esc saves, ⌘, toggles, click outside closes', async () => {
  const node = (hidden) => {
    const cls = new Set(hidden ? ['hidden'] : []);
    return { cls, attrs: {}, value: '', readOnly: false, focused: 0, listeners: {},
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
      setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused++; }, setSelectionRange() {},
      contains(t) { return t === this; }, addEventListener(k, f) { this.listeners[k] = f; } };
  };
  const docListeners = {};
  globalThis.document = { addEventListener: (k, f) => (docListeners[k] = f) };
  const gear = node(), panel = node(true), box = node();
  const r = fakeRulesDisk(['Keep my jokes']);
  const errors = [];
  const ui = mountRules({ gear, panel, box }, r.store, { onError: (e) => errors.push(e) });
  const settle = () => new Promise((ok) => setTimeout(ok));
  const key = (k, metaKey = false) => docListeners.keydown({ key: k, metaKey, preventDefault() {} });

  await gear.onclick();
  assert.equal(panel.cls.has('hidden'), false);
  assert.equal(gear.attrs['aria-expanded'], 'true');
  assert.equal(box.value, 'Keep my jokes');
  assert.equal(box.readOnly, false);

  box.value = 'Keep my jokes\nCut every um';
  box.listeners.input();
  key('Escape');
  await settle();
  assert.equal(panel.cls.has('hidden'), true);
  assert.equal(gear.focused, 1, 'focus back on the gear');
  assert.deepEqual(r.disk(), ['Keep my jokes', 'Cut every um'], 'closing saves at once');

  key(',', true);
  await settle();
  assert.equal(panel.cls.has('hidden'), false, '⌘, opens');
  docListeners.mousedown({ target: {} });
  assert.equal(panel.cls.has('hidden'), true, 'a click outside closes');
  assert.equal(await ui.close(), true, 'close when closed still reports saved (Magic Cut waits on it)');
  assert.deepEqual(errors, []);
  delete globalThis.document;
});

test('rules panel: a file it cannot read stays read-only and says why', async () => {
  globalThis.document = { addEventListener() {} };
  const box = { value: '', readOnly: false, focus() {}, setSelectionRange() {}, addEventListener() {} };
  const el = () => ({ classList: { add() {}, remove() {}, contains: () => true }, setAttribute() {}, focus() {} });
  const errors = [];
  const store = createRulesStore(async () => { throw "Couldn't read or save your editing rules."; });
  const gear = el();
  mountRules({ gear, panel: el(), box }, store, { onError: (e) => errors.push(e) });
  await gear.onclick();
  assert.equal(box.readOnly, true);
  assert.deepEqual(errors, ["Couldn't read or save your editing rules."]);
  delete globalThis.document;
});

test('rules: the panel only calls commands Rust registers', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const handlers = (await readFile(new URL('src-tauri/src/main.rs', root), 'utf8')).match(/generate_handler!\[([^\]]*)\]/)[1];
  const used = [...(await readFile(new URL('src/ui/rules.js', root), 'utf8')).matchAll(/invoke\('(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(used.sort(), ['get_rules', 'save_rules']);
  for (const cmd of used) assert.match(handlers, new RegExp(`\\b${cmd}\\b`), cmd);
});

test('no "SuperCut" reaches the screen: UI, banners, Rust error text', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const ui = (await readdir(new URL('src/ui/', root))).map((f) => `src/ui/${f}`);
  for (const f of ['src/index.html', 'src/main.js', 'src/ai.js', 'src-tauri/src/error.rs', 'src-tauri/tauri.conf.json', ...ui]) {
    assert.doesNotMatch(await readFile(new URL(f, root), 'utf8'), /Super ?Cut/, f);
  }
});
