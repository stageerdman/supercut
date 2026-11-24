// Whether node_modules needs `npm ci`: npm writes node_modules/.package-lock.json on every
// install, so a missing one, or one older than package-lock.json, means the deps are not in.
const fs = require('node:fs');
const path = require('node:path');

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function depsStale(root) {
  const installed = mtime(path.join(root, 'node_modules', '.package-lock.json'));
  return installed === null || installed < mtime(path.join(root, 'package-lock.json'));
}

module.exports = { depsStale };
