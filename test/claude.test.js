const test = require('node:test');
const assert = require('node:assert');
const { findClaude, childEnv, claudeStatus } = require('../src/engine/claude');

test('finds the first installed claude binary', () => {
  const bin = findClaude({ candidates: ['/a/claude', '/b/claude'], isFile: (p) => p === '/b/claude' });
  assert.strictEqual(bin, '/b/claude');
});

test('no claude installed -> missing', async () => {
  assert.strictEqual(findClaude({ isFile: () => false }), null);
  assert.strictEqual((await claudeStatus(null)).state, 'missing');
});

test('child env drops ANTHROPIC_API_KEY so the subscription is used', () => {
  const env = childEnv({ ANTHROPIC_API_KEY: 'x', HOME: '/h' });
  assert.deepStrictEqual(env, { HOME: '/h' });
});

test('a binary that fails auth status -> signed-out', async () => {
  // /usr/bin/false exits 1, like `claude auth status` when not logged in.
  assert.strictEqual((await claudeStatus('/usr/bin/false')).state, 'signed-out');
});
