// Scoring plays from ESPN's game summaries. ESPN's play types are unreliable (an own-fumble
// touchdown can be typed "Fumble Recovery (Own)"), so the wording of the play decides its kind.
export const ESPN_TEAM_CODES = { WSH: 'WAS' }; // ESPN code -> Sleeper code

const PASS = /^(.+?) (\d+) Yd pass from (.+)$/i;
const RUSH = /^(.+?) (\d+) Yd (?:Rush|Run)$/i;
const FIELD_GOAL = /^(.+?) (\d+) Yd Field Goal\b/i;
const RETURN_YARDS = /^(.+?) (\d+) Yd .*\b(?:return|recovery)\b/i;
const RETURN_NO_YARDS = /^(.+?) \w+(?: \w+)? Recovery in End Zone$/i;
const KICK_RETURN = /\b(?:punt|kickoff)\b/i; // these also score for the team's DEF slot

export function parseText(rawText) {
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

// Play text has its own team codes: "BLT" where the rest of ESPN says BAL.
const PLAY_TEXT_CODES = { ...ESPN_TEAM_CODES, ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU', LA: 'LAR' };
export const textCode = (code) => PLAY_TEXT_CODES[code] ?? code;

export const NAME = "(?:[A-Z][a-z]{0,2}\\.)+[A-Z][\\w'-]*(?:\\.? [A-Z][a-z][\\w'-]*(?!\\.[A-Z]))?"; // J.Fagnano, Bry.Thomas, A.St. Brown
const INTERCEPTION = new RegExp(`\\bINTERCEPTED by (${NAME})`);
const PASSER = new RegExp(`(${NAME}) pass\\b`);
const SACK = new RegExp(`(${NAME}) sacked\\b[^(]*(?:\\((${NAME}))?`);
const RECOVERY = new RegExp(`(?:FUMBLES|MUFFS)\\b.*?RECOVERED by ([A-Z]{2,3})-(${NAME})`, 'g');
const ANY_NAME = new RegExp(NAME, 'g');
const KICKOFF = /\bkicks\b.*?\bfrom ([A-Z]{2,3}) \d+/;
const PUNT = /\bpunts\b/;
const BLOCKED_KICK = /\b(?:punt|field goal|extra point|kick)\b.*\bblocked\b/i;
const NO_PLAY = /\bno play\b|\bnullified\b/i;

// What stands after a review. A wiped-out play has no text left.
export function standingText(raw) {
  const text = raw.replace(/^.*\bREVERSED\.?/is, '').trim();
  return NO_PLAY.test(text) ? null : text;
}

// Whoever fumbled is the last player named before the fumble, leaving out tacklers in brackets.
function fumbler(text, recoveryIndex) {
  const before = text.slice(0, recoveryIndex).replace(/\([^)]*\)/g, '');
  return before.match(ANY_NAME)?.at(-1) ?? null;
}

function playsByDefense(text, offense, other) {
  const defense = other(offense);
  const found = [];
  const int = text.match(INTERCEPTION);
  if (int) found.push({ kind: 'INT', team: defense, victimTeam: offense, defender: int[1], victim: text.match(PASSER)?.[1] ?? null });
  const sack = text.match(SACK);
  if (sack) found.push({ kind: 'SACK', team: defense, victimTeam: offense, defender: sack[2] ?? null, victim: sack[1] });
  if (BLOCKED_KICK.test(text)) found.push({ kind: 'BLK', team: defense });

  // A return belongs to the team that didn't kick, whichever drive ESPN files it under.
  const kickoff = text.match(KICKOFF);
  const holder = kickoff ? other(textCode(kickoff[1])) : PUNT.test(text) ? defense : offense;
  for (const recovery of text.matchAll(RECOVERY)) {
    const recoverer = textCode(recovery[1]);
    if (recoverer !== other(holder)) continue; // an own recovery, or a code we don't know
    found.push({ kind: 'FR', team: recoverer, victimTeam: holder, defender: recovery[2], victim: fumbler(text, recovery.index) });
  }
  return found;
}

// Everything that moves a team's DEF score, from every play rather than only the scoring ones.
// `team` is the defense. `scored` marks a turnover returned for a touchdown, which already has its
// own label. PA entries record the points the defense has allowed after each score.
export function parseDefense(summary, fallbackT = null) {
  const sides = summary.boxscore?.teams ?? [];
  if (sides.length !== 2) return [];
  const codes = sides.map((side) => textCode(side.team.abbreviation));
  const other = (code) => (code === codes[0] ? codes[1] : codes[0]);
  const place = (play, wallclock, extra) => {
    const t = wallclock ? Date.parse(wallclock) : fallbackT;
    if (t === null) return [];
    const base = { t, period: play.period?.number ?? null, clock: play.clock?.displayValue ?? null };
    return extra.map((entry) => ({ ...base, ...entry, id: `${play.id}-${entry.kind}-${entry.team}` }));
  };

  const drives = [...(summary.drives?.previous ?? []), summary.drives?.current].filter(Boolean);
  const times = new Map();
  const offenseOf = new Map();
  const fromDrives = drives.flatMap((drive) => {
    const offense = textCode(drive.team?.abbreviation);
    return (drive.plays ?? []).flatMap((play) => {
      times.set(play.id, play.wallclock);
      offenseOf.set(play.id, offense);
      const text = standingText(play.text ?? '');
      if (!text || !codes.includes(offense)) return [];
      const entries = playsByDefense(text, offense, other).map((entry) => ({ ...entry, scored: Boolean(play.scoringPlay) }));
      return place(play, play.wallclock, entries);
    });
  });

  // Sleeper doesn't charge a defense for its own offense's giveaways: safeties and turnovers
  // returned for a touchdown. Kick returns and an offense recovering its own fumble do count.
  const notAllowed = { [codes[0]]: 0, [codes[1]]: 0 };
  const fromScores = (summary.scoringPlays ?? []).flatMap((play) => {
    const scorer = textCode(play.team?.abbreviation);
    if (!codes.includes(scorer)) return [];
    const text = play.text ?? '';
    const safety = /\bsafety\b/i.test(text);
    const how = parseText(text)?.how;
    if (safety) notAllowed[scorer] += 2;
    else if (how === 'return' && offenseOf.get(play.id) !== scorer) notAllowed[scorer] += 6;
    const isHome = sides[codes.indexOf(scorer)].homeAway === 'home';
    const total = (isHome ? play.homeScore : play.awayScore) ?? 0;
    const entries = [{ kind: 'PA', team: other(scorer), allowed: total - notAllowed[scorer] }];
    if (safety) entries.push({ kind: 'SAF', team: scorer });
    if (/\bPAT blocked\b/i.test(text)) entries.push({ kind: 'BLK', team: other(scorer) });
    return place(play, times.get(play.id), entries);
  });
  // A blocked extra point shows up on the drive and in the score's own wording.
  return [...new Map([...fromDrives, ...fromScores].map((entry) => [entry.id, entry])).values()];
}

// What a league pays a defense for the points it has allowed so far.
const ALLOWED_TIERS = [
  [0, 'pts_allow_0'], [6, 'pts_allow_1_6'], [13, 'pts_allow_7_13'], [20, 'pts_allow_14_20'],
  [27, 'pts_allow_21_27'], [34, 'pts_allow_28_34'], [Infinity, 'pts_allow_35p'],
];
export function allowedTierPoints(scoring, allowed) {
  return scoring[ALLOWED_TIERS.find(([most]) => allowed <= most)[1]] ?? 0;
}

// The Sleeper stats behind each kind of defensive play. Sleeper's counts settle which plays stand.
const DEFENSE_STATS = { INT: ['int'], SACK: ['sack'], FR: ['fum_rec', 'def_st_fum_rec'], SAF: ['safe'], BLK: ['blk_kick'] };
export const defenseStatCount = (stats, kind) => DEFENSE_STATS[kind].reduce((sum, field) => sum + (stats?.[field] ?? 0), 0);
export const DEFENSE_KINDS = Object.keys(DEFENSE_STATS);

const SUFFIX = /\b(?:jr|sr|ii|iii|iv|v)\b/g;
const SUFFIX_WORD = /\s+(?:jr|sr|ii|iii|iv|v)\.?$/i;
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

// Play-by-play abbreviates names, so it matches on first initial and last name.
const abbreviatedKey = (team, first, last) => `${team}:${first[0].toLowerCase()}:${normalizeName(last)}`;

export function abbreviatedIndex(players) {
  const index = new Map();
  for (const [id, player] of Object.entries(players)) {
    if (!player.name || player.pos === 'DEF') continue;
    const words = player.name.replace(SUFFIX_WORD, '').trim().split(/\s+/);
    index.set(abbreviatedKey(player.team, words[0], words.at(-1)), id);
  }
  return index;
}

export function findAbbreviated(index, team, name) {
  const last = name.split('.').at(-1).trim().split(' ').at(-1);
  return index.get(abbreviatedKey(team, name, last));
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
  'sack', 'int', 'fum_rec', 'def_st_fum_rec', 'safe', 'blk_kick', 'def_td', 'st_td', 'pts_allow',
];

export function pickStats(stats) {
  return Object.fromEntries(STAT_FIELDS.filter((f) => stats[f]).map((f) => [f, stats[f]]));
}
