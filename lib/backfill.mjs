// Rebuilds a week the collector didn't record. Sleeper keeps only final scores, so each starter's
// score over time comes from ESPN's play-by-play, reconciled to Sleeper's final as the game runs.
import { espnProgress, pairMatchups, projectedPlayer, projectedPoints, round, shouldKeep } from './collector.mjs';
import { teamOutlook } from './model.mjs';
import {
  abbreviatedIndex, allowedTierPoints, findAbbreviated, NAME, parseDefense, parseSummary, parseText, pickStats, standingText, textCode,
} from './plays.mjs';

const READING_MS = 60 * 1000; // the collector's live cadence
const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);

const PASS_PLAY = new RegExp(`(${NAME}) pass\\b`);
const TARGET = new RegExp(`(?:\\bto|intended for) (${NAME})`);
const LEADING_NOTES = /^(?:\([^)]*\)\s*)+/;
const ELIGIBLE = /^.*?\breported in as eligible\.?\s*/;
const DIRECT_SNAP = new RegExp(`^Direct snap to ${NAME}\\.\\s*`);
const RUN = new RegExp(`^(${NAME}) `);
const YARDS = /\bfor (-?\d+) yards?\b|\bfor (no gain)\b/;
const NOT_A_RUN = /\b(?:sacked|punts|kicks|field goal|extra point|TWO-POINT|Timeout)\b/;
const FIELD_GOAL = new RegExp(`(${NAME}) (\\d+) yard field goal is (GOOD|No Good|Blocked)`, 'i');
const EXTRA_POINT = new RegExp(`(${NAME}) extra point is (GOOD|No Good|Blocked|Aborted)`, 'i');
const TWO_POINT = /TWO-POINT CONVERSION ATTEMPT\.?\s*(.*?)ATTEMPT SUCCEEDS/i;

const yardsIn = (text) => {
  const m = text.match(YARDS);
  return m ? Number(m[1] ?? 0) : null;
};

// A touchdown after a fumble can belong to the other team, so only one before it counts.
const scoredBeforeFumble = (text) => {
  const td = text.indexOf('TOUCHDOWN');
  const fumble = text.indexOf('FUMBLES');
  return td !== -1 && (fumble === -1 || td < fumble);
};

const fieldGoalBucket = (yards) => {
  if (yards < 20) return 'fgm_0_19';
  if (yards >= 60) return 'fgm_60p';
  const low = Math.floor(yards / 10) * 10;
  return `fgm_${low}_${low + 9}`;
};

// The stats each named player earned on one play. `kick` entries can be for either team, because
// the extra point after a defensive touchdown is on the offense's drive.
export function parseOffense(rawText) {
  const text = standingText(rawText ?? '')?.replace(LEADING_NOTES, '').replace(ELIGIBLE, '').replace(DIRECT_SNAP, '');
  if (!text) return [];
  const found = [];
  const add = (name, stats, kick = false) => found.push({ name, stats, kick });

  // A few plays only have the scoring summary's wording, with full names.
  const summary = parseText(text);
  if (summary?.how === 'pass') {
    add(summary.passer, { pass_att: 1, pass_cmp: 1, pass_yd: summary.yards, pass_td: 1 });
    add(summary.scorer, { rec: 1, rec_tgt: 1, rec_yd: summary.yards, rec_td: 1 });
    return found;
  }
  if (summary?.how === 'rush') {
    add(summary.scorer, { rush_att: 1, rush_yd: summary.yards, rush_td: 1 });
    return found;
  }

  const field = text.match(FIELD_GOAL);
  if (field) {
    const good = field[3].toLowerCase() === 'good';
    add(field[1], good ? { fgm: 1, fga: 1, [fieldGoalBucket(Number(field[2]))]: 1 } : { fga: 1, fgmiss: 1 }, true);
  }
  const extra = text.match(EXTRA_POINT);
  if (extra) add(extra[1], extra[2].toLowerCase() === 'good' ? { xpm: 1, xpa: 1 } : { xpa: 1, xpmiss: 1 }, true);

  const twoPoint = text.match(TWO_POINT)?.[1];
  if (twoPoint) {
    const passer = twoPoint.match(PASS_PLAY)?.[1];
    if (passer) {
      add(passer, { pass_2pt: 1 });
      const target = twoPoint.match(TARGET)?.[1];
      if (target) add(target, { rec_2pt: 1 });
    } else {
      const runner = twoPoint.match(RUN)?.[1];
      if (runner) add(runner, { rush_2pt: 1 });
    }
  }

  // The try has its own passes and runs, so the play itself is what comes before it.
  const play = text.split('TWO-POINT')[0];
  const passer = play.match(PASS_PLAY)?.[1];
  if (passer) {
    const target = play.match(TARGET)?.[1];
    const intercepted = /\bINTERCEPTED\b/.test(play);
    const yards = yardsIn(play);
    const caught = !intercepted && !/\bincomplete\b/i.test(play) && yards !== null;
    if (caught) {
      const td = scoredBeforeFumble(play);
      add(passer, { pass_att: 1, pass_cmp: 1, pass_yd: yards, ...(td ? { pass_td: 1 } : {}) });
      if (target) add(target, { rec: 1, rec_tgt: 1, rec_yd: yards, ...(td ? { rec_td: 1 } : {}) });
    } else {
      add(passer, { pass_att: 1, ...(intercepted ? { pass_int: 1 } : {}) });
      if (target) add(target, { rec_tgt: 1 });
    }
    return found;
  }

  // What follows a touchdown is the try, not the run.
  if (!NOT_A_RUN.test(play.split('TOUCHDOWN')[0])) {
    const runner = play.match(RUN)?.[1];
    const yards = yardsIn(play);
    if (runner && yards !== null) add(runner, { rush_att: 1, rush_yd: yards, ...(scoredBeforeFumble(play) ? { rush_td: 1 } : {}) });
  }
  return found;
}

