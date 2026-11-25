// npm run updates:setup: once. Writes the update site's <url>/latest.json into tauri.conf.json, the address every
// build from then on checks for updates (the site itself goes up with the first npm run release).
// Commit the changed tauri.conf.json: a build without it never looks for updates.
const fs = require('node:fs');
const path = require('node:path');
const cloudflare = require('./cloudflare');
const { setEndpoint } = require('./conf');

const TAURI = path.join(__dirname, '..', '..', 'src-tauri', 'tauri.conf.json');

try {
  cloudflare.loadEnv();
  cloudflare.assertCredentials();
  const endpoint = `${cloudflare.SITE_URL}/latest.json`;
  fs.writeFileSync(TAURI, setEndpoint(fs.readFileSync(TAURI, 'utf8'), endpoint));
  console.log(`[updates:setup] the app checks ${endpoint}`);
} catch (err) {
  console.error(`[updates:setup] failed: ${err.message}`);
  process.exit(1);
}
