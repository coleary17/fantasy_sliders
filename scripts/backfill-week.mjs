#!/usr/bin/env node
// Rebuilds finished weeks from ESPN's play-by-play and saves each one that passes its checks to
// public/data/wp for review. Usage: node scripts/backfill-week.mjs 8 | 1-8 [--dry-run] [--force]
import { buildWeek, checkWeek } from '../lib/backfill.mjs';
import { fetchTeams, jsonFetcher, LEAGUE_ID, POSITIONS_QUERY, weekKey } from '../lib/collector.mjs';
import { store } from './local-store.mjs';

const [from, to = from] = (process.argv[2] ?? '').split('-').map(Number);
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
  throw new Error('Usage: backfill-week.mjs <week or first-last> [--dry-run] [--force]');
}
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const getJson = jsonFetcher(fetch);
const league = await getJson(`https://api.sleeper.app/v1/league/${LEAGUE_ID}`);
const season = league.season;
const teams = await fetchTeams(getJson, LEAGUE_ID);

async function rebuild(week) {
  const key = weekKey(season, week);
  if (!dryRun && !force && await store.get(key)) return { key, skipped: 'already exists, use --force to replace it' };
  const [entries, projections, finalStats, board] = await Promise.all([
    getJson(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/matchups/${week}`),
    getJson(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${POSITIONS_QUERY}`),
    getJson(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&${POSITIONS_QUERY}`),
    getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`),
  ]);
  const unfinished = board.events.filter((e) => e.competitions[0].status.type.state !== 'post');
  if (unfinished.length > 0) return { key, skipped: `${unfinished.length} games haven't finished` };
  const summaries = Object.fromEntries(await Promise.all(board.events.map(async (e) => [
    e.id,
    await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`),
  ])));
  const built = buildWeek({ season, week, league, teams, entries, projections, finalStats, summaries });
  return { key, built, check: checkWeek(built, entries) };
}

let failed = false;
for (let week = from; week <= to; week++) {
  const { key, skipped, built, check } = await rebuild(week);
  if (skipped) {
    console.log(`${key}: skipped, ${skipped}`);
    continue;
  }
  const size = (JSON.stringify(built.doc).length / 1024).toFixed(0);
  const passed = check.failures.length === 0;
  failed ||= !passed;
  const outcome = passed ? (dryRun ? 'passed, not saved' : 'saved') : `NOT SAVED: ${check.failures.join('; ')}`;
  console.log(`${key}: ${outcome} | ${built.doc.snapshots.length} snapshots, ${size} KB, average miss ${check.averageMiss.toFixed(2)}, longest game ${(built.longestGameMs / 3_600_000).toFixed(1)}h`);
  for (const a of check.review) console.log(`  review: ${a.name} (${a.pos}) final ${a.final}, gap ${a.gap}, projected ${a.proj}`);
  if (passed && !dryRun) await store.set(key, built.doc);
}
if (failed) process.exitCode = 1;
