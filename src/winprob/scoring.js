import { abbreviatedIndex, allowedTierPoints, creditedPlayers, defenseStatCount, DEFENSE_KINDS, findAbbreviated, normalizeName, playerIndex } from '../../lib/plays.mjs';
import { shortPlayerName } from './data.js';

export const LABEL_WIDTH = 22;
export const LABEL_HEIGHT = 14;
const LABEL_GAP = 2;
const LABEL_STEP = LABEL_HEIGHT + LABEL_GAP;
const LABEL_OFFSET = 8; // room between the line and the first label
const MIN_SACK_SWING = 0.02; // a sack earns a line in the list only if the odds noticed it
const MIN_TIER_DROP = 2; // smaller drops between points-allowed tiers would mark nearly every score

function creditName(doc, id, team) {
  if (id === team) return `${team} DEF`;
  const player = doc.players[id];
  return (player && shortPlayerName(player)) ?? player?.name ?? id;
}

function scoreTitle(doc, play, ids, index) {
  const names = ids.map((id) => creditName(doc, id, play.team));
  const yards = play.yards > 0 ? `${play.yards} yd ` : '';
  if (play.kind === 'FG') return `${names[0]} ${yards}FG`;
  if (play.how === 'rush') return `${names[0]} ${yards}TD run`;
  if (play.how === 'pass') {
    if (ids.length === 2) return `${names[0]} to ${names[1]}, ${yards}TD`;
    const threw = ids[0] === index.get(`${play.team}:${normalizeName(play.passer)}`);
    return `${names[0]} ${yards}TD ${threw ? 'pass' : 'catch'}`;
  }
  return `${names.join(', ')} ${yards}TD return`;
}

function gameClock(play) {
  if (!play.period) return null;
  const period = play.period > 4 ? 'OT' : `Q${play.period}`;
  return play.clock ? `${period} ${play.clock}` : period;
}

// A play pinned to the first reading at or after it, which is where the line can first respond.
function pinned(series, play) {
  const after = series.findIndex((s) => s.t >= play.t);
  const index = after === -1 ? series.length - 1 : after;
  return { index, point: series[index], previous: series[Math.max(index - 1, 0)] };
}

function moment(play, { index, point, previous }, gainer, title, extra = {}) {
  const share = (p) => (gainer === 'a' ? p : 1 - p);
  return {
    key: `${play.id}-${gainer}`,
    t: point.t,
    index,
    playT: play.t,
    gameClock: gameClock(play),
    gainer,
    kind: play.kind,
    flipped: false,
    from: share(previous.probability),
    to: share(point.probability),
    title,
    ...extra,
  };
}

const opposite = (side) => (side === 'a' ? 'b' : 'a');
const spaced = (name) => name.replace(/\.(?=[^.]*$)/, '. '); // J.Fagnano -> J. Fagnano

function defenseTitle({ kind, team, defender, victim }) {
  const by = defender && `${spaced(defender)} `;
  if (kind === 'INT') return `${team} DEF: ${by ?? ''}INT${victim ? ` off ${spaced(victim)}` : ''}`;
  if (kind === 'FR') return `${team} DEF: ${by ?? ''}fumble recovery`;
  if (kind === 'SACK') return `${team} DEF: ${by ?? ''}sack${victim ? ` of ${spaced(victim)}` : ''}`;
  if (kind === 'SAF') return `${team} DEF safety`;
  return `${team} DEF blocked kick`;
}

