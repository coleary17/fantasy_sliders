import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect, projectedPoints } from './collector.mjs';
import { normalCdf, teamOutlook, winProbability } from './model.mjs';

const memoryStore = () => {
  const data = new Map();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => data.set(k, structuredClone(v)) };
};

function fakeApi(game, { points = [10, 5], proj = 20 } = {}) {
  const routes = [
    ['state/nfl', { week: 9, season: '2026' }],
    ['/rosters', [{ roster_id: 1, owner_id: 'a' }, { roster_id: 2, owner_id: 'b' }]],
    ['/users', [{ user_id: 'a', metadata: { team_name: ' Alpha ' } }, { user_id: 'b', display_name: 'bravo' }]],
    ['/matchups/', [
      { roster_id: 1, matchup_id: 1, points: points[0], players: ['p1'], starters: ['p1'], starters_points: [points[0]] },
      { roster_id: 2, matchup_id: 1, points: points[1], players: ['p2'], starters: ['p2'], starters_points: [points[1]] },
    ]],
    ['scoreboard', { events: [{ competitions: [{ status: game, competitors: [{ team: { abbreviation: 'WSH' } }, { team: { abbreviation: 'DAL' } }] }] }] }],
    ['projections', [
      { player_id: 'p1', team: 'WAS', stats: { rec: 4, rec_yd: proj * 10 - 20 }, player: { position: 'WR', first_name: 'Ann', last_name: 'One' } },
      { player_id: 'p2', team: 'DAL', stats: { rec: 4, rec_yd: proj * 10 - 20 }, player: { position: 'WR' } },
    ]],
    ['/league/', { season: '2026', roster_positions: ['WR', 'BN', 'IR'], scoring_settings: { rec: 0.5, rec_yd: 0.1 } }],
  ];
  return async (url) => {
    const match = routes.find(([part]) => url.includes(part));
    if (!match) throw new Error(`unexpected ${url}`);
    return { ok: true, json: async () => match[1] };
  };
}

const status = (state, period = 0, clock = 0) => ({ type: { state }, period, clock });

test('normalCdf matches known values', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1) - 0.1587) < 1e-3);
});

test('finished games leave no uncertainty, and a decided matchup is 0 or 1', () => {
  const players = { x: { proj: 15, team: 'DAL', pos: 'WR' } };
  const done = teamOutlook({ points: 90, starters: ['x'], players, gameProgress: { DAL: 1 } });
  assert.deepEqual(done, { expected: 90, variance: 0 });
  assert.equal(winProbability(done, { expected: 80, variance: 0 }), 1);
  assert.equal(winProbability(done, { expected: 90, variance: 0 }), 0.5);
});

test('half a game remaining counts half the projection', () => {
  const players = { x: { proj: 20, team: 'DAL', pos: 'WR' } };
  const { expected, variance } = teamOutlook({ points: 10, starters: ['x'], players, gameProgress: { DAL: 0.5 } });
  assert.equal(expected, 20);
  assert.ok(Math.abs(variance - 7.25 ** 2 / 2) < 1e-9);
});

test('byes, empty slots and injured starters add no expected points or variance', () => {
  const players = { out: { proj: 0, team: 'DAL', pos: 'WR' } };
  const result = teamOutlook({ points: 5, starters: ['0', 'bye', 'out'], players, gameProgress: { DAL: 0 } });
  assert.deepEqual(result, { expected: 5, variance: 0 });
});

test('projections use league scoring, including only known numeric stats', () => {
  assert.equal(projectedPoints({ rec: 4, rec_yd: 50, ignored: 9, rush_td: 'x' }, { rec: 0.5, rec_yd: 0.1, rush_td: 6 }), 7);
});

test('collector maps ESPN codes, records live progress, and freezes projections at kickoff', async () => {
  const store = memoryStore();
  await collect({ store, now: () => 0, fetchImpl: fakeApi(status('pre')) });
  let doc = store.data.get('2026-w09');
  assert.deepEqual(doc.teams, { 1: 'Alpha', 2: 'bravo' });
  assert.deepEqual(doc.matchups, [[1, 2]]);
  assert.equal(doc.players.p1.proj, 20);
  assert.equal(doc.players.p1.name, 'Ann One');
  assert.deepEqual(doc.slots, ['WR']);
  assert.equal(doc.snapshots[0].teams[1].expected, 30);

  const second = await collect({ store, now: () => 1000, fetchImpl: fakeApi(status('in', 2, 450), { proj: 99 }) });
  doc = store.data.get('2026-w09');
  assert.equal(second.saved, true);
  const snap = doc.snapshots[1];
  assert.equal(snap.live, true);
  assert.equal(snap.games.WAS, 0.375);
  assert.equal(doc.players.p1.proj, 20, 'projection stays frozen once the game starts');
  assert.equal(snap.teams[1].expected, 22.5);
});

test('collector skips unchanged idle runs but records the transition to final', async () => {
  const store = memoryStore();
  await collect({ store, now: () => 0, fetchImpl: fakeApi(status('pre')) });
  const idle = await collect({ store, now: () => 1000, fetchImpl: fakeApi(status('pre')) });
  assert.equal(idle.saved, false);
  await collect({ store, now: () => 2000, fetchImpl: fakeApi(status('in', 4, 1)) });
  const final = await collect({ store, now: () => 3000, fetchImpl: fakeApi(status('post')) });
  assert.equal(final.saved, true);
  const last = store.data.get('2026-w09').snapshots.at(-1);
  assert.equal(last.live, false);
  assert.equal(last.teams[1].variance, 0);
});

