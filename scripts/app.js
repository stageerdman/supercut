// npm run app (the studio's Start): bring dependencies up to date, then install-app, so Start
// opens the same /Applications copy Spotlight and the Dock open, proven to embed this checkout.
// Why: a fresh checkout has no node_modules, and the build dies before it starts; and opening
// the build output left the installed app stale. Arguments pass through to install.js.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { depsStale } = require('./deps');

const root = path.join(__dirname, '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

try {
  if (depsStale(root)) {
    console.log('[app] node_modules missing or older than package-lock.json: npm ci');
    run('npm', ['ci']);
  }
  run('node', [path.join(__dirname, 'install.js'), ...process.argv.slice(2)]);
} catch (err) {
  console.error(`[app] failed: ${err.message}`);
  process.exit(1);
}
