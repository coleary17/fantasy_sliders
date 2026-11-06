import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStoryCatalog } from './catalog.mjs';
import { ORIGINAL_LEAGUE_ID, storyKey } from './identity.mjs';
import { refreshStoryCatalog } from '../../scripts/index-stories.mjs';

const identity = { leagueId: ORIGINAL_LEAGUE_ID, season: '2026', rosterId: 1 };
const legacy = { season: '2026', rosterId: 1, team: 'Old name', promptVersion: 2, threads: [], chapters: [{ week: 2, facts: [], story: { beats: [] } }] };

test('catalog merges local teams and prefers a validated scoped story', () => {
  const scoped = { ...legacy, leagueId: ORIGINAL_LEAGUE_ID, promptVersion: 3, chapters: [{ week: 1, facts: [], story: { beats: [] } }] };
  const { catalog, warnings } = buildStoryCatalog({
    weeks: [{ season: '2026', week: 1, teams: { 1: 'Current name', 2: 'Waiting' } }],
    stories: [{ key: storyKey(identity), document: scoped }, { key: '2026-r01', document: legacy }, { key: 'players', document: {} }, { key: 'bad', document: {} }],
  });
  assert.deepEqual(catalog.leagues[0].teams, [
    { rosterId: 1, team: 'Current name', weeks: [1], available: true, promptVersion: 3 },
    { rosterId: 2, team: 'Waiting', weeks: [], available: false },
  ]);
  assert.equal(warnings.length, 1);
});

test('an invalid scoped story does not advertise a legacy fallback', () => {
  const { catalog, warnings } = buildStoryCatalog({ weeks: [{ season: '2026', week: 1, teams: { 1: 'One' } }], stories: [
    { key: storyKey(identity), document: { ...legacy, leagueId: ORIGINAL_LEAGUE_ID, rosterId: 2 } },
    { key: '2026-r01', document: legacy },
  ] });
  assert.equal(catalog.leagues[0].teams[0].available, false);
  assert.match(warnings[0], /roster ID does not match/);
});

test('offline indexing preserves story bytes and uses saved week teams', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'story-catalog-'));
  await mkdir(join(dataDir, 'story'));
  await mkdir(join(dataDir, 'wp'));
  const original = JSON.stringify(legacy, null, 2);
  await writeFile(join(dataDir, 'story', '2026-r01.json'), original);
  await writeFile(join(dataDir, 'wp', '2026-w01.json'), JSON.stringify({ season: '2026', week: 1, teams: { 1: 'One', 2: 'Two' } }));
  const catalog = await refreshStoryCatalog({ dataDir, fetchImpl: () => { throw new Error('unexpected network'); } });
  assert.equal(await readFile(join(dataDir, 'story', '2026-r01.json'), 'utf8'), original);
  assert.equal(catalog.leagues[0].teams.length, 2);
  assert.equal(catalog.leagues[0].teams[1].available, false);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'story', 'catalog.json'), 'utf8')), catalog);
});
