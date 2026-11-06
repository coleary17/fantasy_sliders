import { ORIGINAL_LEAGUE_ID } from '../../lib/story/identity.mjs';

const positive = (value) => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

// Parse without consulting browser globals so links can be tested in Node.
export function parseStoryRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] !== 'story') return { kind: 'invalid' };
  if (parts.length === 1 || (parts.length === 2 && !parts[1])) return { kind: 'bare' };
  try {
    const values = parts.slice(1).map(decodeURIComponent);
    if (values.length <= 2) {
      const rosterId = positive(values[0]);
      const week = values.length === 2 ? positive(values[1]) : null;
      return rosterId && (values.length === 1 || week) ? { kind: 'legacy', rosterId, week } : { kind: 'invalid' };
    }
    const [leagueId, season, roster, weekValue] = values;
    const rosterId = positive(roster);
    const week = weekValue === undefined ? null : positive(weekValue);
    if (values.length > 4 || !leagueId || !/^\d{4}$/.test(season) || !rosterId || (weekValue !== undefined && !week)) return { kind: 'invalid' };
    return { kind: 'team', leagueId, season, rosterId, week };
  } catch {
    return { kind: 'invalid' };
  }
}

export function formatStoryRoute({ leagueId, season, rosterId, week }) {
  const parts = [leagueId, season, rosterId, ...(week ? [week] : [])];
  return `#/story/${parts.map((part) => encodeURIComponent(String(part))).join('/')}`;
}

export function resolveStoryRoute(route, catalog) {
  if (route.kind === 'team' || route.kind === 'invalid') return route;
  const leagues = catalog?.leagues || [];
  if (route.kind === 'legacy') {
    const league = leagues.filter((item) => item.leagueId === ORIGINAL_LEAGUE_ID).sort((a, b) => b.season.localeCompare(a.season))[0];
    return league ? { kind: 'team', leagueId: league.leagueId, season: league.season, rosterId: route.rosterId, week: route.week } : { kind: 'invalid' };
  }
  const league = [...leagues].sort((a, b) => Number(b.leagueId === ORIGINAL_LEAGUE_ID) - Number(a.leagueId === ORIGINAL_LEAGUE_ID) || b.season.localeCompare(a.season)).find((item) => item.teams.some((team) => team.available));
  const team = league?.teams.find((item) => item.available);
  return team ? { kind: 'team', leagueId: league.leagueId, season: league.season, rosterId: team.rosterId, week: null } : { kind: 'empty' };
}
