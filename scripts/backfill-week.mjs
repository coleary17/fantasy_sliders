#!/usr/bin/env node
// Rebuilds a finished week from ESPN's play-by-play and saves it to public/data/wp for review.
// Usage: node scripts/backfill-week.mjs 8 [--force]
import { buildWeek } from '../lib/backfill.mjs';
import { fetchTeams, jsonFetcher, LEAGUE_ID, POSITIONS_QUERY, weekKey } from '../lib/collector.mjs';
import { store } from './local-store.mjs';

const week = Number(process.argv[2]);
if (!Number.isInteger(week) || week < 1) throw new Error('Usage: backfill-week.mjs <week> [--force]');

const getJson = jsonFetcher(fetch);
const league = await getJson(`https://api.sleeper.app/v1/league/${LEAGUE_ID}`);
const season = league.season;
const key = weekKey(season, week);
if (await store.get(key) && !process.argv.includes('--force')) throw new Error(`${key} already exists. Use --force to replace it.`);

const [teams, entries, projections, finalStats, board] = await Promise.all([
  fetchTeams(getJson, LEAGUE_ID),
  getJson(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/matchups/${week}`),
  getJson(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${POSITIONS_QUERY}`),
  getJson(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&${POSITIONS_QUERY}`),
  getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`),
]);
const unfinished = board.events.filter((e) => e.competitions[0].status.type.state !== 'post');
if (unfinished.length > 0) throw new Error(`${unfinished.length} games in week ${week} haven't finished.`);
const summaries = Object.fromEntries(await Promise.all(board.events.map(async (e) => [
  e.id,
  await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`),
])));

const { doc, accuracy } = buildWeek({ season, week, league, teams, entries, projections, finalStats, summaries });
await store.set(key, doc);

// How much of each starter's final score the plays explained. The rest is spread over their game.
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
const byPos = Object.groupBy(accuracy, (a) => a.pos);
console.log(`${key}: ${doc.snapshots.length} snapshots, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB, ${accuracy.length} starters`);
console.log(`Average miss per starter: ${mean(accuracy.map((a) => Math.abs(a.gap))).toFixed(2)} pts`);
for (const [pos, rows] of Object.entries(byPos)) console.log(`  ${pos}: ${mean(rows.map((a) => Math.abs(a.gap))).toFixed(2)} (${rows.length})`);
console.log('Largest misses:');
for (const a of accuracy.toSorted((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, 12)) {
  console.log(`  ${a.name} (${a.pos}): final ${a.final}, gap ${a.gap}`);
}
const suspect = accuracy.filter((a) => a.proj < 1 && a.final >= 5);
console.log(`Starters with no projection who scored 5+: ${suspect.map((a) => `${a.name} ${a.final}`).join(', ') || 'none'}`);
