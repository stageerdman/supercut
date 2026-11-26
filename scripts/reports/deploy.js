// Deploys the debug-report Worker (worker.mjs) on magiccut.erdman.xyz/api/*, next to the release site, with its
// KV namespace (made on first deploy). `npm run reports:deploy`. Credentials as in scripts/release/cloudflare.js.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cf = require('../release/cloudflare');

const WORKER = 'magic-cut-reports';
const NAMESPACE = 'magic-cut-reports';

function namespaceId() {
  const find = () => JSON.parse(cf.wrangler(['kv', 'namespace', 'list'])).find((n) => n.title === NAMESPACE)?.id;
  const found = find();
  if (found) return found;
  cf.wrangler(['kv', 'namespace', 'create', NAMESPACE]);
  const made = find();
  if (!made) throw new Error(`KV namespace ${NAMESPACE} was created but isn't listed`);
  return made;
}

function config(kvId) {
  return {
    name: WORKER,
    main: path.join(__dirname, 'worker.mjs'),
    compatibility_date: '2025-11-01',
    account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
    workers_dev: false,
    routes: [{ pattern: `${cf.HOST}/api/*`, zone_name: cf.HOST.split('.').slice(-2).join('.') }],
    kv_namespaces: [{ binding: 'REPORTS', id: kvId }],
  };
}

function main() {
  cf.loadEnv();
  cf.assertCredentials();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-cut-reports-'));
  const file = path.join(dir, 'wrangler.json');
  fs.writeFileSync(file, JSON.stringify(config(namespaceId()), null, 2));
  console.log(cf.wrangler(['deploy', '--config', file]).trim().split('\n').at(-1));
}

try {
  main();
} catch (err) {
  console.error(`[reports] deploy failed: ${err.message}`);
  process.exit(1);
}