// Every stat change in a game, for the players in `index` and the game's two defenses.
export function gameStatEvents(summary, index) {
  const codes = (summary.boxscore?.teams ?? []).map((side) => textCode(side.team.abbreviation));
  const events = [];
  for (const drive of summary.drives?.previous ?? []) {
    const offense = textCode(drive.team?.abbreviation);
    for (const play of drive.plays ?? []) {
      if (!play.wallclock) continue;
      const t = Date.parse(play.wallclock);
      for (const { name, stats, kick } of parseOffense(play.text)) {
        const teams = kick ? codes : [offense];
        const id = teams.map((team) => findAbbreviated(index, team, name)).find(Boolean);
        if (id) events.push({ t, id, stats });
      }
    }
  }
  const allowed = {};
  for (const play of parseDefense(summary)) {
    if (play.kind === 'PA') {
      const earlier = allowed[play.team] ?? 0;
      allowed[play.team] = play.allowed;
      events.push({ t: play.t, id: play.team, stats: { pts_allow: play.allowed - earlier } });
      continue;
    }
    if (play.kind === 'INT') events.push({ t: play.t, id: play.team, stats: { int: 1, ...(play.scored ? { def_td: 1 } : {}) } });
    if (play.kind === 'SACK') events.push({ t: play.t, id: play.team, stats: { sack: 1 } });
    if (play.kind === 'SAF') events.push({ t: play.t, id: play.team, stats: { safe: 1 } });
    if (play.kind === 'BLK') events.push({ t: play.t, id: play.team, stats: { blk_kick: 1 } });
    if (play.kind === 'FR') {
      events.push({ t: play.t, id: play.team, stats: { fum_rec: 1, ...(play.scored ? { def_td: 1 } : {}) } });
      const victim = play.victim && findAbbreviated(index, play.victimTeam, play.victim);
      if (victim) events.push({ t: play.t, id: victim, stats: { fum_lost: 1 } });
    }
  }
  for (const play of parseSummary(summary)) {
    if (play.how === 'kick-return') events.push({ t: play.t, id: play.team, stats: { def_st_td: 1 } });
  }
  return events;
}

// A team's progress through its game at each time, from the game clock on the play before it.
export function gameClockReader(summary) {
  const plays = (summary.drives?.previous ?? []).flatMap((d) => d.plays ?? [])
    .filter((p) => p.wallclock && p.period?.number)
    .map((p) => ({ t: Date.parse(p.wallclock), period: p.period.number, clock: p.clock?.displayValue ?? '0:00' }))
    .sort((x, y) => x.t - y.t);
  const first = plays[0]?.t ?? Infinity;
  const last = plays.at(-1)?.t ?? -Infinity;
  const seconds = (clock) => {
    const [m, s] = clock.split(':').map(Number);
    return m * 60 + (s || 0);
  };
  return {
    first,
    last,
    at(t) {
      if (t < first) return { progress: 0, live: false };
      if (t > last) return { progress: 1, live: false };
      const play = plays.findLast((p) => p.t <= t);
      return { progress: espnProgress({ type: { state: 'in' }, period: play.period, clock: seconds(play.clock) }), live: true };
    },
  };
}

const addStats = (into, stats) => {
  for (const [stat, value] of Object.entries(stats)) into[stat] = (into[stat] ?? 0) + value;
};

// A defense's points-allowed tier isn't settled until its game ends, and its projection already
// covers the rest of the game, so the tier comes in as the game runs instead of all at kickoff.
function parsedPoints(id, running, scoring, progress, isDefense) {
  const stats = running[id] ?? {};
  const points = projectedPoints(stats, scoring);
  return isDefense ? points + allowedTierPoints(scoring, stats.pts_allow ?? 0) * progress : points;
}

