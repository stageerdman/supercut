// The frontend id is how install-app proves the installed app embeds this checkout's src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { frontendId } = createRequire(import.meta.url)('../scripts/build-id.js');

function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-id-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

test('frontend id is FNV-1a 64 of path\\0bytes\\0 (matches build.rs)', () => {
  // Empty tree: the FNV offset basis.
  assert.equal(frontendId(tree({})), 'cbf29ce484222325');
});

test('frontend id changes with any file content, path or new file', () => {
  const base = frontendId(tree({ 'a.js': '1', 'ui/b.js': '2' }));
  assert.equal(frontendId(tree({ 'ui/b.js': '2', 'a.js': '1' })), base);
  assert.notEqual(frontendId(tree({ 'a.js': '1', 'ui/b.js': '3' })), base);
  assert.notEqual(frontendId(tree({ 'a.js': '1', 'ui/c.js': '2' })), base);
  assert.notEqual(frontendId(tree({ 'a.js': '1', 'ui/b.js': '2', 'ui/new.js': '' })), base);
});
