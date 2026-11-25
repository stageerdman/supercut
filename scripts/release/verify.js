// Proves a DMG is what a user should get: mounted read-only, it holds Magic Cut.app (whole, ad-hoc signed, carrying
// the expected frontend) and the Applications link to drag it onto.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { productName } = require('../bundle');
const { appBuildId } = require('../build-id');

const quiet = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

function verifyDmg(dmg, expectedId) {
  const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-cut-dmg-'));
  quiet('hdiutil', ['attach', dmg, '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount]);
  try {
    const app = path.join(mount, `${productName}.app`);
    if (!fs.existsSync(app)) throw new Error(`${dmg} has no ${productName}.app`);
    if (fs.readlinkSync(path.join(mount, 'Applications')) !== '/Applications') throw new Error(`${dmg} has no Applications link`);
    try {
      quiet('codesign', ['--verify', '--deep', '--strict', app]);
    } catch (err) {
      throw new Error(`${productName}.app in ${dmg} fails codesign --verify: ${err.stderr.trim()}`);
    }
    const id = appBuildId(app);
    if (id !== expectedId) throw new Error(`${dmg} carries frontend ${id}, expected ${expectedId}`);
  } finally {
    quiet('hdiutil', ['detach', mount, '-force']);
    fs.rmSync(mount, { recursive: true, force: true });
  }
}

module.exports = { verifyDmg };
