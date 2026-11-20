// Find the user's own `claude` CLI and check that it is signed in.
// GUI apps don't get the shell PATH, so look in the usual install places.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CANDIDATES = [
  path.join(os.homedir(), '.local/bin/claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
];

function findClaude({ candidates = CANDIDATES, isFile = (p) => fs.existsSync(p) } = {}) {
  return candidates.find(isFile) ?? null;
}

// The child must never bill an API key instead of the subscription.
function childEnv(env = process.env) {
  const { ANTHROPIC_API_KEY, ...rest } = env;
  return rest;
}

// -> { state: 'missing' | 'signed-out' | 'ready', message }
function claudeStatus(bin = findClaude()) {
  if (!bin) return Promise.resolve({ state: 'missing', message: 'Install Claude Code to use Magic.' });
  return new Promise((resolve) => {
    execFile(bin, ['auth', 'status'], { env: childEnv(), timeout: 15000 }, (err, stdout) => {
      let info = {};
      try { info = JSON.parse(stdout); } catch {}
      if (err || info.loggedIn === false) {
        resolve({ state: 'signed-out', message: 'Open Terminal and run `claude`, then sign in.' });
      } else {
        resolve({ state: 'ready', message: 'Claude is ready.', bin });
      }
    });
  });
}

module.exports = { findClaude, childEnv, claudeStatus, CANDIDATES };
