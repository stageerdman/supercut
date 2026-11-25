// The user's Cloudflare R2, through wrangler (fetched by npx when used, so npm ci stays small).
// Credentials come from .env: CLOUDFLARE_API_TOKEN (R2 edit rights) and CLOUDFLARE_ACCOUNT_ID.
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const BUCKET = 'magic-cut-updates';
const NEEDED = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

function loadEnv() {
  const file = path.join(root, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function assertCredentials() {
  const missing = NEEDED.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing in .env: ${missing.join(', ')} (a Cloudflare API token with R2 edit rights, and the account id)`);
}

function wrangler(args, { quiet = false } = {}) {
  try {
    return execFileSync('npx', ['--yes', 'wrangler@4', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'],
    });
  } catch (err) {
    throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed: ${(err.stderr || err.stdout || err.message).trim()}`);
  }
}

function put({ key, file, type, cache }) {
  wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', type, '--cache-control', cache, '--remote']);
}

function createBucket() {
  try {
    wrangler(['r2', 'bucket', 'create', BUCKET], { quiet: true });
  } catch (err) {
    if (!/already exists/i.test(err.message)) throw err;
  }
}

/** Turns on the bucket's public r2.dev URL and returns it. */
function publicUrl() {
  wrangler(['r2', 'bucket', 'dev-url', 'enable', BUCKET, '--force']);
  const said = wrangler(['r2', 'bucket', 'dev-url', 'get', BUCKET]);
  const url = said.match(/https:\/\/[\w.-]+\.r2\.dev/);
  if (!url) throw new Error(`no r2.dev URL in wrangler's answer: ${said.trim()}`);
  return url[0];
}

module.exports = { BUCKET, loadEnv, assertCredentials, put, createBucket, publicUrl };
