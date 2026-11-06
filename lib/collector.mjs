import { teamOutlook } from './model.mjs';
import { DEFENSE_KINDS, ESPN_TEAM_CODES, defenseStatCount, parseDefense, parseSummary, pickStats, summaryPoints } from './plays.mjs';

export const LEAGUE_ID = '1384898219116343296';
const IDLE_SNAPSHOT_MS = 60 * 60 * 1000;
const LIVE_SNAPSHOT_MS = 4.5 * 60 * 1000; // about every 5 minutes, allowing for timer drift
const BIG_SCORE_CHANGE = 3; // a field goal or more gets its own point on the chart
const LAST_LEAGUE_WEEK = 17;
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);
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
      const score = competition.competitors.reduce((sum, c) => sum + Number(c.score ?? 0), 0);
      for (const { team } of competition.competitors) {
        games[ESPN_TEAM_CODES[team.abbreviation] ?? team.abbreviation] = { progress, live, espnId: event.id, score };
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

// A game summary is large, so it's only read when the scoreboard's score changes, plus one last
// read once the game ends, which also fills in a game the collector missed or one saved before
// defensive plays were kept. A summary that hasn't caught up with the scoreboard is read again
// on the next run.
function gamesByScore(doc, games) {
  const byId = new Map(Object.values(games).filter((g) => g.espnId).map((g) => [g.espnId, g]));
  return new Map([...byId].filter(([id, g]) => {
    const saved = doc.plays[id];
    return g.live ? (saved?.score ?? 0) !== g.score : g.progress >= 1 && !(saved?.final && saved.defense);
  }));
}

// A sack or a pick doesn't change the score, so a live game is also read when Sleeper credits a
// starting defense with more plays than the saved summary has.
function gamesBehindSleeper(doc, games) {
  const due = new Map();
  for (const [team, g] of Object.entries(games)) {
    const stats = doc.stats?.[team]?.at(-1)?.[1];
    if (!g.live || !g.espnId || !stats) continue;
    const saved = doc.plays[g.espnId]?.defense ?? [];
    const behind = DEFENSE_KINDS.some((kind) => (
      defenseStatCount(stats, kind) > saved.filter((p) => p.team === team && p.kind === kind).length
    ));
    if (behind) due.set(g.espnId, g);
  }
  return due;
}

// Each read replaces the game, so overturned plays go away.
async function readSummaries(getJson, doc, due, t) {
  await Promise.all([...due].map(async ([id, g]) => {
    try {
      const summary = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`);
      doc.plays[id] = {
        final: !g.live,
        score: summaryPoints(summary) === g.score ? g.score : doc.plays[id]?.score,
        plays: parseSummary(summary, g.live ? t : null),
        defense: parseDefense(summary, g.live ? t : null),
      };
    } catch (err) {
      console.warn(`Keeping earlier plays for game ${id}: ${err.message}`);
    }
  }));
}

// Each starter's box score over time. A new entry is added only when a stat changes.
// Returns whether a defense's changed.
async function refreshStats(getJson, doc, starters, t) {
  doc.stats ??= {};
  let defenseChanged = false;
  const query = POSITIONS.map((p) => `position[]=${p}`).join('&');
  try {
    const rows = await getJson(`https://api.sleeper.com/stats/nfl/${doc.season}/${doc.week}?season_type=regular&${query}`);
    for (const row of rows) {
      if (!starters.has(row.player_id)) continue;
      const stats = pickStats(row.stats ?? {});
      const history = doc.stats[row.player_id] ?? [];
      if (Object.keys(stats).length === 0 || JSON.stringify(history.at(-1)?.[1]) === JSON.stringify(stats)) continue;
      doc.stats[row.player_id] = [...history, [t, stats]];
      if (doc.players[row.player_id]?.pos === 'DEF') defenseChanged = true;
    }
  } catch (err) {
    console.warn(`Keeping earlier stats: ${err.message}`);
  }
  return defenseChanged;
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

export function pairMatchups(entries) {
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

export function teamNames(rosters, users) {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  return Object.fromEntries(rosters.map((roster) => {
    const owner = usersById.get(roster.owner_id);
    const name = owner?.metadata?.team_name?.trim() || owner?.display_name || `Team ${roster.roster_id}`;
    return [roster.roster_id, name];
  }));
}

async function fetchTeams(getJson, leagueId) {
  const [rosters, users] = await Promise.all([
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  return teamNames(rosters, users);
}

function bigScoreChange(snapshot, last) {
  return Object.entries(snapshot.teams).some(([id, team]) => (
    Math.abs(team.points - (last.teams[id]?.points ?? 0)) >= BIG_SCORE_CHANGE
  ));
}

function shouldKeep(snapshot, last) {
  if (!last || snapshot.live !== last.live) return true;
  if (snapshot.live) return snapshot.t - last.t >= LIVE_SNAPSHOT_MS || bigScoreChange(snapshot, last);
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

  const t = now();
  const live = gameList.some((g) => g.live);
  doc.plays ??= {};
  const due = gamesByScore(doc, games);
  const defenseChanged = (live || due.size > 0)
    && await refreshStats(getJson, doc, new Set(entries.flatMap((e) => e.starters ?? [])), t);
  await readSummaries(getJson, doc, new Map([...due, ...gamesBehindSleeper(doc, games)]), t);

  const snapshot = { t, live, games: gameProgress, teams };
  doc.matchups = pairMatchups(entries);
  doc.slots = (league.roster_positions ?? []).filter((slot) => !BENCH_SLOTS.has(slot));
  doc.ptsAllowScoring = Object.fromEntries(Object.entries(league.scoring_settings ?? {}).filter(([stat]) => stat.startsWith('pts_allow_')));
  // Every live run shows on the site, but only some stay in the history. The rest are the
  // latest reading, which the next run replaces, so the file doesn't grow by a snapshot a minute.
  if (doc.snapshots.at(-1)?.latestOnly) doc.snapshots.pop();
  // A defensive play can be worth too little to trip the score check, but needs its own point too.
  const keep = shouldKeep(snapshot, doc.snapshots.at(-1)) || (live && defenseChanged);
  const saved = keep || live;
  if (keep) doc.snapshots.push(snapshot);
  else if (live) doc.snapshots.push({ ...snapshot, latestOnly: true });
  await store.set(key, doc);
  return { saved, key, live: snapshot.live, snapshots: doc.snapshots.length };
}
