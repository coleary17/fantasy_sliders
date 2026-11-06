#!/usr/bin/env node
// Runs the collector from this machine, saving to public/data/wp for local viewing.
// Usage: node scripts/collect-local.mjs [--loop]
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from '../lib/collector.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'wp');
const INTERVAL_MS = 5 * 60 * 1000;

const store = {
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
      .filter((f) => f !== 'index.json' && f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort();
    await writeFile(join(DIR, 'index.json'), JSON.stringify({ keys }));
  },
};

async function tick() {
  try {
    console.log(new Date().toISOString(), JSON.stringify(await collect({ store })));
  } catch (err) {
    console.error(new Date().toISOString(), 'collect failed:', err.message);
    if (!process.argv.includes('--loop')) process.exitCode = 1;
  }
}

await tick();
if (process.argv.includes('--loop')) setInterval(tick, INTERVAL_MS);
