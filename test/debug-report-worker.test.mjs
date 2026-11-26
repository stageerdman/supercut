import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { handle, PATH, GAP_MS } from '../scripts/reports/worker.mjs';

const INSTALL = 'a'.repeat(32);
const URL_ = `https://magiccut.erdman.xyz${PATH}`;

function fakeKv() {
  const items = new Map();
  return { items, get: async (k) => items.get(k)?.value ?? null, put: async (k, value, opts) => items.set(k, { value, opts }) };
}

const post = (body) => new Request(URL_, { method: 'POST', body });
const report = (extra = {}) => JSON.stringify({ install: INSTALL, app: '0.1.3', macos: '15.1', claude: 'ready', log: 'x', ...extra });
let n = 0;
const ids = () => `id${++n}`;

test('a gzipped report is kept under its Mac and answered with its id', async () => {
  const env = { REPORTS: fakeKv() };
  const res = await handle(post(gzipSync(report())), env, 1000, ids);
  const { id } = await res.json();
  assert.equal(res.status, 200);
  const stored = env.REPORTS.items.get(`reports/${INSTALL}/1000-${id}`);
  assert.equal(JSON.parse(gunzipSync(stored.value)).log, 'x');
  assert.deepEqual(stored.opts.metadata, { at: 1000, app: '0.1.3', macos: '15.1', claude: 'ready' });
});

test('a body the edge already unzipped is stored gzipped all the same', async () => {
  const env = { REPORTS: fakeKv() };
  const { id } = await (await handle(post(report()), env, 5, ids)).json();
  assert.equal(JSON.parse(gunzipSync(env.REPORTS.items.get(`reports/${INSTALL}/5-${id}`).value)).app, '0.1.3');
});

test('a second report from the same Mac within 30 s is refused', async () => {
  const env = { REPORTS: fakeKv() };
  await handle(post(gzipSync(report())), env, 0, ids);
  assert.equal((await handle(post(gzipSync(report())), env, GAP_MS - 1, ids)).status, 429);
  assert.equal((await handle(post(gzipSync(report())), env, GAP_MS, ids)).status, 200);
});

test('an odd install id is filed as unknown, never used as a key path', async () => {
  const env = { REPORTS: fakeKv() };
  const { id } = await (await handle(post(gzipSync(report({ install: '../x' }))), env, 7, ids)).json();
  assert.ok(env.REPORTS.items.has(`reports/unknown/7-${id}`));
});

test('anything but a report POST is turned away', async () => {
  const env = { REPORTS: fakeKv() };
  assert.equal((await handle(new Request(URL_), env)).status, 405);
  assert.equal((await handle(new Request('https://magiccut.erdman.xyz/api/other', { method: 'POST' }), env)).status, 404);
  assert.equal((await handle(post('not json'), env)).status, 400);
  assert.equal(env.REPORTS.items.size, 0);
});
