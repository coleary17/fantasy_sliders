#!/usr/bin/env node
// Rebuild the local catalog without touching story documents or making LLM calls.
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { teamNames } from '../lib/collector.mjs';
import { buildStoryCatalog } from '../lib/story/catalog.mjs';
import { ORIGINAL_LEAGUE_ID } from '../lib/story/identity.mjs';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
async function jsonFiles(dir, skip = []) {
  const files = await readdir(dir).catch((err) => { if (err.code === 'ENOENT') return []; throw err; });
  return Promise.all(files.filter((f) => f.endsWith('.json') && !skip.includes(f)).map(async (file) => {
    try { return { key: file.slice(0, -5), document: JSON.parse(await readFile(join(dir, file), 'utf8')) }; }
    catch (err) { return { key: file.slice(0, -5), error: `could not read JSON (${err.message})` }; }
  }));
}
export async function refreshStoryCatalog({ dataDir = DATA_DIR, refresh = false, fetchImpl = fetch } = {}) {
  const storyDir = join(dataDir, 'story');
  const [stories, weekFiles] = await Promise.all([jsonFiles(storyDir, ['players.json', 'output.json', 'index.json']), jsonFiles(join(dataDir, 'wp'), ['index.json'])]);
  let refreshed = null;
  if (refresh) {
    const base = `https://api.sleeper.app/v1/league/${ORIGINAL_LEAGUE_ID}`;
    const get = async (url) => { const response = await fetchImpl(url); if (!response.ok) throw new Error(`Sleeper request failed: ${response.status} ${url}`); return response.json(); };
    const [league, rosters, users] = await Promise.all([get(base), get(`${base}/rosters`), get(`${base}/users`)]);
    refreshed = { leagueId: ORIGINAL_LEAGUE_ID, season: league.season, teams: teamNames(rosters, users) };
  }
  const previous = stories.find((entry) => entry.key === 'catalog')?.document;
  const weeks = weekFiles.filter(({ key, document }) => /^\d{4}-w\d+$/.test(key) && document).map(({ document }) => document);
  for (const entry of weekFiles.filter(({ key, error }) => /^\d{4}-w\d+$/.test(key) && error)) console.warn(`warning: ${entry.key}.json: ${entry.error}; skipped`);
  const { catalog, warnings } = buildStoryCatalog({ stories, weeks, previous, refreshed });
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  await mkdir(storyDir, { recursive: true });
  const temporary = join(storyDir, `catalog-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, JSON.stringify(catalog));
  await rename(temporary, join(storyDir, 'catalog.json'));
  return catalog;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalog = await refreshStoryCatalog({ refresh: process.argv.includes('--refresh') });
  console.log(`Indexed ${catalog.leagues.reduce((n, l) => n + l.teams.filter((t) => t.available).length, 0)} stories across ${catalog.leagues.length} league seasons.`);
}
