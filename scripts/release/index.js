// npm run release -- [1.2.3] [--notes "what's new"] [--local http://localhost:3277]
//   Sets the version (when given), builds the app, its DMG and its signed update, stages them in dist/bucket/
//   (plan.js) and deploys them as the update site (cloudflare.js) in one go. Every installed app then finds it.
//   --local: stage only, for a manifest served from that URL instead (the build accepts plain http: testing only).
// npm run dmg
//   Only the DMG and its first-open note, in dist/: no updater key, no Cloudflare needed.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { root, productName, bundleDir, appPath } = require('../bundle');
const { frontendId, appBuildId } = require('../build-id');
const conf = require('./conf');
const plan = require('./plan');
const cloudflare = require('./cloudflare');
const { verifyDmg } = require('./verify');
const { useSigningKey } = require('./signing-key');

const DIST = path.join(root, 'dist');
const FIRST_OPEN = path.join(__dirname, 'FIRST-OPEN.txt');
const FILES = {
  tauri: path.join(root, 'src-tauri', 'tauri.conf.json'),
  cargo: path.join(root, 'src-tauri', 'Cargo.toml'),
  npm: path.join(root, 'package.json'),
};

const log = (msg) => console.log(`[release] ${msg}`);
const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
const readTauri = () => JSON.parse(fs.readFileSync(FILES.tauri, 'utf8'));
const edit = (file, change) => fs.writeFileSync(file, change(fs.readFileSync(file, 'utf8')));

function parseArgs(argv) {
  const opts = { dmgOnly: false, version: null, notes: '', local: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dmg-only') opts.dmgOnly = true;
    else if (a === '--notes') opts.notes = argv[++i] ?? '';
    else if (a === '--local') opts.local = argv[++i];
    else if (!a.startsWith('--') && !opts.version) opts.version = conf.assertVersion(a);
    else throw new Error(`unknown argument "${a}"`);
  }
  return opts;
}

function setVersion(next) {
  const current = readTauri().version;
  if (conf.compare(next, current) < 0) throw new Error(`${next} is older than the current ${current}`);
  edit(FILES.tauri, (t) => conf.setJsonVersion(t, next));
  edit(FILES.npm, (t) => conf.setJsonVersion(t, next));
  edit(FILES.cargo, (t) => conf.setCargoVersion(t, next));
  log(`version ${current} → ${next}`);
}

/** The manifest URL the app is built to check: the configured one, or the local test server's. */
function endpointFor(opts) {
  return opts.local ? `${opts.local.replace(/\/+$/, '')}/latest.json` : readTauri().plugins.updater.endpoints[0];
}

/** Builds the app and its DMG (with `overrides` over tauri.conf.json), checks both, returns the version built. */
function build(overrides) {
  run('npm', ['run', 'prepare-bins']);
  // CI=true: the DMG is laid out without driving Finder through AppleScript, which needs a logged-in GUI session.
  run('npx', ['tauri', 'build', '--bundles', 'app,dmg', '--config', JSON.stringify(overrides)], { CI: 'true' });
  // Every checkout builds into the shared target: prove this one's frontend is what got bundled.
  const id = appBuildId(appPath());
  const expected = frontendId(path.join(root, 'src'));
  if (id !== expected) throw new Error(`built app embeds frontend ${id}, this checkout is ${expected}; run again`);
  const { version } = readTauri();
  verifyDmg(builtDmg(version), expected);
  log(`checked ${path.basename(builtDmg(version))}: whole, signed, this checkout's build`);
  return version;
}

const builtDmg = (version) => path.join(bundleDir(), 'dmg', `${productName}_${version}_aarch64.dmg`);
const builtUpdate = () => path.join(bundleDir(), 'macos', `${productName}.app.tar.gz`);

function dmgOnly() {
  const version = build({});
  fs.mkdirSync(DIST, { recursive: true });
  const dmg = path.join(DIST, `MagicCut_${version}.dmg`);
  fs.copyFileSync(builtDmg(version), dmg);
  fs.copyFileSync(FIRST_OPEN, path.join(DIST, 'FIRST-OPEN.txt'));
  log(`${dmg} (open it the first time as dist/FIRST-OPEN.txt says)`);
}

function release(opts) {
  cloudflare.loadEnv();
  log(`signing key: ${useSigningKey(root)}`);
  const endpoint = endpointFor(opts);
  const baseUrl = plan.baseUrlOf(endpoint);
  if (!opts.local) cloudflare.assertCredentials();
  if (opts.version) setVersion(opts.version);

  const updater = { endpoints: [endpoint], ...(opts.local && { dangerousInsecureTransportProtocol: true }) };
  const version = build({ bundle: { createUpdaterArtifacts: true }, plugins: { updater } });

  const uploads = stage(version, opts.notes, baseUrl);
  if (opts.local) return log(`staged ${version} in dist/bucket; serve it at ${opts.local}`);
  log(`deploy ${uploads.map((u) => u.key).join(', ')}`);
  log(cloudflare.deploy(uploads, path.join(DIST, 'site')));
  log(`released ${version}: ${baseUrl}/MagicCut.dmg`);
}

/** Copies the build into dist/bucket/ as it will sit in the bucket; returns the uploads, from the staged copies. */
function stage(version, notes, baseUrl) {
  const work = path.join(DIST, 'work');
  fs.rmSync(path.join(DIST, 'bucket'), { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const signature = fs.readFileSync(`${builtUpdate()}.sig`, 'utf8');
  const manifest = plan.manifest({ version, notes, pubDate: new Date().toISOString(), baseUrl, signature });
  const files = { update: builtUpdate(), dmg: builtDmg(version), firstOpen: FIRST_OPEN, manifest: path.join(work, 'latest.json') };
  fs.writeFileSync(files.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return plan.uploads({ version, files }).map((u) => {
    const staged = path.join(DIST, 'bucket', u.key);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.copyFileSync(u.file, staged);
    return { ...u, file: staged };
  });
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.dmgOnly) dmgOnly();
  else release(opts);
} catch (err) {
  console.error(`[release] failed: ${err.message}`);
  process.exit(1);
}
