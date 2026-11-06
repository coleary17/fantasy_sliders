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
  return doc.snapshots
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
const IDLE_STEP_PX = 3; // between snapshots when no games are on
const BREAK_STEP_PX = 24; // where a game window starts or ends
const TICK_EVERY_MS = 60 * 60 * 1000;
const MIN_TICK_GAP_PX = 72;

// Time runs at a constant rate during games. Hours or days with no games
// collapse, so a Thursday-to-Monday week doesn't scroll through empty space.
export function layoutTimeline(snapshots) {
  let x = 0;
  const xs = snapshots.map((s, i) => {
    if (i > 0) {
      const prev = snapshots[i - 1];
      if (s.live && prev.live) x += ((s.t - prev.t) / 3_600_000) * PX_PER_HOUR;
      else if (s.live || prev.live) x += BREAK_STEP_PX;
      else x += IDLE_STEP_PX;
    }
    return x;
  });

  const ticks = [];
  let lastTickX = -Infinity;
  snapshots.forEach((s, i) => {
    const prev = snapshots[i - 1];
    const windowStart = s.live && !prev?.live;
    const hourChanged = prev && Math.floor(s.t / TICK_EVERY_MS) !== Math.floor(prev.t / TICK_EVERY_MS);
    if ((i === 0 || windowStart || (s.live && hourChanged)) && xs[i] - lastTickX >= MIN_TICK_GAP_PX) {
      ticks.push({ x: xs[i], t: s.t });
      lastTickX = xs[i];
    }
  });
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
