// Where the built app lives and what it is called, read from the Tauri config and cargo,
// so a rename in tauri.conf.json is the only change the scripts need.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const conf = require(path.join(root, 'src-tauri', 'tauri.conf.json'));

// The bundle lands in the shared Cargo target (see CLAUDE.md), so ask cargo where that is.
function targetDir() {
  const meta = JSON.parse(execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', 'src-tauri/Cargo.toml'],
    { cwd: root, encoding: 'utf8' },
  ));
  return meta.target_directory;
}

const productName = conf.productName;
const bundleDir = () => path.join(targetDir(), 'release', 'bundle');
const appPath = () => path.join(bundleDir(), 'macos', `${productName}.app`);

module.exports = { root, productName, bundleDir, appPath };
