// JSON files under public/data, for local viewing.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

export const localStore = (name) => {
  const DIR = join(DATA_DIR, name);
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(join(DIR, `${key}.json`), 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async set(key, value) {
      await mkdir(DIR, { recursive: true });
      await writeFile(join(DIR, `${key}.json`), JSON.stringify(value));
      const keys = (await readdir(DIR))
        .filter((f) => f !== 'index.json' && f !== 'catalog.json' && f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort();
      await writeFile(join(DIR, 'index.json'), JSON.stringify({ keys }));
    },
  };
};

export const store = localStore('wp');
