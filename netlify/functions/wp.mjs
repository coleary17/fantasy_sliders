import { getStore } from '@netlify/blobs';

const KEY_PATTERN = /^\d{4}-w\d{2}$/;

// GET /api/wp lists the recorded weeks; GET /api/wp?key=2026-w09 returns one week.
export default async (request) => {
  const blobs = getStore({ name: 'win-probability', consistency: 'strong' });
  const key = new URL(request.url).searchParams.get('key');
  if (key === null) {
    const { blobs: items } = await blobs.list();
    return Response.json({ keys: items.map((b) => b.key).sort() });
  }
  if (!KEY_PATTERN.test(key)) return new Response('Invalid key', { status: 400 });
  const doc = await blobs.get(key, { type: 'json' });
  return doc ? Response.json(doc) : new Response('Not found', { status: 404 });
};
