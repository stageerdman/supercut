// The user's Cloudflare: one Worker with static assets (worker/worker.js) on its own hostname serves every release.
// Not R2: R2 is not enabled on the account. Deploys go through wrangler (fetched by npx when used, so npm ci stays
// small). Credentials come from the environment or .env: CLOUDFLARE_API_TOKEN (Workers edit, and DNS on the zone for
// the custom domain) and CLOUDFLARE_ACCOUNT_ID.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site');

const root = path.join(__dirname, '..', '..');
const WORKER = 'magic-cut-updates';
const HOST = 'magiccut.erdman.xyz';
const SITE_URL = `https://${HOST}`;
const NEEDED = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

function loadEnv() {
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

function assertCredentials() {
  const missing = NEEDED.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing: ${missing.join(', ')} (a Cloudflare API token with Workers edit rights, and the account id)`);
}

function wrangler(args) {
  try {
    return execFileSync('npx', ['--yes', 'wrangler@4', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`wrangler ${args[0]} failed: ${(err.stderr || err.stdout || err.message).trim()}`);
  }
}

/** Writes `uploads` into `dir` as the Worker's parts + index + config; returns the config path. */
function stageSite(uploads, siteDir) {
  const dir = path.resolve(siteDir);
  const { parts, index } = site.layout(uploads, (file) => fs.statSync(file).size);
  const assets = path.join(dir, 'public');
  fs.rmSync(dir, { recursive: true, force: true });
  for (const p of parts) {
    const out = path.join(assets, p.asset);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, readRange(p.file, p.start, p.end));
  }
  fs.writeFileSync(path.join(assets, site.INDEX), JSON.stringify(index));
  const config = {
    name: WORKER,
    main: path.join(__dirname, 'worker', 'worker.js'),
    compatibility_date: '2025-11-01',
    account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
    workers_dev: false,
    routes: [{ pattern: HOST, custom_domain: true }],
    assets: { directory: assets, binding: 'ASSETS', run_worker_first: true },
  };
  const file = path.join(dir, 'wrangler.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

function readRange(file, start, end) {
  const buf = Buffer.alloc(end - start);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buf;
}

/** Publishes the whole site in one deploy: every file switches to the new release together. */
function deploy(uploads, dir) {
  const said = wrangler(['deploy', '--config', stageSite(uploads, dir)]);
  return said.trim().split('\n').at(-1);
}

module.exports = { SITE_URL, loadEnv, assertCredentials, deploy };