test('collector refuses to record when no projections have ever loaded', async () => {
  const api = fakeApi(status('pre'));
  const fetchImpl = async (url) => {
    if (url.includes('projections')) return { ok: false, status: 500 };
    return api(url);
  };
  const store = memoryStore();
  await assert.rejects(collect({ store, now: () => 0, fetchImpl }));
  assert.equal(store.data.size, 0);
});

test('collector stores scoring plays and stat changes, and reads a finished game once', async () => {
  const api = fakeApi(status('in', 2, 450));
  const calls = { summary: 0 };
  let gameStatus = status('in', 2, 450);
  let rec = 3;
  const SCORED = { awayScore: 0, homeScore: 6 };
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url) => {
    if (url.includes('scoreboard')) {
      return reply({ events: [{ id: '77', competitions: [{ status: gameStatus, competitors: [{ score: '6', team: { abbreviation: 'WSH' } }, { score: '0', team: { abbreviation: 'DAL' } }] }] }] });
    }
    if (url.includes('summary?event=77')) {
      calls.summary += 1;
      return reply({
        scoringPlays: [{ ...SCORED, id: 's1', text: 'Ann One 9 Yd Rush (Kicker Kick)', team: { abbreviation: 'WSH' }, period: { number: 2 }, clock: { displayValue: '7:30' } }],
        drives: { previous: [{ plays: [{ id: 's1', wallclock: '2026-11-08T18:00:00Z' }] }] },
      });
    }
    if (url.includes('/stats/nfl/')) {
      return reply([
        { player_id: 'p1', stats: { rec, rec_yd: 40, pts_ppr: 9 } },
        { player_id: 'benched', stats: { rec: 9 } },
      ]);
    }
    return api(url);
  };

  const store = memoryStore();
  await collect({ store, now: () => 100, fetchImpl });
  await collect({ store, now: () => 200, fetchImpl }); // nothing changed
  rec = 4;
  await collect({ store, now: () => 300, fetchImpl });
  let doc = store.data.get('2026-w09');
  assert.equal(doc.plays['77'].final, false);
  assert.equal(calls.summary, 1, 'the summary is only read when the score changes');
  assert.equal(doc.plays['77'].plays[0].team, 'WAS');
  assert.deepEqual(doc.stats.p1, [[100, { rec: 3, rec_yd: 40 }], [300, { rec: 4, rec_yd: 40 }]]);
  assert.equal(doc.stats.benched, undefined);

  gameStatus = status('post');
  await collect({ store, now: () => 400, fetchImpl });
  const reads = calls.summary;
  await collect({ store, now: () => 500, fetchImpl });
  doc = store.data.get('2026-w09');
  assert.equal(doc.plays['77'].final, true);
  assert.equal(calls.summary, reads, 'a finished game is not read again');
});

test('collector still records a snapshot when ESPN summaries and stats fail', async () => {
  const api = fakeApi(status('in', 2, 450));
  const fetchImpl = async (url) => {
    if (url.includes('scoreboard')) {
      return { ok: true, json: async () => ({ events: [{ id: '77', competitions: [{ status: status('in', 2, 450), competitors: [{ score: '7', team: { abbreviation: 'WSH' } }] }] }] }) };
    }
    if (url.includes('summary') || url.includes('/stats/nfl/')) return { ok: false, status: 503 };
    return api(url);
  };
  const store = memoryStore();
  const result = await collect({ store, now: () => 0, fetchImpl });
  assert.equal(result.saved, true);
  assert.deepEqual(store.data.get('2026-w09').plays, {});
});

const liveGame = (score, summaryPoints = score) => {
  const api = fakeApi(status('in', 2, 450));
  const calls = { summary: 0 };
  const fetchImpl = async (url) => {
    if (url.includes('scoreboard')) {
      return { ok: true, json: async () => ({ events: [{ id: '77', competitions: [{ status: status('in', 2, 450), competitors: [{ score: String(score), team: { abbreviation: 'WSH' } }] }] }] }) };
    }
    if (url.includes('summary')) {
      calls.summary += 1;
      return { ok: true, json: async () => ({ scoringPlays: [{ id: 's', text: 'Ann One 9 Yd Rush', team: { abbreviation: 'WSH' }, awayScore: summaryPoints, homeScore: 0 }] }) };
    }
    return api(url);
  };
  return { fetchImpl, calls };
};

test('a summary behind the scoreboard is read again, and a live play with no time uses the run time', async () => {
  const store = memoryStore();
  const { fetchImpl, calls } = liveGame(6, 0);
  await collect({ store, now: () => 1000, fetchImpl });
  await collect({ store, now: () => 2000, fetchImpl });
  assert.equal(calls.summary, 2);
  assert.equal(store.data.get('2026-w09').plays['77'].plays[0].t, 2000);
});

test('a minute of small changes replaces the latest reading, and history keeps only some', async () => {
  const MIN = 60_000;
  const store = memoryStore();
  const run = (minute, points) => collect({ store, now: () => minute * MIN, fetchImpl: fakeApi(status('in', 2, 450), { points }) });
  const history = () => store.data.get('2026-w09').snapshots.map((s) => [s.t / MIN, s.teams[1].points, Boolean(s.latestOnly)]);

  await run(0, [10, 5]);
  await run(1, [11, 5]);
  await run(2, [12, 5]);
  assert.deepEqual(history(), [[0, 10, false], [2, 12, true]], 'the site always has the newest points');

  await run(3, [15, 5]);
  assert.deepEqual(history(), [[0, 10, false], [3, 15, false]], 'a big score stays in the history');

  await run(8, [15.5, 5]);
  assert.deepEqual(history(), [[0, 10, false], [3, 15, false], [8, 15.5, false]], 'so does a reading every 5 minutes');
});
