import { creditedPlayers, normalizeName, playerIndex } from '../../lib/plays.mjs';
import { shortPlayerName } from './data.js';

export const LABEL_WIDTH = 22;
export const LABEL_HEIGHT = 14;
const LABEL_GAP = 2;
const LABEL_STEP = LABEL_HEIGHT + LABEL_GAP;
const LABEL_OFFSET = 8; // room between the line and the first label

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

// Touchdowns and field goals by this matchup's starters, each pinned to the first reading
// at or after the play, which is where the line can first respond to it.
export function findScores(doc, series) {
  if (series.length === 0) return [];
  const index = playerIndex(doc.players);
  const plays = Object.values(doc.plays ?? {}).flatMap((game) => game.plays);
  return plays.flatMap((play) => {
    const after = series.findIndex((s) => s.t >= play.t);
    const at = after === -1 ? series.length - 1 : after;
    const point = series[at];
    const previous = series[Math.max(at - 1, 0)];
    const credited = creditedPlayers(play, index);
    return ['a', 'b'].flatMap((side) => {
      const ids = credited.filter((id) => point[side].starters.includes(id));
      if (ids.length === 0) return [];
      const share = (p) => (side === 'a' ? p : 1 - p);
      return [{
        key: `${play.id}-${side}`,
        t: point.t,
        index: at,
        playT: play.t,
        gameClock: gameClock(play),
        gainer: side,
        kind: play.kind,
        flipped: false,
        from: share(previous.probability),
        to: share(point.probability),
        title: scoreTitle(doc, play, ids, index),
      }];
    });
  }).sort((x, y) => x.playT - y.playT);
}

// One list for a matchup: every score, plus the swings no score explains.
export function keyMoments(events, scores) {
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
  if (has('sack', 'int', 'fum_rec', 'def_td', 'st_td', 'pts_allow')) {
    groups.push([
      ...(stats.sack ? [plural(stats.sack, 'sack')] : []),
      ...(stats.int ? [`${stats.int} INT`] : []),
      ...(stats.fum_rec ? [`${stats.fum_rec} FR`] : []),
      ...(has('def_td', 'st_td') ? [`${n('def_td') + n('st_td')} TD`] : []),
      `${n('pts_allow')} pts allowed`,
    ]);
  }
  if (stats.fum_lost) groups.push([`${stats.fum_lost} fum lost`]);
  return groups.length > 0 ? groups.map((g) => g.join(', ')).join(' · ') : null;
}
