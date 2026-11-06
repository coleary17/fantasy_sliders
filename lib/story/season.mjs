// Gathers what the fact engine needs from Sleeper and the collector's saved weeks.
import { LEAGUE_ID, teamNames, weekKey } from '../collector.mjs';

const LAST_LEAGUE_WEEK = 17;
const NON_LINEUP_SLOTS = new Set(['BN', 'IR', 'TAXI']);

// Sleeper's player file has no full_name for defenses, and it's about 5 MB, so keep only this.
export function trimPlayers(raw) {
  return Object.fromEntries(Object.entries(raw).map(([id, p]) => [id, {
    name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || id,
    pos: p.position ?? null,
  }]));
}

// Sleeper files a move under the week in progress, and it keeps that week until the next waiver
// run, which comes after the games. So those claims really belong to the following week's lineup.
export function movesByLineupWeek(transactionsByLeg, docs) {
  const weeks = {};
  for (const [leg, moves] of Object.entries(transactionsByLeg)) {
    const lastLive = docs[leg]?.snapshots?.findLast((s) => s.live)?.t ?? Infinity;
    for (const move of moves) {
      const week = move.status_updated > lastLive ? Number(leg) + 1 : Number(leg);
      (weeks[week] ??= []).push(move);
    }
  }
  return weeks;
}

export async function loadStorySeason({ getJson, loadDoc, players, leagueId = LEAGUE_ID }) {
  const base = `https://api.sleeper.app/v1/league/${leagueId}`;
  const [league, rosters, users] = await Promise.all([getJson(base), getJson(`${base}/rosters`), getJson(`${base}/users`)]);
  const lastRegularWeek = league.settings.playoff_week_start - 1;
  const lastScoredWeek = league.settings.last_scored_leg ?? 0;
  const weeks = Array.from({ length: LAST_LEAGUE_WEEK }, (_, i) => i + 1);

  const [matchups, transactions, docs] = await Promise.all([
    Promise.all(weeks.filter((w) => w <= lastRegularWeek).map(async (w) => [w, await getJson(`${base}/matchups/${w}`)])),
    Promise.all(weeks.filter((w) => w <= lastScoredWeek + 1).map(async (w) => [w, await getJson(`${base}/transactions/${w}`)])),
    Promise.all(weeks.filter((w) => w <= lastScoredWeek).map(async (w) => [w, await loadDoc(weekKey(league.season, w))])),
  ]);
  return {
    season: league.season,
    names: teamNames(rosters, users),
    slots: league.roster_positions.filter((slot) => !NON_LINEUP_SLOTS.has(slot)),
    waiverBudget: league.settings.waiver_budget,
    playoffSpots: league.settings.playoff_teams,
    lastRegularWeek,
    lastScoredWeek,
    matchups: Object.fromEntries(matchups),
    transactions: movesByLineupWeek(Object.fromEntries(transactions), Object.fromEntries(docs)),
    docs: Object.fromEntries(docs),
    players,
    rosterSettings: Object.fromEntries(rosters.map((r) => [r.roster_id, r.settings])),
  };
}
