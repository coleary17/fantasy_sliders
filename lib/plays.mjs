// Scoring plays from ESPN's game summaries. ESPN's play types are unreliable (an own-fumble
// touchdown can be typed "Fumble Recovery (Own)"), so the wording of the play decides its kind.
export const ESPN_TEAM_CODES = { WSH: 'WAS' }; // ESPN code -> Sleeper code

const PASS = /^(.+?) (\d+) Yd pass from (.+)$/i;
const RUSH = /^(.+?) (\d+) Yd (?:Rush|Run)$/i;
const FIELD_GOAL = /^(.+?) (\d+) Yd Field Goal\b/i;
const RETURN_YARDS = /^(.+?) (\d+) Yd .*\b(?:return|recovery)\b/i;
const RETURN_NO_YARDS = /^(.+?) \w+(?: \w+)? Recovery in End Zone$/i;
const KICK_RETURN = /\b(?:punt|kickoff)\b/i; // these also score for the team's DEF slot

function parseText(rawText) {
  const text = rawText.replace(/\s*\(.*$/, '').trim(); // drops "(Cam Little Kick)"
  let m = text.match(FIELD_GOAL);
  if (m) return { kind: 'FG', how: 'kick', scorer: m[1], yards: Number(m[2]) };
  m = text.match(PASS);
  if (m) return { kind: 'TD', how: 'pass', scorer: m[1], yards: Number(m[2]), passer: m[3] };
  m = text.match(RUSH);
  if (m) return { kind: 'TD', how: 'rush', scorer: m[1], yards: Number(m[2]) };
  m = text.match(RETURN_YARDS);
  if (m) return { kind: 'TD', how: KICK_RETURN.test(text) ? 'kick-return' : 'return', scorer: m[1], yards: Number(m[2]) };
  m = text.match(RETURN_NO_YARDS);
  if (m) return { kind: 'TD', how: 'return', scorer: m[1], yards: 0 };
  return null; // safeties and defensive two-point returns aren't labeled
}

// The game's total points as of a summary's latest scoring play. The scoreboard can get ahead of it.
export function summaryPoints(summary) {
  return Math.max(0, ...(summary.scoringPlays ?? []).map((p) => (p.awayScore ?? 0) + (p.homeScore ?? 0)));
}

// Every touchdown and field goal in a summary. Timestamps only appear on the drive's copy of a
// play, which can lag during a game, so a live read passes a time to use until the final read.
export function parseSummary(summary, fallbackT = null) {
  const drives = [...(summary.drives?.previous ?? []), summary.drives?.current].filter(Boolean);
  const drivePlays = drives.flatMap((d) => d.plays ?? []);
  const times = new Map(drivePlays.map((p) => [p.id, p.wallclock]));
  return (summary.scoringPlays ?? []).flatMap((play) => {
    const parsed = parseText(play.text ?? '');
    const code = play.team?.abbreviation;
    const wallclock = times.get(play.id);
    const t = wallclock ? Date.parse(wallclock) : fallbackT;
    if (!parsed || !code || t === null) return [];
    return [{
      id: play.id,
      t,
      team: ESPN_TEAM_CODES[code] ?? code,
      period: play.period?.number ?? null,
      clock: play.clock?.displayValue ?? null,
      ...parsed,
    }];
  });
}

const SUFFIX = /\b(?:jr|sr|ii|iii|iv|v)\b/g;
export const normalizeName = (name) => name
  .toLowerCase()
  .replace(/[.'’-]/g, '')
  .replace(SUFFIX, '')
  .replace(/\s+/g, ' ')
  .trim();

// A lookup from team and name to Sleeper player id. Plays only carry names.
export function playerIndex(players) {
  const index = new Map();
  for (const [id, player] of Object.entries(players)) {
    if (player.name && player.pos !== 'DEF') index.set(`${player.team}:${normalizeName(player.name)}`, id);
  }
  return index;
}

// The Sleeper ids that scored on a play. Unrostered players simply don't appear.
export function creditedPlayers(play, index) {
  const find = (name) => index.get(`${play.team}:${normalizeName(name)}`);
  const scorer = find(play.scorer);
  const passer = play.passer && find(play.passer);
  const named = [passer, scorer].filter(Boolean);
  if (play.how === 'kick-return') return [...named, play.team];
  if (play.how === 'return') return scorer ? named : [play.team];
  return named;
}

// The box score fields worth showing. Everything else in Sleeper's stats is dropped.
const STAT_FIELDS = [
  'pass_cmp', 'pass_att', 'pass_yd', 'pass_td', 'pass_int',
  'rush_att', 'rush_yd', 'rush_td',
  'rec', 'rec_tgt', 'rec_yd', 'rec_td',
  'fum_lost',
  'fgm', 'fga', 'xpm', 'xpa',
  'sack', 'int', 'fum_rec', 'def_td', 'st_td', 'pts_allow',
];

export function pickStats(stats) {
  return Object.fromEntries(STAT_FIELDS.filter((f) => stats[f]).map((f) => [f, stats[f]]));
}
