// preview.js: the rendered preview kept in step with the cuts; only the answer for the edit you have now is used.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../src/ui/preview.js';

const settle = () => new Promise((r) => setImmediate(r));

function rig() {
  const asks = [];
  const state = { cuts: [] };
  const preview = createPreview({
    invoke: (cmd, args) => new Promise((resolve, reject) => asks.push({ cmd, args, resolve, reject })),
    parts: () => [{ id: 1, duration: 10 }],
    cuts: () => state.cuts,
    size: () => ({ width: 1920, height: 1080 }),
    log() {},
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
