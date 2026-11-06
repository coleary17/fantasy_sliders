import { getStore } from '@netlify/blobs';
import { collect } from '../../lib/collector.mjs';
import { shouldCollect } from '../../lib/schedule.mjs';

export default async () => {
  if (!shouldCollect(Date.now())) return;
  // Each run builds on the last one's save, which the default consistency could miss.
  const blobs = getStore({ name: 'win-probability', consistency: 'strong' });
  const result = await collect({
    store: {
      get: (key) => blobs.get(key, { type: 'json' }),
      set: (key, value) => blobs.setJSON(key, value),
    },
  });
  console.log(JSON.stringify(result));
};

export const config = { schedule: '* * * * *' };
