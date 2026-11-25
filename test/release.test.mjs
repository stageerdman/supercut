// The release scripts' pure parts: config edits, the manifest the app reads, and what goes in the bucket in which order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const conf = require('../scripts/release/conf.js');
const plan = require('../scripts/release/plan.js');
const site = require('../scripts/release/site.js');

test('the version is set in place in each config file, nothing else changes', () => {
  const tauri = '{\n  "productName": "Magic Cut",\n  "version": "0.1.0",\n  "plugins": { "x": { "version": "9.9.9" } }\n}';
  assert.equal(conf.setJsonVersion(tauri, '0.2.0'), tauri.replace('"0.1.0"', '"0.2.0"'));
  const cargo = '[package]\nname = "supercut"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n';
  assert.equal(conf.setCargoVersion(cargo, '0.2.0'), cargo.replace('"0.1.0"', '"0.2.0"'));
});

test('a version that is not x.y.z is refused', () => {
  assert.throws(() => conf.setJsonVersion('"version": "0.1.0"', 'v0.2'), /1\.2\.3/);
  assert.throws(() => conf.setCargoVersion('name = "x"', '0.2.0'), /no version line/);
});

test('versions compare by number, not by text', () => {
  assert.ok(conf.compare('0.10.0', '0.9.9') > 0);
  assert.ok(conf.compare('0.1.0', '0.1.1') < 0);
  assert.equal(conf.compare('1.2.3', '1.2.3'), 0);
});

test('the endpoint replaces the empty list, and must be an https latest.json', () => {
  const text = '"updater": {\n  "pubkey": "k",\n  "endpoints": []\n}';
  const url = 'https://pub-abc.r2.dev/latest.json';
  assert.equal(conf.setEndpoint(text, url), `"updater": {\n  "pubkey": "k",\n  "endpoints": ["${url}"]\n}`);
  assert.throws(() => conf.setEndpoint(text, 'http://pub-abc.r2.dev/latest.json'), /https/);
});

test('the manifest points the app at the versioned, signed update', () => {
  const m = plan.manifest({ version: '0.1.1', notes: 'Faster', pubDate: '2026-11-25T00:00:00.000Z', baseUrl: 'https://b.r2.dev/', signature: 'SIG\n' });
  assert.deepEqual(m, {
    version: '0.1.1',
    notes: 'Faster',
    pub_date: '2026-11-25T00:00:00.000Z',
    platforms: { 'darwin-aarch64': { signature: 'SIG', url: 'https://b.r2.dev/0.1.1/MagicCut.app.tar.gz' } },
  });
});

test('the manifest comes last and is never cached; the versioned update is', () => {
  const files = { update: 'u', dmg: 'd', firstOpen: 'f', manifest: 'm' };
  const ups = plan.uploads({ version: '0.1.1', files });
  assert.deepEqual(ups.map((u) => u.key), ['0.1.1/MagicCut.app.tar.gz', 'MagicCut.dmg', 'FIRST-OPEN.txt', 'latest.json']);
  const latest = ups.at(-1);
  assert.equal(latest.file, 'm');
  assert.equal(latest.cache, 'no-cache');
  assert.match(ups[0].cache, /immutable/);
  assert.equal(ups.find((u) => u.key === 'MagicCut.dmg').cache, 'no-cache');
});

test('a file over the part size is cut into parts that cover every byte once, in order', () => {
  const ups = [
    { key: '0.1.1/MagicCut.app.tar.gz', file: 'u', type: 'application/gzip', cache: 'c' },
    { key: 'MagicCut.dmg', file: 'd', type: 'application/x-apple-diskimage', cache: 'n' },
    { key: 'empty.txt', file: 'e', type: 'text/plain', cache: 'n' },
  ];
  const { parts, index } = site.layout(ups, (f) => ({ u: 25, d: 10, e: 0 })[f], 10);
  assert.deepEqual(parts.filter((p) => p.file === 'u').map((p) => [p.start, p.end]), [[0, 10], [10, 20], [20, 25]]);
  assert.deepEqual(index['/0.1.1/MagicCut.app.tar.gz'], {
    type: 'application/gzip',
    cache: 'c',
    size: 25,
    parts: ['/_p/0.1.1/MagicCut.app.tar.gz.0', '/_p/0.1.1/MagicCut.app.tar.gz.1', '/_p/0.1.1/MagicCut.app.tar.gz.2'],
  });
  assert.equal(index['/MagicCut.dmg'].parts.length, 1, 'exactly one part size is one part');
  assert.equal(index['/MagicCut.dmg'].download, 'MagicCut.dmg', 'the DMG downloads as a file');
  assert.deepEqual(parts.find((p) => p.file === 'e'), { asset: '_p/empty.txt.0', file: 'e', start: 0, end: 0 });
});

test('every part fits under the 25 MiB Workers asset limit', () => {
  assert.ok(site.PART_SIZE <= 25 * 1024 * 1024);
});

test('the site URL comes from the endpoint, which must be set', () => {
  assert.equal(plan.baseUrlOf('https://b.r2.dev/latest.json'), 'https://b.r2.dev');
  assert.throws(() => plan.baseUrlOf(undefined), /updates:setup/);
});
