// The frontend id: a hash of every file under src/, the files the app embeds at compile time.
// src-tauri/build.rs stamps the same hash into the binary (`supercut --build-id`), so a
// match proves a built or installed app carries this checkout's frontend.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function listFiles(root, dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(root, full) : [path.relative(root, full).split(path.sep).join('/')];
  });
}

// Plain byte order, like Rust's String sort in build.rs.
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** FNV-1a 64 over `path \0 bytes \0` for each file, sorted by relative path. */
function frontendId(dir) {
  const MASK = (1n << 64n) - 1n;
  let hash = 0xcbf29ce484222325n;
  for (const rel of listFiles(dir).sort(byBytes)) {
    for (const chunk of [Buffer.from(rel), [0], fs.readFileSync(path.join(dir, rel)), [0]]) {
      for (const b of chunk) hash = ((hash ^ BigInt(b)) * 0x100000001b3n) & MASK;
    }
  }
  return hash.toString(16).padStart(16, '0');
}

/** The id stamped into an app bundle's binary. */
function appBuildId(app) {
  const bin = path.join(app, 'Contents', 'MacOS', 'supercut');
  return execFileSync(bin, ['--build-id'], { encoding: 'utf8' }).trim();
}

module.exports = { frontendId, appBuildId };
