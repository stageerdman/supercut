// The Cloudflare Worker that serves a release (latest.json, the update, the DMG). Workers static assets cap a file
// at 25 MiB and the app is bigger, so the release uploads files as parts plus an index (scripts/release/site.js);
// this Worker streams a file's parts back as one response with its own type and cache rules.
const INDEX = '/_index.json';

let index;

async function readIndex(env) {
  if (!index) {
    const res = await env.ASSETS.fetch(new Request(new URL(INDEX, 'https://assets.local')));
    if (!res.ok) throw new Error(`index asset answered ${res.status}`);
    index = await res.json();
  }
  return index;
}

/**
 * The parts, one after another, as one body of `size` bytes (FixedLengthStream: the response keeps its
 * Content-Length, so the app can show progress). A missing part errors the stream instead of serving a short file.
 */
function concat(env, { parts, size }) {
  const { readable, writable } = new FixedLengthStream(size);
  (async () => {
    try {
      for (const part of parts) {
        const res = await env.ASSETS.fetch(new Request(new URL(part, 'https://assets.local')));
        if (!res.ok) throw new Error(`part ${part} answered ${res.status}`);
        await res.body.pipeTo(writable, { preventClose: true });
      }
      await writable.close();
    } catch (err) {
      console.error(`[updates] ${err.message}`);
      await writable.abort(err);
    }
  })();
  return readable;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = (await readIndex(env))[path];
    if (!file) return new Response('not found', { status: 404 });
    const headers = {
      'content-type': file.type,
      'cache-control': file.cache,
      'content-length': String(file.size),
      ...(file.download && { 'content-disposition': `attachment; filename="${file.download}"` }),
    };
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(concat(env, file), { headers });
  },
};
