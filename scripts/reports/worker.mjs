// The Cloudflare Worker that takes the app's debug reports (design/debug-report.md). Each report is kept in KV
// (R2 is not enabled on the account) as `reports/<install>/<at>-<id>`, gzipped JSON, and found later by its id;
// nothing is readable from outside. One report per 30 s per Mac.
export const PATH = '/api/debug-report';
export const GAP_MS = 30_000;
const MAX_BYTES = 8 * 1024 * 1024;
const INSTALL = /^[0-9a-f]{32}$/;

const fail = (status, error) => Response.json({ error }, { status });

const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** The report as gzip plus its parsed JSON; the edge may already have unzipped the body. */
async function read(body) {
  const gz = isGzip(body) ? body : await through(body, new CompressionStream('gzip'));
  const text = new TextDecoder().decode(await through(gz, new DecompressionStream('gzip')));
  return { gz, report: JSON.parse(text) };
}

export async function handle(request, env, now = Date.now(), newId = () => crypto.randomUUID().replaceAll('-', '')) {
  if (new URL(request.url).pathname !== PATH) return fail(404, 'not found');
  if (request.method !== 'POST') return fail(405, 'method not allowed');
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BYTES) return fail(413, 'too large');
  let parsed;
  try {
    parsed = await read(body);
  } catch (err) {
    return fail(400, `not a report: ${err.message}`);
  }
  const { gz, report } = parsed;
  const install = INSTALL.test(report.install) ? report.install : 'unknown';
  const last = await env.REPORTS.get(`last/${install}`);
  if (last !== null && now - Number(last) < GAP_MS) return fail(429, 'one report per 30 seconds');
  const id = newId();
  const metadata = { at: now, app: String(report.app), macos: String(report.macos), claude: String(report.claude) };
  await env.REPORTS.put(`reports/${install}/${now}-${id}`, gz, { metadata });
  // KV's shortest expiry is 60 s; the gap itself is checked against the stored time.
  await env.REPORTS.put(`last/${install}`, String(now), { expirationTtl: 60 });
  console.log(`[reports] ${install} ${id} ${gz.length} bytes`);
  return Response.json({ id });
}

export default { fetch: (request, env) => handle(request, env) };
