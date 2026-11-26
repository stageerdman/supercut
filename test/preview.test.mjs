// preview.js: the rendered preview kept in step with the cuts; only the answer for the edit you have now is used.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../src/ui/preview.js';

const settle = () => new Promise((r) => setImmediate(r));

function rig() {
  const asks = [];
  const state = { cuts: [], now: 0 };
  const preview = createPreview({
    invoke: (cmd, args) => new Promise((resolve, reject) => asks.push({ cmd, args, resolve, reject })),
    parts: () => [{ id: 1, duration: 10 }],
    cuts: () => state.cuts,
    size: () => ({ width: 1920, height: 1080 }),
    log() {},
    now: () => state.now,
  });
  return { preview, asks, state };
}

test('preview: an edit waits a moment, then one render of the kept spans; ready, it is current', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { preview, asks, state } = rig();
  state.cuts = [{ part: 1, s: 2.00004, e: 3, by: 'you' }];
  preview.changed();
  preview.changed(); // a drag edits many times
  mock.timers.tick(399);
  assert.equal(asks.length, 0);
  mock.timers.tick(1);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].cmd, 'preview');
  assert.deepEqual(asks[0].args, { spans: [{ part: 1, s: 0, e: 2 }, { part: 1, s: 3, e: 10 }], width: 1920, height: 1080 });
  assert.equal(preview.current(), null, 'still being made');
  asks[0].resolve({ file: '/p.mp4', map: [] });
  await settle();
  assert.equal(preview.current().file, '/p.mp4');
  assert.equal(preview.current(), preview.current(), 'the same object while the edit stays');
  mock.timers.reset();
});

test('preview: an answer for an older edit is never used', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { preview, asks, state } = rig();
  preview.changed();
  mock.timers.tick(400);
  state.cuts = [{ part: 1, s: 5, e: 6, by: 'you' }];
  assert.equal(preview.current(), null, 'the edit moved on: a new render is asked for');
  assert.equal(asks.length, 2);
  asks[0].resolve({ file: '/old.mp4', map: [] });
  asks[1].resolve({ file: '/new.mp4', map: [] });
  await settle();
  assert.equal(preview.current().file, '/new.mp4');
  mock.timers.reset();
});

test('preview: a render that keeps failing is retried after 2, 4, 8 s, then never again', async () => {
  const { preview, asks, state } = rig();
  preview.current();
  for (const wait of [2000, 4000, 8000]) {
    asks.at(-1).reject(new Error('ffmpeg failed'));
    await settle();
    const tries = asks.length;
    state.now += wait - 1;
    preview.current();
    assert.equal(asks.length, tries, `no retry before ${wait} ms`);
    state.now += 1;
    preview.current();
    assert.equal(asks.length, tries + 1, `retried after ${wait} ms`);
  }
  asks.at(-1).reject(new Error('ffmpeg failed'));
  await settle();
  state.now += 3_600_000;
  for (let i = 0; i < 100; i++) preview.current();
  assert.equal(asks.length, 4, 'one try and three retries, no more');
});

test('preview: a new edit is tried at once, even after the old one gave up', async () => {
  const { preview, asks, state } = rig();
  preview.current();
  for (let i = 0; i < 4; i++) {
    asks.at(-1).reject(new Error('ffmpeg failed'));
    await settle();
    state.now += 60_000;
    preview.current();
  }
  assert.equal(asks.length, 4);
  state.cuts = [{ part: 1, s: 5, e: 6, by: 'you' }];
  preview.current();
  assert.equal(asks.length, 5);
  asks[4].resolve({ file: '/new.mp4', map: [] });
  await settle();
  assert.equal(preview.current().file, '/new.mp4');
});