// ESPN can run ahead of Sleeper during a game, so a live play stands until its game is final.
// After that, Sleeper's count decides, keeping the earliest plays of each kind.
function standingDefense(doc, game) {
  const plays = game.defense ?? [];
  if (!game.final) return plays;
  const seen = new Map();
  return plays.filter((play) => {
    const stats = doc.stats?.[play.team]?.at(-1)?.[1];
    if (!stats || !DEFENSE_KINDS.includes(play.kind)) return true;
    const key = `${play.team}:${play.kind}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    return seen.get(key) <= defenseStatCount(stats, play.kind);
  });
}

// A turnover helps the defense's owner and hurts the owner of whoever gave it up, which can be
// the same team. A turnover returned for a touchdown already has a label on the defense's side.
function turnoverMoments(series, play, index) {
  const pin = pinned(series, play);
  const defended = ['a', 'b'].find((side) => pin.point[side].starters.includes(play.team));
  const victimId = play.victim ? findAbbreviated(index, play.victimTeam, play.victim) : null;
  const victimSide = victimId && ['a', 'b'].find((side) => pin.point[side].starters.includes(victimId));
  const gains = new Map();
  if (victimSide && play.kind !== 'SACK') {
    const name = spaced(play.victim);
    gains.set(opposite(victimSide), play.kind === 'INT' ? `${name} throws INT` : `${name} loses a fumble`);
  }
  if (defended && !play.scored) gains.set(defended, defenseTitle(play));
  return [...gains].map(([gainer, title]) => moment(play, pin, gainer, title, play.kind === 'SACK' ? { minor: true } : {}));
}

// Scores that cost a starting defense a points-allowed tier. The label sits with the other team,
// whose odds the score helps.
function tierDropMoments(doc, series, plays) {
  const scoring = doc.ptsAllowScoring;
  if (!scoring || Object.keys(scoring).length === 0) return [];
  const before = new Map();
  return plays.filter((p) => p.kind === 'PA').sort((x, y) => x.allowed - y.allowed).flatMap((play) => {
    const earlier = before.get(play.team) ?? 0;
    before.set(play.team, play.allowed);
    const drop = allowedTierPoints(scoring, earlier) - allowedTierPoints(scoring, play.allowed);
    if (drop < MIN_TIER_DROP) return [];
    const pin = pinned(series, play);
    const owner = ['a', 'b'].find((side) => pin.point[side].starters.includes(play.team));
    if (!owner) return [];
    return [moment(play, pin, opposite(owner), `${play.team} DEF −${drop} pts: ${play.allowed} allowed`, { negative: true })];
  });
}

function defenseMoments(doc, series) {
  const index = abbreviatedIndex(doc.players);
  return Object.values(doc.plays ?? {}).flatMap((game) => {
    const plays = standingDefense(doc, game);
    return [
      ...plays.filter((p) => p.kind !== 'PA').flatMap((play) => turnoverMoments(series, play, index)),
      ...tierDropMoments(doc, series, plays),
    ];
  });
}

// Touchdowns, field goals and defensive plays involving this matchup's starters.
export function findScores(doc, series) {
  if (series.length === 0) return [];
  const index = playerIndex(doc.players);
  const plays = Object.values(doc.plays ?? {}).flatMap((game) => game.plays);
  const scores = plays.flatMap((play) => {
    const pin = pinned(series, play);
    const credited = creditedPlayers(play, index);
    return ['a', 'b'].flatMap((side) => {
      const ids = credited.filter((id) => pin.point[side].starters.includes(id));
      return ids.length > 0 ? [moment(play, pin, side, scoreTitle(doc, play, ids, index))] : [];
    });
  });
  return [...scores, ...defenseMoments(doc, series)].sort((x, y) => x.playT - y.playT);
}

// One list for a matchup: every score, plus the swings no score explains.
export function keyMoments(events, allScores) {
  const scores = allScores.filter((s) => !s.minor || s.to - s.from >= MIN_SACK_SWING);
  const explained = (event) => scores.some((s) => s.index === event.index && s.gainer === event.gainer);
  const flips = new Set(events.filter((e) => e.flipped).map((e) => `${e.index}-${e.gainer}`));
  const swings = events.filter((e) => !explained(e)).map((e) => ({ ...e, key: `swing-${e.t}` }));
  const labeled = scores.map((s) => ({ ...s, flipped: flips.has(`${s.index}-${s.gainer}`) }));
  return [...labeled, ...swings].sort((x, y) => x.index - y.index || (x.playT ?? x.t) - (y.playT ?? y.t));
}

// Places chart labels beside the line, stacking any that would overlap. A stack that runs out
// of room at the edge of the plot continues back past the line, so labels never leave the chart.
export function layoutScoreLabels(scores, points, top, bottom) {
  const laneEnds = { a: [], b: [] };
  const lowest = bottom - LABEL_HEIGHT;
  return [...scores].sort((x, y) => x.index - y.index).map((score) => {
    const { x, y: lineY } = points[score.index];
    const ends = laneEnds[score.gainer];
    const free = ends.findIndex((end) => end + LABEL_GAP <= x - LABEL_WIDTH / 2);
    const level = free === -1 ? ends.length : free;
    ends[level] = x + LABEL_WIDTH / 2;

    let y;
    if (score.gainer === 'a') {
      const base = Math.max(lineY - LABEL_OFFSET - LABEL_HEIGHT, top);
      const room = Math.floor((base - top) / LABEL_STEP) + 1;
      y = level < room ? base - level * LABEL_STEP : base + (level - room + 1) * LABEL_STEP;
    } else {
      const base = Math.min(lineY + LABEL_OFFSET, lowest);
      const room = Math.floor((lowest - base) / LABEL_STEP) + 1;
      y = level < room ? base + level * LABEL_STEP : base - (level - room + 1) * LABEL_STEP;
    }
    return { ...score, x, lineY, y };
  });
}

// A player's box score at a time. With no time, the latest one.
export function statsAt(doc, id, t) {
  const history = doc.stats?.[id];
  if (!history) return null;
  if (t === null) return history.at(-1)[1];
  return history.findLast(([at]) => at <= t)?.[1] ?? null;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatStatLine(stats) {
  if (!stats) return null;
  const has = (...fields) => fields.some((f) => stats[f]);
  const n = (field) => stats[field] ?? 0;
  const tds = (field) => (stats[field] ? [`${stats[field]} TD`] : []);
  const groups = [];
  if (has('pass_att')) {
    groups.push([`${n('pass_cmp')}/${n('pass_att')} pass`, `${n('pass_yd')} yd`, ...tds('pass_td'), ...(stats.pass_int ? [`${stats.pass_int} INT`] : [])]);
  }
  if (has('rush_att')) groups.push([`${n('rush_att')} car`, `${n('rush_yd')} yd`, ...tds('rush_td')]);
  if (has('rec', 'rec_tgt')) groups.push([`${n('rec')}/${n('rec_tgt')} rec`, `${n('rec_yd')} yd`, ...tds('rec_td')]);
  if (has('fga', 'xpa')) groups.push([`${n('fgm')}/${n('fga')} FG`, `${n('xpm')}/${n('xpa')} XP`]);
  if (has('sack', 'int', 'fum_rec', 'def_st_fum_rec', 'safe', 'blk_kick', 'def_td', 'st_td', 'pts_allow')) {
    groups.push([
      ...(stats.sack ? [plural(stats.sack, 'sack')] : []),
      ...(stats.int ? [`${stats.int} INT`] : []),
      ...(has('fum_rec', 'def_st_fum_rec') ? [`${n('fum_rec') + n('def_st_fum_rec')} FR`] : []),
      ...(stats.safe ? [plural(stats.safe, 'safety').replace('safetys', 'safeties')] : []),
      ...(stats.blk_kick ? [`${stats.blk_kick} blocked`] : []),
      ...(has('def_td', 'st_td') ? [`${n('def_td') + n('st_td')} TD`] : []),
      `${n('pts_allow')} pts allowed`,
    ]);
  }
  if (stats.fum_lost) groups.push([`${stats.fum_lost} fum lost`]);
  return groups.length > 0 ? groups.map((g) => g.join(', ')).join(' · ') : null;
}
