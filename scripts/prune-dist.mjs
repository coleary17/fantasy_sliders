#!/usr/bin/env node
// After vite build: keep only the story catalog and finished story files in dist/data, and drop
// everything else (local week snapshots, the Sleeper players file, prompts, replies, backups).
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const data = join(import.meta.dirname, '..', 'dist', 'data');
const keep = (name) => name === 'catalog.json' || /^\d+-\d{4}-r\d{2}\.json$/.test(name);

await rm(join(data, 'wp'), { recursive: true, force: true });
const story = join(data, 'story');
const files = await readdir(story).catch((err) => { if (err.code === 'ENOENT') return []; throw err; });
for (const name of files) if (!keep(name)) await rm(join(story, name), { recursive: true, force: true });
for (const name of await readdir(data).catch(() => [])) if (name !== 'story') await rm(join(data, name), { recursive: true, force: true });
console.log(`Kept ${files.filter(keep).length} story files in dist/data/story`);
