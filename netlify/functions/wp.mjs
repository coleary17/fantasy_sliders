import { getStore } from '@netlify/blobs';

const KEY_PATTERN = /^\d{4}-w\d{2}$/;

// GET /api/wp lists the recorded weeks; GET /api/wp?key=2026-w09 returns one week.
// A week carries an ETag, so a phone polling an unchanged week gets a 304 instead of the whole file.
export default async (request) => {
  const blobs = getStore({ name: 'win-probability', consistency: 'strong' });
  const key = new URL(request.url).searchParams.get('key');
  if (key === null) {
    const { blobs: items } = await blobs.list();
    return Response.json({ keys: items.map((b) => b.key).sort() });
  }
  if (!KEY_PATTERN.test(key)) return new Response('Invalid key', { status: 400 });
  const known = request.headers.get('if-none-match')?.replace(/^W\//, '');
  const entry = await blobs.getWithMetadata(key, { type: 'text', etag: known ?? undefined });
  if (!entry) return new Response('Not found', { status: 404 });
  const headers = { 'cache-control': 'no-cache', etag: entry.etag };
  if (entry.data === null) return new Response(null, { status: 304, headers });
  return new Response(entry.data, { headers: { ...headers, 'content-type': 'application/json' } });
};
