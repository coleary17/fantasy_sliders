// Win probability model. Standard deviations are each position's error against
// Sleeper's projection, measured on this league's starters (2025 and 2026 weeks 1-8).
export const POSITION_SD = { QB: 7.6, RB: 7.5, WR: 7.25, TE: 6.1, K: 5.0, DEF: 6.3 };
const DEFAULT_SD = 7.25;
const MIN_ACTIVE_PROJECTION = 1; // below this a starter is effectively out

// Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF.
export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// Expected final score and its variance, given each starter's game progress.
export function teamOutlook({ points, starters, players, gameProgress }) {
  let expected = points;
  let variance = 0;
  for (const id of starters) {
    const player = players[id];
    if (!player) continue;
    const remaining = 1 - (gameProgress[player.team] ?? 1);
    if (remaining <= 0) continue;
    expected += player.proj * remaining;
    if (player.proj >= MIN_ACTIVE_PROJECTION) {
      const sd = POSITION_SD[player.pos] ?? DEFAULT_SD;
      variance += sd * sd * remaining;
    }
  }
  return { expected, variance };
}

// Probability that team A beats team B.
export function winProbability(a, b) {
  const variance = a.variance + b.variance;
  const margin = a.expected - b.expected;
  if (variance <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return normalCdf(margin / Math.sqrt(variance));
}