// The week in the same shape the collector saves, plus how close the plays came to Sleeper's finals.
export function buildWeek({ season, week, league, teams, entries, projections, finalStats, summaries }) {
  const scoring = league.scoring_settings;
  const rostered = new Set(entries.flatMap((e) => e.players ?? []));
  const players = {};
  for (const row of projections) if (rostered.has(row.player_id)) players[row.player_id] = projectedPlayer(row, scoring);
  const index = abbreviatedIndex(players);
  const isDefense = (id) => players[id]?.pos === 'DEF';

  const clocks = new Map();
  const events = [];
  const plays = {};
  for (const [id, summary] of Object.entries(summaries)) {
    const clock = gameClockReader(summary);
    for (const side of summary.boxscore?.teams ?? []) clocks.set(textCode(side.team.abbreviation), clock);
    events.push(...gameStatEvents(summary, index));
    const defense = parseDefense(summary);
    const final = (summary.scoringPlays ?? []).at(-1);
    plays[id] = { final: true, score: (final?.awayScore ?? 0) + (final?.homeScore ?? 0), plays: parseSummary(summary), defense };
  }
  events.sort((x, y) => x.t - y.t);

  // What the plays add up to, against what Sleeper finally paid. The gap is fed in as the game runs.
  const totals = {};
  for (const { id, stats } of events) addStats(totals[id] ??= {}, stats);
  const finals = new Map();
  for (const entry of entries) {
    (entry.starters ?? []).forEach((id, i) => finals.set(id, entry.starters_points?.[i] ?? 0));
  }
  const gaps = new Map([...finals].map(([id, final]) => [id, round(final - parsedPoints(id, totals, scoring, 1, isDefense(id)), 4)]));

  const starters = new Set(finals.keys());
  const running = {};
  const stats = {};
  const snapshots = [];
  const allClocks = [...new Set(clocks.values())];
  const start = Math.min(...allClocks.map((c) => c.first)) - READING_MS;
  const end = Math.max(...allClocks.map((c) => c.last)) + READING_MS;
  let next = 0;
  for (let t = start; t <= end + READING_MS; t += READING_MS) {
    let defenseChanged = false;
    while (next < events.length && events[next].t <= t) {
      const { id, stats: delta } = events[next];
      addStats(running[id] ??= {}, delta);
      if (isDefense(id) && starters.has(id)) defenseChanged = true;
      next += 1;
    }
    const gameProgress = {};
    let live = false;
    for (const [team, clock] of clocks) {
      const reading = clock.at(t);
      gameProgress[team] = round(reading.progress, 3);
      live ||= reading.live;
    }
    const readingTeams = {};
    for (const entry of entries) {
      const ids = entry.starters ?? [];
      const starterPoints = ids.map((id) => {
        const progress = gameProgress[players[id]?.team] ?? 0;
        return round(parsedPoints(id, running, scoring, progress, isDefense(id)) + (gaps.get(id) ?? 0) * progress);
      });
      const points = round(starterPoints.reduce((sum, p) => sum + p, 0));
      const { expected, variance } = teamOutlook({ points, starters: ids, players, gameProgress });
      readingTeams[entry.roster_id] = { points, expected: round(expected), variance: round(variance), starters: ids, starterPoints };
    }
    const snapshot = { t, live, games: gameProgress, teams: readingTeams };
    if (!shouldKeep(snapshot, snapshots.at(-1)) && !(live && defenseChanged)) continue;
    snapshots.push(snapshot);
    for (const id of starters) {
      const now = pickStats(running[id] ?? {});
      const history = stats[id] ?? [];
      if (Object.keys(now).length > 0 && JSON.stringify(history.at(-1)?.[1]) !== JSON.stringify(now)) stats[id] = [...history, [t, now]];
    }
  }
  // Box scores end on Sleeper's own numbers.
  for (const row of finalStats) {
    if (!starters.has(row.player_id)) continue;
    const final = pickStats(row.stats ?? {});
    if (Object.keys(final).length > 0) stats[row.player_id] = [...(stats[row.player_id] ?? []), [snapshots.at(-1).t, final]];
  }

  const doc = {
    season,
    week,
    reconstructed: true,
    teams,
    matchups: pairMatchups(entries),
    players,
    snapshots,
    slots: (league.roster_positions ?? []).filter((slot) => !BENCH_SLOTS.has(slot)),
    ptsAllowScoring: Object.fromEntries(Object.entries(scoring).filter(([stat]) => stat.startsWith('pts_allow_'))),
    plays,
    stats,
  };
  const accuracy = [...finals].filter(([id]) => players[id]).map(([id, final]) => ({
    id, name: players[id].name, pos: players[id].pos, final, gap: gaps.get(id), proj: players[id].proj,
  }));
  return { doc, accuracy };
}
