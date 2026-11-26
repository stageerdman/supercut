// Settings sections (Usage, Help) and Claude setup, with fakes: no window, no Rust.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument } from './fake-dom.mjs';
import { section } from '../src/ui/settings-section.js';
import { formatTokens, exactTokens, middleTruncate, usageView, mountUsage, MAX_ROWS } from '../src/ui/usage.js';
import { mountDebugReport, reportRef, FAILED, HINT } from '../src/ui/debug-report.js';
import { setupBanner, createClaudeWait, createClaudeSetup, POLL_MS, GIVE_UP_MS } from '../src/ui/claude-setup.js';
import { createMagic } from '../src/ui/magic.js';
import { createRulesStore, mountRules } from '../src/ui/rules.js';

globalThis.document = makeDocument();
const tick = () => new Promise((r) => setImmediate(r));

// ---------- Usage ----------

test('usage: token counts read short', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(1000), '1 k');
  assert.equal(formatTokens(412318), '412 k');
  assert.equal(formatTokens(999_499), '999 k');
  assert.equal(formatTokens(999_500), '1 M');
  assert.equal(formatTokens(1_240_000), '1.2 M');
  assert.equal(formatTokens(9_950_000), '10 M');
  assert.equal(formatTokens(12_400_000), '12 M');
  assert.equal(formatTokens(undefined), '0');
  assert.equal(exactTokens(412318), '412,318');
});

test('usage: long names keep their start and end', () => {
  assert.equal(middleTruncate('short'), 'short');
  const t = middleTruncate('my-very-long-podcast-episode-name-final');
  assert.equal(t.length, 30);
  assert.ok(t.startsWith('my-very-long'));
  assert.ok(t.endsWith('final'));
  assert.ok(t.includes('…'));
});

test('usage: states: unreadable, nothing exported, rows with a total', () => {
  assert.deepEqual(usageView(null), { aside: '', hint: "Usage can't be read right now.", rows: [] });
  assert.equal(usageView({ projects: [{ name: 'a', tokens: 5, exported: false }] }).hint, 'Videos count here once you export them.');
  const v = usageView({ projects: [{ name: 'talk-final', tokens: 412318, exported: true }, { name: 'draft', tokens: 9, exported: false }, { name: '', tokens: 860000, exported: true }] });
  assert.equal(v.aside, '1.3 M tokens'); // only exported videos count
  assert.equal(v.hint, '');
  assert.deepEqual(v.rows.map((r) => [r.name, r.tokens]), [['talk-final', '412 k'], ['Untitled', '860 k']]);
  assert.equal(v.rows[0].exact, 'talk-final, 412,318 tokens');
});

const texts = (n) => n.all().filter((c) => c.tag === 'td').map((c) => c.textContent);

test('usage: the section fills from token_usage on refresh, and scrolls past five rows', async () => {
  let answer = { projects: [{ name: 'a', tokens: 1200, exported: true }], total: 1200 };
  const calls = [];
  const u = mountUsage(async (cmd) => { calls.push(cmd); if (answer instanceof Error) throw answer; return answer; });
  assert.equal(u.node.tag, 'section');
  await u.refresh();
  assert.deepEqual(calls, ['token_usage']);
  assert.ok(u.node.textContent.includes('1 k tokens'));
  assert.deepEqual(texts(u.node), ['a', '1 k']);
  const box = u.node.children.at(-1);
  assert.equal(box.getAttribute('tabindex'), null); // five or fewer: nothing to scroll, no tab stop

  answer = { projects: Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ name: `v${i}`, tokens: 1000, exported: true })) };
  await u.refresh();
  assert.equal(texts(u.node).length, (MAX_ROWS + 1) * 2);
  assert.equal(box.getAttribute('tabindex'), '0');
  assert.equal(box.getAttribute('aria-label'), 'Usage by video');

  answer = new Error('disk');
  const err = console.error; console.error = () => {};
  await u.refresh();
  console.error = err;
  assert.ok(u.node.textContent.includes("Usage can't be read right now."));
  assert.deepEqual(texts(u.node), []);
  assert.equal(box.getAttribute('tabindex'), null);
});

test('section: aside and hint hide when empty', () => {
  const s = section({ title: 'T', id: 'x' });
  const [head, hint] = s.node.children;
  assert.ok(hint.classList.contains('hidden'));
  assert.ok(head.children[1].classList.contains('hidden'));
  s.setHint('hello');
  assert.ok(!hint.classList.contains('hidden'));
  assert.equal(hint.id, 'x-hint');
});

// ---------- Help: debug report ----------

