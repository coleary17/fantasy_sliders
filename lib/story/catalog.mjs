// Build the local reader catalog from filenames and saved league metadata.
import { legacyStoryKey, normalizeStoryIdentity, ORIGINAL_LEAGUE_ID, storyKey, validateStoryDocument } from './identity.mjs';

export function buildStoryCatalog({ stories = [], weeks = [], previous = null, refreshed = null } = {}) {
  const leagues = new Map();
  const warnings = [];
  function group(leagueId, season) {
    const key = JSON.stringify([leagueId, season]);
    if (!leagues.has(key)) leagues.set(key, { leagueId, season, teams: new Map() });
    return leagues.get(key);
  }
  function metadata(leagueId, season, teams) {
    for (const [id, value] of Object.entries(teams ?? {})) {
      const name = typeof value === 'string' ? value : value?.team;
      try {
        const identity = normalizeStoryIdentity({ leagueId, season, rosterId: id });
        if (typeof name !== 'string' || !name.trim()) continue;
        const entries = group(identity.leagueId, identity.season).teams;
        entries.set(identity.rosterId, { ...(entries.get(identity.rosterId) ?? {}), rosterId: identity.rosterId, team: name, weeks: [], available: false });
      } catch { /* Ignore malformed metadata. */ }
    }
  }
  for (const league of Array.isArray(previous?.leagues) ? previous.leagues : []) {
    if (!league || !Array.isArray(league.teams)) continue;
    metadata(league.leagueId, league.season, Object.fromEntries(league.teams.filter((t) => t && typeof t === 'object').map((t) => [t.rosterId, t.team])));
  }
  for (const week of [...weeks].sort((a, b) => (a.week ?? 0) - (b.week ?? 0))) metadata(ORIGINAL_LEAGUE_ID, week.season, week.teams);
  if (refreshed) metadata(refreshed.leagueId, refreshed.season, refreshed.teams);

  const chosen = new Map();
  for (const { key, document, error } of stories) {
    if (['index', 'catalog', 'players', 'output'].includes(key)) continue;
    const match = key.match(/^(?:(.+)-)?(\d{4})-r(\d+)$/);
    if (!match) { warnings.push(`${key}.json: unrecognized story filename; skipped`); continue; }
    let identity;
    try {
      identity = normalizeStoryIdentity({ leagueId: match[1] ? decodeURIComponent(match[1]) : ORIGINAL_LEAGUE_ID, season: match[2], rosterId: match[3].replace(/^0+/, '') });
    } catch { warnings.push(`${key}.json: invalid identity; skipped`); continue; }
    const scoped = key === storyKey(identity);
    const legacy = identity.leagueId === ORIGINAL_LEAGUE_ID && key === legacyStoryKey(identity);
    if (!scoped && !legacy) { warnings.push(`${key}.json: noncanonical filename; skipped`); continue; }
    const problems = error ? [error] : validateStoryDocument(document, identity, { allowLegacy: legacy });
    if (problems.length) warnings.push(`${key}.json: ${problems.join(' ')}; skipped`);
    const id = JSON.stringify(identity);
    if (!chosen.has(id) || scoped) chosen.set(id, { identity, document: problems.length ? null : document, scoped });
  }
  for (const { identity, document } of chosen.values()) {
    if (!document) continue;
    const entries = group(identity.leagueId, identity.season).teams;
    const existing = entries.get(identity.rosterId);
    entries.set(identity.rosterId, {
      rosterId: identity.rosterId, team: existing?.team ?? document.team,
      weeks: document.chapters.map((chapter) => chapter.week).sort((a, b) => a - b), available: true,
      ...(document.promptVersion == null ? {} : { promptVersion: document.promptVersion }),
    });
  }
  return {
    catalog: { version: 1, leagues: [...leagues.values()].map((league) => ({ ...league, teams: [...league.teams.values()].sort((a, b) => a.rosterId - b.rosterId) })).sort((a, b) => a.leagueId.localeCompare(b.leagueId) || a.season.localeCompare(b.season)) },
    warnings,
  };
}
