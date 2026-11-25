// Edits to the app's config files a release makes: the version (the same in tauri.conf.json, which the updater
// compares, Cargo.toml and package.json) and the update endpoint. Pure text in, text out, keeping the files'
// formatting, so each edit is tested without touching a file.

const SEMVER = /^\d+\.\d+\.\d+$/;

function assertVersion(v) {
  if (!SEMVER.test(v)) throw new Error(`version must look like 1.2.3, got "${v}"`);
  return v;
}

/** > 0 when a is newer than b. */
function compare(a, b) {
  const [x, y] = [a, b].map((v) => assertVersion(v).split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** The first `"version": "…"` of a JSON file (the top-level one in ours). */
const setJsonVersion = (text, v) =>
  replaceOnce(text, /^(\s*"version":\s*")[^"]*(")/m, `$1${assertVersion(v)}$2`, '"version" line');

/** The first `version = "…"` of Cargo.toml: the [package] one. */
const setCargoVersion = (text, v) =>
  replaceOnce(text, /^(version\s*=\s*")[^"]*(")/m, `$1${assertVersion(v)}$2`, 'version line');

/** tauri.conf.json's `plugins.updater.endpoints`, set to the one manifest URL. */
function setEndpoint(text, url) {
  if (!/^https:\/\/\S+\/latest\.json$/.test(url)) throw new Error(`endpoint must be an https …/latest.json URL, got "${url}"`);
  return replaceOnce(text, /("endpoints":\s*)\[[^\]]*\]/, `$1[${JSON.stringify(url)}]`, '"endpoints" list');
}

function replaceOnce(text, pattern, replacement, what) {
  if (!pattern.test(text)) throw new Error(`no ${what} to set`);
  return text.replace(pattern, replacement);
}

module.exports = { assertVersion, compare, setJsonVersion, setCargoVersion, setEndpoint };
