import { teamOutlook } from './model.mjs';

export const LEAGUE_ID = '1384898219116343296';
const IDLE_SNAPSHOT_MS = 60 * 60 * 1000;
const LAST_LEAGUE_WEEK = 17;
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);
const ESPN_TEAM_CODES = { WSH: 'WAS' }; // ESPN code -> Sleeper code
const REGULATION_SECONDS = 3600;
const QUARTER_SECONDS = 900;
const OVERTIME_PROGRESS = 0.98;

const round = (n, places = 2) => Number(n.toFixed(places));

export function weekKey(season, week) {
  return `${season}-w${String(week).padStart(2, '0')}`;
}

function jsonFetcher(fetchImpl) {
  return async (url) => {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'fantasy-win-probability' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    return res.json();
  };
}

function espnProgress(status) {
  const { state } = status.type;
  if (state === 'pre') return 0;
  if (state === 'post') return 1;
  if (status.period > 4) return OVERTIME_PROGRESS;
  const elapsed = (status.period - 1) * QUARTER_SECONDS + (QUARTER_SECONDS - status.clock);
  return Math.min(elapsed / REGULATION_SECONDS, OVERTIME_PROGRESS);
}

// Sleeper has no game clock, so progress comes from ESPN. Sleeper's own schedule,
// which only has a coarse status, is the fallback if ESPN is unavailable.
async function fetchGames(getJson, season, week) {
  const games = {};
  try {
    const board = await getJson(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`,
    );
    for (const event of board.events) {
      const competition = event.competitions[0];
      const progress = espnProgress(competition.status);
      const live = competition.status.type.state === 'in';
      for (const { team } of competition.competitors) {
        games[ESPN_TEAM_CODES[team.abbreviation] ?? team.abbreviation] = { progress, live };
      }
    }
    return games;
  } catch (err) {
    console.warn(`ESPN scoreboard unavailable, using Sleeper schedule: ${err.message}`);
  }
  const schedule = await getJson(`https://api.sleeper.com/schedule/nfl/regular/${season}`);
  for (const game of schedule.filter((g) => g.week === week)) {
    const entry = game.status === 'complete' ? { progress: 1, live: false }
      : game.status === 'pre_game' ? { progress: 0, live: false }
      : { progress: 0.5, live: true };
    games[game.home] = entry;
    games[game.away] = entry;
  }
  return games;
}

export function projectedPoints(stats, scoring) {
  let total = 0;
  for (const [stat, weight] of Object.entries(scoring)) {
    const value = stats[stat];
    if (typeof value === 'number') total += value * weight;
  }
  return total;
}

// Projections are frozen at kickoff: only players whose game hasn't started update.
async function refreshProjections(getJson, doc, games, scoring, rostered) {
  const query = POSITIONS.map((p) => `position[]=${p}`).join('&');
  const url = `https://api.sleeper.com/projections/nfl/${doc.season}/${doc.week}?season_type=regular&${query}`;
  try {
    for (const entry of await getJson(url)) {
      if (!rostered.has(entry.player_id)) continue;
      const started = (games[entry.team]?.progress ?? 0) > 0;
      if (started && doc.players[entry.player_id]) continue;
      doc.players[entry.player_id] = {
        proj: round(projectedPoints(entry.stats ?? {}, scoring)),
        team: entry.team,
        pos: entry.player?.position ?? 'DEF',
        name: [entry.player?.first_name, entry.player?.last_name].filter(Boolean).join(' ') || entry.player_id,
      };
    }
  } catch (err) {
    // Without projections every matchup would look decided, so fail rather than record that.
    if (Object.keys(doc.players).length === 0) throw err;
    console.warn(`Keeping earlier projections: ${err.message}`);
  }
}

function pairMatchups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.matchup_id == null) continue; // byes and unplaced teams in playoff weeks
    groups.set(entry.matchup_id, [...(groups.get(entry.matchup_id) ?? []), entry.roster_id]);
  }
  return [...groups.entries()]
    .filter(([, rosters]) => rosters.length === 2)
    .sort(([a], [b]) => a - b)
    .map(([, rosters]) => rosters);
}

async function fetchTeams(getJson, leagueId) {
  const [rosters, users] = await Promise.all([
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  return Object.fromEntries(rosters.map((roster) => {
    const owner = usersById.get(roster.owner_id);
    const name = owner?.metadata?.team_name?.trim() || owner?.display_name || `Team ${roster.roster_id}`;
    return [roster.roster_id, name];
  }));
}

function shouldSave(snapshot, last) {
  if (!last || snapshot.live || last.live) return true;
  const same = JSON.stringify([snapshot.games, snapshot.teams]) === JSON.stringify([last.games, last.teams]);
  if (same) return false;
  const gameFinishedOrStarted = JSON.stringify(snapshot.games) !== JSON.stringify(last.games);
  return gameFinishedOrStarted || snapshot.t - last.t >= IDLE_SNAPSHOT_MS;
}

export async function collect({ store, fetchImpl = fetch, now = Date.now, leagueId = LEAGUE_ID }) {
  const getJson = jsonFetcher(fetchImpl);
  const [state, league] = await Promise.all([
    getJson('https://api.sleeper.app/v1/state/nfl'),
    getJson(`https://api.sleeper.app/v1/league/${leagueId}`),
  ]);
  const { week } = state;
  if (league.season !== state.season) return { saved: false, reason: `league is for ${league.season}, NFL is in ${state.season}` };
  if (!week || week > LAST_LEAGUE_WEEK) return { saved: false, reason: `week ${week} is outside the league season` };

  const key = weekKey(state.season, week);
  const doc = (await store.get(key)) ?? {
    season: state.season,
    week,
    teams: await fetchTeams(getJson, leagueId),
    matchups: [],
    players: {},
    snapshots: [],
  };

  const [entries, games] = await Promise.all([
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`),
    fetchGames(getJson, state.season, week),
  ]);

  const rostered = new Set(entries.flatMap((e) => e.players ?? []));
  const gameList = Object.values(games);
  if (gameList.some((g) => g.progress === 0) || Object.keys(doc.players).length === 0) {
    await refreshProjections(getJson, doc, games, league.scoring_settings, rostered);
  }

  const gameProgress = Object.fromEntries(Object.entries(games).map(([team, g]) => [team, round(g.progress, 3)]));
  const teams = {};
  for (const entry of entries) {
    const starters = entry.starters ?? [];
    const points = entry.points ?? 0;
    const { expected, variance } = teamOutlook({ points, starters, players: doc.players, gameProgress });
    teams[entry.roster_id] = {
      points: round(points),
      expected: round(expected),
      variance: round(variance),
      // Kept raw so the model can be re-run on these snapshots later.
      starters,
      starterPoints: entry.starters_points ?? [],
    };
  }

  const snapshot = { t: now(), live: gameList.some((g) => g.live), games: gameProgress, teams };
  doc.matchups = pairMatchups(entries);
  doc.slots = (league.roster_positions ?? []).filter((slot) => !BENCH_SLOTS.has(slot));
  const saved = shouldSave(snapshot, doc.snapshots.at(-1));
  if (saved) doc.snapshots.push(snapshot);
  await store.set(key, doc);
  return { saved, key, live: snapshot.live, snapshots: doc.snapshots.length };
}