test('debug report: sending, sent with a ref, failed, reset', async () => {
  assert.equal(reportRef('a1b2c3d4-ffff'), 'A1B2');
  let finish;
  let fail = false;
  const calls = [];
  const h = mountDebugReport((cmd) => { calls.push(cmd); return new Promise((ok, no) => { finish = () => (fail ? no('offline') : ok({ id: 'a1b2c3d4' })); }); });
  assert.ok(h.node.textContent.includes(HINT));
  assert.equal(h.button.getAttribute('aria-describedby'), 'help-hint');
  const status = h.node.all().find((n) => n.getAttribute('role') === 'status');

  h.button.click();
  assert.equal(h.button.textContent, 'Sending…');
  assert.equal(h.button.getAttribute('aria-disabled'), 'true');
  h.button.click(); // a second press while sending does nothing
  assert.deepEqual(calls, ['send_debug_report']);
  h.reset(); // closing the panel mid-send keeps the answer coming
  finish();
  await tick();
  assert.equal(status.textContent, 'Sent · ref A1B2');
  assert.equal(h.button.textContent, 'Send debug report');
  assert.equal(h.button.getAttribute('aria-disabled'), null);

  fail = true;
  const err = console.error; console.error = () => {};
  const sent = h.send();
  finish();
  await sent;
  console.error = err;
  assert.equal(status.textContent, FAILED);
  h.reset();
  assert.equal(status.textContent, '');
});

// ---------- The panel: rules + sections ----------

test('settings panel: opening refreshes Usage, closing clears Help', async () => {
  const doc = globalThis.document;
  const gear = doc.createElement('button');
  const panel = doc.createElement('section');
  panel.className = 'hidden';
  const box = doc.createElement('textarea');
  box.setSelectionRange = () => {};
  panel.append(box);
  const log = [];
  const store = createRulesStore(async (cmd) => (cmd === 'get_rules' ? [] : []));
  const r = mountRules({ gear, panel, box }, store, { onError: () => {}, onOpen: () => log.push('open'), onClose: () => log.push('close') });
  gear.click();
  await tick();
  assert.deepEqual(log, ['open']);
  await r.close();
  assert.deepEqual(log, ['open', 'close']);
  await r.close(); // already closed: no second clear
  assert.deepEqual(log, ['open', 'close']);
});

test('settings: every command the sections call is registered in Rust', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const handlers = (await readFile(new URL('src-tauri/src/main.rs', root), 'utf8')).match(/generate_handler!\[([^\]]*)\]/)[1];
  const used = [];
  for (const f of ['usage.js', 'debug-report.js', 'claude-setup.js']) {
    used.push(...[...(await readFile(new URL(`src/ui/${f}`, root), 'utf8')).matchAll(/invoke\('(\w+)'/g)].map((m) => m[1]));
  }
  assert.deepEqual([...new Set(used)].sort(), ['claude_setup', 'claude_status', 'send_debug_report', 'token_usage']);
  for (const cmd of used) assert.match(handlers, new RegExp(`\\b${cmd}\\b`), cmd);
});

// ---------- Claude setup ----------

test('claude setup: the banner words for each phase', () => {
  const missing = { state: 'missing' };
  const out = { state: 'signed-out' };
  assert.deepEqual(setupBanner(missing), { text: "Magic Cut uses Claude to pick your best takes. It isn't on this Mac yet.", label: 'Install Claude' });
  assert.deepEqual(setupBanner(out), { text: 'Sign in to Claude to use Magic Cut.', label: 'Sign in' });
  assert.equal(setupBanner(missing, 'opened').text, 'Installing Claude in Terminal…');
  assert.equal(setupBanner(out, 'opened').text, "Sign in in your browser. Magic starts when you're done.");
  assert.equal(setupBanner(out, 'opened', { magic: false }).text, 'Sign in in your browser.');
  assert.deepEqual(setupBanner(out, 'installed'), { text: 'Claude is installed. Sign in in your browser.', label: 'Open again' });
});

/** A fake clock: timers run only when advanced. */
function fakeClock() {
  let t = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => t,
    timer: (f, ms) => { timers.set(++id, { f, at: t + ms }); return id; },
    clear: (k) => timers.delete(k),
    async advance(ms) {
      t += ms;
      for (const [k, { f, at }] of [...timers]) if (at <= t) { timers.delete(k); f(); }
      await tick();
    },
    get pending() { return timers.size; },
  };
}

test('claude wait: polls every 3 s, reports a change, stops when ready', async () => {
  const c = fakeClock();
  const answers = ['missing', 'signed-out', 'ready'];
  const log = [];
  const w = createClaudeWait({ ...c, check: async () => ({ state: answers.shift() }), onReady: () => log.push('ready'), onChange: (s) => log.push(s.state) });
  w.start({ state: 'missing' });
  assert.ok(w.waiting);
  await c.advance(POLL_MS - 1);
  assert.deepEqual(log, []);
  await c.advance(1); // missing: no change
  assert.deepEqual(log, []);
  await c.advance(POLL_MS);
  assert.deepEqual(log, ['signed-out']);
  await c.advance(POLL_MS);
  assert.deepEqual(log, ['signed-out', 'ready']);
  assert.ok(!w.waiting);
  assert.equal(c.pending, 0);
});

test('claude wait: poke checks at once; it gives up after 15 minutes', async () => {
  const c = fakeClock();
  let checks = 0;
  let gaveUp = 0;
  const w = createClaudeWait({ ...c, check: async () => { checks++; return { state: 'signed-out' }; }, onReady: () => {}, onGiveUp: () => gaveUp++ });
  w.poke(); // not waiting: nothing
  assert.equal(checks, 0);
  w.start({ state: 'signed-out' });
  w.poke();
  await tick();
  assert.equal(checks, 1);
  await c.advance(GIVE_UP_MS);
  assert.equal(gaveUp, 1);
  assert.ok(!w.waiting);
});

