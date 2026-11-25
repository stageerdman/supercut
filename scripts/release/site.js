// How a release's files become the Worker's static assets (worker/worker.js). Workers cap an asset at 25 MiB, so each
// file is cut into parts of at most PART_SIZE bytes, and an index maps every URL path to its parts, type, cache rule
// and size. Pure: sizes in, layout out, so the cutting is tested without a build.

const PART_SIZE = 20 * 1024 * 1024;
const INDEX = '_index.json';

/**
 * uploads: [{ key, file, type, cache }] (plan.uploads); sizeOf(file) → bytes.
 * Returns { parts: [{ asset, file, start, end }] (end exclusive), index: { '/key': { type, cache, size, parts } } }.
 */
function layout(uploads, sizeOf, partSize = PART_SIZE) {
  const parts = [];
  const index = {};
  for (const { key, file, type, cache } of uploads) {
    const size = sizeOf(file);
    const assets = [];
    for (let start = 0, n = 0; start < size || n === 0; start += partSize, n++) {
      const asset = `_p/${key}.${n}`;
      parts.push({ asset, file, start, end: Math.min(start + partSize, size) });
      assets.push(`/${asset}`);
    }
    index[`/${key}`] = { type, cache, size, parts: assets, ...(key.endsWith('.dmg') && { download: key.split('/').pop() }) };
  }
  return { parts, index };
}

module.exports = { PART_SIZE, INDEX, layout };
