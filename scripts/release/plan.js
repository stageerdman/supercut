// What a release publishes, and the latest.json the app reads. Pure, so it is tested without a build.
//
// Layout (the update site, and dist/bucket/ for a --local test):
//   latest.json                      the manifest every installed app checks (never cached)
//   MagicCut.dmg, FIRST-OPEN.txt     the link to share: always the newest DMG, and how to open it the first time
//   <version>/MagicCut.app.tar.gz    the signed update the app downloads
// Each release replaces the whole site at once, so only the newest version is served.

const PLATFORM = 'darwin-aarch64';

const NO_CACHE = 'no-cache';
const FOREVER = 'public, max-age=31536000, immutable';

const keys = (version) => ({ update: `${version}/MagicCut.app.tar.gz` });

/** latest.json in the Tauri updater's static format. */
function manifest({ version, notes, pubDate, baseUrl, signature }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [PLATFORM]: { signature: signature.trim(), url: `${trimSlash(baseUrl)}/${keys(version).update}` },
    },
  };
}

/** The files, the manifest last (the order a file-by-file upload must keep: never a manifest before its bundle). */
function uploads({ version, files }) {
  return [
    { key: keys(version).update, file: files.update, type: 'application/gzip', cache: FOREVER },
    { key: 'MagicCut.dmg', file: files.dmg, type: 'application/x-apple-diskimage', cache: NO_CACHE },
    { key: 'FIRST-OPEN.txt', file: files.firstOpen, type: 'text/plain; charset=utf-8', cache: NO_CACHE },
    { key: 'latest.json', file: files.manifest, type: 'application/json', cache: NO_CACHE },
  ];
}

/** The site's base URL from the app's update endpoint (…/latest.json). */
function baseUrlOf(endpoint) {
  if (!endpoint || !endpoint.endsWith('/latest.json')) {
    throw new Error(`update endpoint must end in /latest.json, got "${endpoint ?? ''}" (run npm run updates:setup)`);
  }
  return endpoint.slice(0, -'/latest.json'.length);
}

const trimSlash = (url) => url.replace(/\/+$/, '');

module.exports = { PLATFORM, manifest, uploads, baseUrlOf };
