// Start runs npm ci only when node_modules is missing or behind package-lock.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { depsStale } = createRequire(import.meta.url)('../scripts/deps.js');

function checkout({ installedAt, lockAt }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-'));
  const lock = path.join(root, 'package-lock.json');
  fs.writeFileSync(lock, '{}');
  fs.utimesSync(lock, lockAt, lockAt);
  if (installedAt) {
    const marker = path.join(root, 'node_modules', '.package-lock.json');
    fs.mkdirSync(path.dirname(marker));
    fs.writeFileSync(marker, '{}');
    fs.utimesSync(marker, installedAt, installedAt);
  }
  return root;
}

test('no node_modules: stale', () => {
  assert.equal(depsStale(checkout({ lockAt: 1000 })), true);
});

test('installed before the lock changed: stale', () => {
  assert.equal(depsStale(checkout({ installedAt: 1000, lockAt: 2000 })), true);
});

test('installed after the lock: up to date', () => {
  assert.equal(depsStale(checkout({ installedAt: 2000, lockAt: 1000 })), false);
});
