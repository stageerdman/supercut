// The updater's private signing key. Lose it and no installed app can update again, so it lives in the main
// checkout's .secrets/updater.key (gitignored), which outlives the short-lived worktrees releases may run from.
// TAURI_SIGNING_PRIVATE_KEY in the environment or .env wins when set.
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const KEY = path.join('.secrets', 'updater.key');

/** The main checkout of the repo `root` belongs to (itself, unless `root` is a git worktree). */
function mainCheckout(root) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  return path.dirname(common.trim());
}

/** Paths where the key is looked for, nearest first. */
const candidates = (root) => [...new Set([path.join(root, KEY), path.join(mainCheckout(root), KEY)])];

/** Sets TAURI_SIGNING_PRIVATE_KEY (a path is accepted by tauri build) unless already set; fails with where it looked. */
function useSigningKey(root, env = process.env) {
  if (env.TAURI_SIGNING_PRIVATE_KEY) return 'environment';
  const places = candidates(root);
  const found = places.find(existsSync);
  if (!found) throw new Error(`no updater signing key: set TAURI_SIGNING_PRIVATE_KEY or put it in ${places.join(' or ')}`);
  env.TAURI_SIGNING_PRIVATE_KEY = found;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
  return found;
}

module.exports = { useSigningKey };
