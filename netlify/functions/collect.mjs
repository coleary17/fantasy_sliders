import { getStore } from '@netlify/blobs';
import { collect } from '../../lib/collector.mjs';

export default async () => {
  const blobs = getStore('win-probability');
  const result = await collect({
    store: {
      get: (key) => blobs.get(key, { type: 'json' }),
      set: (key, value) => blobs.setJSON(key, value),
    },
  });
  console.log(JSON.stringify(result));
};

export const config = { schedule: '*/5 * * * *' };
