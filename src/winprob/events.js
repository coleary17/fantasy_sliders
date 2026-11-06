import { shortPlayerName } from './data.js';

const BIG_GAIN_POINTS = 5; // about a touchdown at half-PPR
const BIG_LOSS_POINTS = -2; // about a turnover
const MIN_PLAY_SWING = 0.02; // a big play in a decided game isn't a key moment
const MIN_FLIP_SWING = 0.02; // ignores a line wobbling around 50%
const BIG_SWING = 0.1;
const MAX_GAP_MS = 30 * 60 * 1000; // over longer gaps, points can't be pinned to one moment
const FLIP_BONUS = 0.05;
const MAX_EVENTS = 8;

export function bigPlays(doc, before, after) {
  return after.starters.flatMap((id, i) => {
    const earlier = before.starters.indexOf(id);
    if (earlier === -1) return [];
    const gain = (after.starterPoints[i] ?? 0) - (before.starterPoints[earlier] ?? 0);
    if (gain < BIG_GAIN_POINTS && gain > BIG_LOSS_POINTS) return [];
    const player = doc.players[id];
    return [{ name: (player && shortPlayerName(player)) ?? player?.name ?? id, gain }];
  });
}

const formatGain = ({ name, gain }) => `${name} ${gain > 0 ? '+' : '−'}${Math.abs(gain).toFixed(1)}`;

// The moments that moved a matchup: new favorites, big swings, and the big plays behind them.
export function findEvents(doc, series) {
  const found = series.flatMap((point, index) => {
    if (index === 0) return [];
    const prev = series[index - 1];
    const swing = point.probability - prev.probability;
    const size = Math.abs(swing);
    const flipped = (prev.probability - 0.5) * (point.probability - 0.5) < 0 && size >= MIN_FLIP_SWING;
    const close = point.t - prev.t <= MAX_GAP_MS && (point.live || prev.live);
    const plays = close ? [...bigPlays(doc, prev.a, point.a), ...bigPlays(doc, prev.b, point.b)] : [];
    if (!flipped && size < BIG_SWING && !(plays.length > 0 && size >= MIN_PLAY_SWING)) return [];

    const gainer = swing >= 0 ? 'a' : 'b';
    const share = (p) => (gainer === 'a' ? p : 1 - p);
    return [{
      t: point.t,
      index,
      gainer,
      flipped,
      from: share(prev.probability),
      to: share(point.probability),
      title: plays.length > 0 ? plays.map(formatGain).join(', ') : 'Odds moved',
      rank: size + (flipped ? FLIP_BONUS : 0),
    }];
  });

  return found
    .sort((x, y) => y.rank - x.rank)
    .slice(0, MAX_EVENTS)
    .sort((x, y) => x.index - y.index);
}
