import { winProbability } from '../../lib/model.mjs';

// The hosted site reads from the Netlify function. Local dev has no functions,
// so it falls back to the files written by scripts/collect-local.mjs.
async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

export async function loadWeekKeys() {
  try {
    return (await fetchJson('/api/wp')).keys;
  } catch {
    return (await fetchJson('/data/wp/index.json')).keys;
  }
}

export async function loadWeek(key) {
  try {
    return await fetchJson(`/api/wp?key=${encodeURIComponent(key)}`);
  } catch {
    return fetchJson(`/data/wp/${encodeURIComponent(key)}.json`);
  }
}

// One point per snapshot for a matchup. Probability is always for team A.
export function matchupSeries(doc, [a, b]) {
  return gameWindowSnapshots(doc.snapshots)
    .filter((s) => s.teams[a] && s.teams[b])
    .map((s) => ({
      t: s.t,
      live: s.live,
      a: s.teams[a],
      b: s.teams[b],
      probability: winProbability(s.teams[a], s.teams[b]),
    }));
}

export const matchupKey = (pair) => pair.join('-');

const SCORE_AXIS_STEP = 25;
const MIN_SCORE_AXIS = 50; // keeps a week that hasn't started from drawing a tiny scale

// The top of a matchup's score axis: the next round number at or above its highest score.
export function scoreAxisMax(series) {
  const high = Math.max(0, ...series.flatMap((s) => [s.a.points, s.b.points]));
  return Math.max(MIN_SCORE_AXIS, Math.ceil(high / SCORE_AXIS_STEP) * SCORE_AXIS_STEP);
}

// A score's height on that axis, from 0 to 1. A team just below zero sits on the baseline.
export const scoreShare = (points, axisMax) => Math.min(Math.max(points, 0) / axisMax, 1);

// The latest reading at or before a time. With no time, the latest reading overall.
export function indexAtTime(series, t) {
  if (t === null || t === undefined) return series.length - 1;
  let found = 0;
  series.forEach((s, i) => {
    if (s.t <= t) found = i;
  });
  return found;
}

export function shortPlayerName(player) {
  if (player.pos === 'DEF' || !player.name) return null;
  const [first, ...rest] = player.name.split(' ');
  return rest.length ? `${first[0]}. ${rest.join(' ')}` : null;
}

// Each pair passes the colorblind and contrast checks against the dark surface.
const MATCHUP_COLORS = [
  ['#3987e5', '#d95926'],
  ['#199e70', '#c98500'],
  ['#d55181', '#008300'],
  ['#9085e9', '#e66767'],
  ['#9085e9', '#c98500'],
];

// Matchup slot sets the colors, so a team keeps its color all week whatever the sort order.
export function matchupColors(doc, pair) {
  const slot = doc.matchups.findIndex((p) => matchupKey(p) === matchupKey(pair));
  return MATCHUP_COLORS[Math.max(slot, 0) % MATCHUP_COLORS.length];
}

// Most undecided first, judged at the latest update.
export function closestFirst(doc) {
  const closeness = (pair) => Math.abs((matchupSeries(doc, pair).at(-1)?.probability ?? 1) - 0.5);
  return [...doc.matchups]
    .sort((x, y) => closeness(x) - closeness(y))
    .map(matchupKey);
}

const PX_PER_HOUR = 90;
const BREAK_STEP_PX = 24; // the dotted jump between game windows
const MAX_LIVE_GAP_MS = 30 * 60 * 1000; // live readings further apart than this aren't one window
const TICK_EVERY_MS = 60 * 60 * 1000;
const MIN_TICK_GAP_PX = 72;

// True when two readings sit inside the same stretch of games.
export const inSameWindow = (prev, s) => prev.live && s.live && s.t - prev.t <= MAX_LIVE_GAP_MS;

// The chart only covers time when games are on. Between windows it keeps the reading
// where one ended and the one just before the next began, so a line change still shows.
// Before the first game of the week, only the latest reading matters.
export function gameWindowSnapshots(snapshots) {
  const firstLive = snapshots.findIndex((s) => s.live);
  return snapshots.filter((s, i) => {
    if (s.live || i === snapshots.length - 1) return true;
    if (firstLive === -1 || i < firstLive) return i === firstLive - 1;
    return snapshots[i - 1].live || snapshots[i + 1].live;
  });
}

// Time runs at a constant rate during games, and everything else is one short jump.
export function layoutTimeline(allSnapshots) {
  const snapshots = gameWindowSnapshots(allSnapshots);
  let x = 0;
  const xs = snapshots.map((s, i) => {
    if (i > 0) {
      const prev = snapshots[i - 1];
      x += inSameWindow(prev, s) ? ((s.t - prev.t) / 3_600_000) * PX_PER_HOUR : BREAK_STEP_PX;
    }
    return x;
  });

  const ticks = [];
  let lastTickX = -Infinity;
  snapshots.forEach((s, i) => {
    if (!s.live) return;
    const prev = snapshots[i - 1];
    const windowStart = !prev || !inSameWindow(prev, s);
    const hourChanged = prev && Math.floor(s.t / TICK_EVERY_MS) !== Math.floor(prev.t / TICK_EVERY_MS);
    if ((windowStart || hourChanged) && xs[i] - lastTickX >= MIN_TICK_GAP_PX) {
      ticks.push({ x: xs[i], t: s.t });
      lastTickX = xs[i];
    }
  });
  if (ticks.length === 0 && snapshots.length > 0) ticks.push({ x: 0, t: snapshots[0].t });
  return { xs, ticks, width: x };
}

const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
export const formatTime = (t) => timeFormat.format(t);
export const formatPercent = (p) => {
  const percent = p * 100;
  if (percent > 0 && percent < 1) return '<1%';
  if (percent < 100 && percent > 99) return '>99%';
  return `${Math.round(percent)}%`;
};
