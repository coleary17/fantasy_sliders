import { LEAGUE_ID, pairMatchups, teamNames, weekKey } from '../../lib/collector.mjs';
import { weekReading } from '../../lib/playoffs.mjs';
import { loadWeek, loadWeekKeys } from '../winprob/data';

const SLEEPER = `https://api.sleeper.app/v1/league/${LEAGUE_ID}`;

async function sleeperJson(path) {
  const res = await fetch(`${SLEEPER}${path}`);
  if (!res.ok) throw new Error(`${res.status} from Sleeper`);
  return res.json();
}

// The table and every regular-season week still to be scored.
export async function loadSeason() {
  const [league, rosters, users] = await Promise.all([sleeperJson(''), sleeperJson('/rosters'), sleeperJson('/users')]);
  const firstWeek = (league.settings.last_scored_leg ?? 0) + 1;
  const lastWeek = league.settings.playoff_week_start - 1;
  const weeks = [];
  for (let week = firstWeek; week <= lastWeek; week++) weeks.push(week);
  const schedule = await Promise.all(weeks.map(async (week) => ({
    week,
    pairs: pairMatchups(await sleeperJson(`/matchups/${week}`)),
  })));

  const names = teamNames(rosters, users);
  const teams = rosters.map((roster) => {
    const { wins = 0, losses = 0, ties = 0, fpts = 0, fpts_decimal: decimal = 0 } = roster.settings;
    return { id: roster.roster_id, name: names[roster.roster_id], wins, losses, ties, pointsFor: fpts + decimal / 100 };
  });
  return { teams, schedule, playoffSpots: league.settings.playoff_teams, season: league.season };
}

// The collector's latest reading for each unscored week it has recorded. Sleeper can move
// on to a new week before it scores the last one, so that can be more than one week.
export async function loadWeekReadings({ season, schedule }) {
  try {
    const recorded = new Set(await loadWeekKeys());
    const keys = schedule.map(({ week }) => weekKey(season, week)).filter((key) => recorded.has(key));
    return (await Promise.all(keys.map(loadWeek))).map(weekReading).filter(Boolean);
  } catch {
    return []; // the rest of the season can still be simulated from scoring averages
  }
}
