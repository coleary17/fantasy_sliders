// Playoff odds: plays out the rest of the regular season many times. The constants were
// fit on this league's past seasons, predicting later weeks and playoff berths from earlier weeks.
export const WEEKLY_SD = 22.4;
export const SHRINK_GAMES = 6; // pseudo-games of league average added to each team's scoring
export const STRENGTH_SD = 16; // spread in each team's true level per simulated season; best calibrated in backtests
const FALLBACK_AVERAGE = 115; // only used before anyone has played
const ITERATIONS = 20_000;
const SEED = 20260909; // fixed, so unchanged inputs always give the same odds

const gamesPlayed = (team) => team.wins + team.losses + team.ties;

// Expected weekly score: season average pulled toward the league average.
export function teamStrengths(teams) {
  const games = teams.reduce((sum, team) => sum + gamesPlayed(team), 0);
  const points = teams.reduce((sum, team) => sum + team.pointsFor, 0);
  const average = games > 0 ? points / games : FALLBACK_AVERAGE;
  return Object.fromEntries(teams.map((team) => [
    team.id,
    (team.pointsFor + SHRINK_GAMES * average) / (gamesPlayed(team) + SHRINK_GAMES),
  ]));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal draw (Box-Muller).
function gaussian(random) {
  const u = 1 - random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

// Share of simulated seasons in which each team finishes in the playoff spots.
// Teams rank by record, then points for. A week in `schedule` is { pairs, outlooks }:
// outlooks are optional live { expected, variance } readings that replace a team's
// usual score distribution for that week.
export function playoffOdds({ teams, schedule, playoffSpots, iterations = ITERATIONS, seed = SEED, strengthSd = STRENGTH_SD }) {
  const random = seededRandom(seed);
  const strengths = teamStrengths(teams);
  const indexById = new Map(teams.map((team, i) => [String(team.id), i]));
  const weeks = schedule.map(({ pairs, outlooks = {} }) => ({
    pairs: pairs.map(([a, b]) => [indexById.get(String(a)), indexById.get(String(b))]),
    means: teams.map((team) => outlooks[team.id]?.expected ?? strengths[team.id]),
    sds: teams.map((team) => (outlooks[team.id] ? Math.sqrt(outlooks[team.id].variance) : WEEKLY_SD)),
    drifts: teams.map((team) => (outlooks[team.id] ? 0 : 1)), // live readings already reflect the team's level
  }));

  const startWins = teams.map((team) => team.wins + team.ties / 2);
  const startPoints = teams.map((team) => team.pointsFor);
  const made = new Array(teams.length).fill(0);
  const order = teams.map((_, i) => i);
  const scores = new Array(teams.length);
  const offsets = new Array(teams.length);

  for (let run = 0; run < iterations; run++) {
    const wins = [...startWins];
    const points = [...startPoints];
    for (let i = 0; i < teams.length; i++) offsets[i] = strengthSd * gaussian(random);
    for (const { pairs, means, sds, drifts } of weeks) {
      for (let i = 0; i < teams.length; i++) {
        scores[i] = means[i] + drifts[i] * offsets[i] + sds[i] * gaussian(random);
      }
      for (const [a, b] of pairs) {
        points[a] += scores[a];
        points[b] += scores[b];
        if (scores[a] > scores[b]) wins[a] += 1;
        else if (scores[b] > scores[a]) wins[b] += 1;
        else {
          wins[a] += 0.5;
          wins[b] += 0.5;
        }
      }
    }
    order.sort((x, y) => wins[y] - wins[x] || points[y] - points[x]);
    for (let i = 0; i < playoffSpots; i++) made[order[i]] += 1;
  }

  return Object.fromEntries(teams.map((team, i) => [team.id, made[i] / iterations]));
}

// The latest collector snapshot in a recorded week, as outlooks a simulation can use.
export function weekReading(doc) {
  const snapshot = doc.snapshots.at(-1);
  return snapshot ? { week: doc.week, t: snapshot.t, live: snapshot.live, outlooks: snapshot.teams } : null;
}

export function applyReadings(schedule, readings) {
  return schedule.map((week) => {
    const reading = readings.find((r) => r.week === week.week);
    return reading ? { ...week, outlooks: reading.outlooks } : week;
  });
}

export const WHAT_IF_BASE_SCORE = 110;
export const DEFAULT_MARGIN = 10;
const MIN_MARGIN = 1;
const MAX_MARGIN = 70;

export function normalizeMargin(value) {
  const margin = Number(value);
  if (value === '' || !Number.isFinite(margin)) return DEFAULT_MARGIN;
  return Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, margin));
}

export function whatIfScores(pair, { winner, margin }) {
  const loser = pair[0] === winner ? pair[1] : pair[0];
  return { [winner]: WHAT_IF_BASE_SCORE + normalizeMargin(margin), [loser]: WHAT_IF_BASE_SCORE };
}

// Each team's projected score in a week: its live estimate, or else its season strength.
export function projectedScores(week, teams) {
  const strengths = teamStrengths(teams);
  return Object.fromEntries(teams.map((team) => [team.id, week.outlooks?.[team.id]?.expected ?? strengths[team.id]]));
}

// Fixes one week once anything is picked: picked games at their picked scores, and the
// rest at their projected scores. `picks` maps "a-b" to { winner, margin }.
export function applyPicks(schedule, weekNumber, picks, teams) {
  if (Object.keys(picks).length === 0) return schedule;
  return schedule.map((week) => {
    if (week.week !== weekNumber) return week;
    const projected = projectedScores(week, teams);
    const outlooks = { ...week.outlooks };
    for (const pair of week.pairs) {
      const pick = picks[pair.join('-')];
      const scores = pick ? whatIfScores(pair, pick) : { [pair[0]]: projected[pair[0]], [pair[1]]: projected[pair[1]] };
      for (const [id, expected] of Object.entries(scores)) {
        outlooks[id] = { expected, variance: 0 };
      }
    }
    return { ...week, outlooks };
  });
}

// The table once the given weeks are played out at their projected scores.
export function tableAfterWeeks(teams, weeks) {
  const table = new Map(teams.map((team) => [team.id, { ...team }]));
  for (const week of weeks) {
    const scores = projectedScores(week, teams);
    for (const [a, b] of week.pairs) {
      const [teamA, teamB] = [table.get(a), table.get(b)];
      teamA.pointsFor += scores[a];
      teamB.pointsFor += scores[b];
      if (scores[a] > scores[b]) {
        teamA.wins += 1;
        teamB.losses += 1;
      } else if (scores[b] > scores[a]) {
        teamB.wins += 1;
        teamA.losses += 1;
      } else {
        teamA.ties += 1;
        teamB.ties += 1;
      }
    }
  }
  return teams.map((team) => table.get(team.id));
}

// League order: record, with a tie worth half a win, then points for. The simulation ranks the same way.
export function sortStandings(teams) {
  const winValue = (team) => team.wins + team.ties / 2;
  return [...teams].sort((a, b) => winValue(b) - winValue(a) || b.pointsFor - a.pointsFor);
}

// A simulation can't prove a clinch or an elimination until no games are left to play.
export function formatOdds(probability, final) {
  if (final) return `${Math.round(probability * 100)}%`;
  if (probability >= 0.995) return '>99%';
  if (probability < 0.005) return '<1%';
  return `${Math.round(probability * 100)}%`;
}
