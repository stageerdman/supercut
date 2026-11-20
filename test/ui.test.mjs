// UI logic, run without a window: `npm run test:ui`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, eta } from '../src/ui/dom.js';
import { workText, makeEta } from '../src/ui/status.js';
import { magicView, createMagic, claudeBanner } from '../src/ui/magic.js';
import { isCut } from '../src/ui/transcript.js';
import { dropVerdict } from '../src/ui/dropzone.js';

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
  assert.equal(workText({ progress: p, magicQueued: true }).text, 'Transcribing… 12 % · Magic starts when the transcript is ready');
  const d = { part: 1, stage: 'download', done: 335e6, total: 670e6 };
  assert.equal(workText({ progress: d }).text, 'Downloading speech model · 670 MB · 50 %');
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

test('drop verdict', () => {
  assert.equal(dropVerdict(null), null);
  assert.equal(dropVerdict(['/a/Take.MOV', '/b.mp4']), true);
  assert.equal(dropVerdict(['/a.mov', '/b.m4a']), false);
});

test('magic button looks', () => {
  assert.equal(magicView({ kind: 'off' }).visible, false);
  assert.deepEqual(magicView({ kind: 'ready' }), { visible: true, pill: false, label: '✦ Magic' });
  assert.equal(magicView({ kind: 'queued' }).label, 'Magic queued');
  assert.equal(magicView({ kind: 'running', stage: 'Choosing the best takes' }).label, 'Choosing the best takes…');
  assert.equal(claudeBanner({ state: 'signed-out' })[1].label, 'Copy command');
  assert.equal(claudeBanner({ state: 'missing' }).length, 1);
});

// ---------- Magic controller with fakes ----------

function rig({ runner, claudeState = 'ready', transcribing = false } = {}) {
  const log = { states: [], flashes: [], banners: [], results: [] };
  const project = {
    parts: [{ id: 1, name: 'a.mov', transcript: { words: [{ w: 'hi', s: 0, e: 0.4 }] } }],
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

test('no runner, no Magic', () => {
  const { m, log } = rig({ runner: null });
  m.update();
  assert.equal(m.state.kind, 'off');
  assert.deepEqual(log.states, []);
});

test('Magic runs, sends only text, hands on the cuts, says privacy once', async () => {
  const r = okRunner();
  const { m, log } = rig({ runner: r });
  m.update();
  await m.press();
  assert.deepEqual(r.sent, [{ id: 1, name: 'a.mov', words: [{ w: 'hi', s: 0, e: 0.4 }] }]);
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
  assert.deepEqual(log.banners, [['Sign in to Claude to use Magic: open Terminal and run `claude`.', 'Copy command']]);
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