function setupRig({ statuses = ['signed-out', 'ready'], failSetup = false } = {}) {
  const c = fakeClock();
  const log = { banners: [], hidden: 0, focused: 0, ready: 0, gaveUp: 0, calls: [] };
  const s = createClaudeSetup({
    ...c,
    invoke: async (cmd) => {
      log.calls.push(cmd);
      if (cmd === 'claude_setup') { if (failSetup) throw "Terminal couldn't open."; return null; }
      return { state: statuses.shift() ?? 'ready' };
    },
    banner: (text, action) => log.banners.push({ text, label: action?.label, run: action?.run }),
    hideBanner: () => log.hidden++,
    focusAction: () => log.focused++,
    onReady: () => log.ready++,
    onGiveUp: () => log.gaveUp++,
  });
  return { s, c, log };
}

test('claude setup: the load-time offer waits only once Terminal opens, and does not start Magic', async () => {
  const { s, c, log } = setupRig({ statuses: ['signed-out', 'ready'] });
  s.offer({ state: 'signed-out' });
  assert.equal(log.banners.at(-1).label, 'Sign in');
  assert.equal(log.focused, 0);
  assert.ok(!s.waiting);
  await log.banners.at(-1).run();
  assert.deepEqual(log.calls, ['claude_setup']);
  assert.equal(log.banners.at(-1).text, 'Sign in in your browser.');
  assert.ok(s.waiting);
  await c.advance(POLL_MS);
  await c.advance(POLL_MS);
  assert.equal(log.hidden, 1);
  assert.equal(log.ready, 0);
  assert.ok(!s.waiting);
});

test('claude setup: from Magic, missing → installed → ready starts Magic', async () => {
  const { s, c, log } = setupRig({ statuses: ['missing', 'signed-out', 'ready'] });
  s.offer({ state: 'missing' }, { forMagic: true });
  assert.equal(log.banners.at(-1).label, 'Install Claude');
  assert.equal(log.focused, 1);
  assert.ok(s.waiting);
  await s.open();
  assert.equal(log.banners.at(-1).text, 'Installing Claude in Terminal…');
  await c.advance(POLL_MS); // still missing
  await c.advance(POLL_MS);
  assert.equal(log.banners.at(-1).text, 'Claude is installed. Sign in in your browser.');
  await c.advance(POLL_MS);
  assert.equal(log.ready, 1);
  assert.equal(log.hidden, 1);
});

test('claude setup: Terminal failing says why and keeps the button', async () => {
  const { s, log } = setupRig({ failSetup: true });
  s.offer({ state: 'missing' });
  await s.open();
  assert.deepEqual([log.banners.at(-1).text, log.banners.at(-1).label], ["Terminal couldn't open.", 'Install Claude']);
  assert.ok(!s.waiting);
});

test('claude setup: stop goes back to the first banner; giving up from Magic calls onGiveUp', async () => {
  const { s, c, log } = setupRig({ statuses: Array(1000).fill('signed-out') });
  s.offer({ state: 'signed-out' }, { forMagic: true });
  s.stop();
  assert.ok(!s.waiting);
  assert.equal(log.banners.at(-1).label, 'Sign in');
  s.offer({ state: 'signed-out' }, { forMagic: true });
  await c.advance(GIVE_UP_MS);
  assert.equal(log.gaveUp, 1);
});

// ---------- Magic waits for Claude ----------

test('magic: not ready → waits for Claude with setup; ready starts it; Stop waiting cancels', async () => {
  const log = { states: [], offers: [], stops: 0, runs: 0 };
  let claudeState = 'signed-out';
  const runner = { async run() { log.runs++; return { summary: '', cuts: [] }; }, cancel() {} };
  const m = createMagic({
    runner,
    claude: async () => ({ state: claudeState }),
    project: () => ({ parts: [{ id: 1, name: 'a', transcript: { seconds: 1, words: [] } }], transcribing: false }),
    paint: (s) => log.states.push(s.kind),
    flash: () => {},
    banner: () => {},
    onResult: () => 0,
    setup: { offer: (s, o) => log.offers.push([s.state, o.forMagic]), stop: () => log.stops++ },
    store: { getItem: () => '1', setItem: () => {} },
  });
  m.update();
  await m.press();
  assert.equal(m.state.kind, 'waiting-claude');
  assert.deepEqual(log.offers, [['signed-out', true]]);
  await m.press(); // pressing again = Stop waiting
  assert.equal(m.state.kind, 'ready');
  assert.equal(log.stops, 1);

  await m.press();
  claudeState = 'ready';
  await m.claudeReady();
  assert.equal(log.runs, 1);
  assert.equal(m.state.kind, 'ready');
  await m.claudeReady(); // not waiting: nothing
  assert.equal(log.runs, 1);
});
