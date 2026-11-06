import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeek, checkWeek, gameClockReader, parseOffense, repairPlayTimes } from './backfill.mjs';

const statsOf = (text) => Object.fromEntries(parseOffense(text).map((p) => [p.name, p.stats]));

test('catches, incompletions and picks credit the passer and target', () => {
  assert.deepEqual(statsOf('(Shotgun) B.Young pass short middle to J.Coker to GB 48 for 9 yards (E.Williams).'), {
    'B.Young': { pass_att: 1, pass_cmp: 1, pass_yd: 9 },
    'J.Coker': { rec: 1, rec_tgt: 1, rec_yd: 9 },
  });
  assert.deepEqual(statsOf('B.Young pass short middle to C.Hubbard to GB 15 for no gain (T.Hopper).')['C.Hubbard'].rec_yd, 0);
  assert.deepEqual(statsOf('B.Young pass incomplete short left to J.Coker (B.Cisse).'), {
    'B.Young': { pass_att: 1 },
    'J.Coker': { rec_tgt: 1 },
  });
  assert.deepEqual(statsOf('B.Young pass short left intended for J.Coker INTERCEPTED by T.Hopper at CAR 44. T.Hopper to CAR 43 for 1 yard (J.Coker).'), {
    'B.Young': { pass_att: 1, pass_int: 1 },
    'J.Coker': { rec_tgt: 1 },
  });
});

test('runs are read past notes, eligibility reports and direct snaps, ignoring the kick after', () => {
  assert.deepEqual(statsOf('(Shotgun) D.Swift left guard to SEA 4 for -1 yards (D.Hall).PENALTY on SEA-N.Emmanwori, Unnecessary Roughness, 2 yards, enforced at SEA 4.')['D.Swift'], { rush_att: 1, rush_yd: -1 });
  const touchdown = statsOf('S.Anderson reported in as eligible.  R.Dowdle right guard for 9 yards, TOUCHDOWN. C.Boswell extra point is GOOD, Center-C.Kuntz.');
  assert.deepEqual(touchdown['R.Dowdle'], { rush_att: 1, rush_yd: 9, rush_td: 1 });
  assert.deepEqual(touchdown['C.Boswell'], { xpm: 1, xpa: 1 });
  assert.equal(touchdown['S.Anderson'], undefined);
  assert.deepEqual(statsOf('F.Johnson and W.Lampkin reported in as eligible. Direct snap to S.Barkley.  S.Barkley right end for 3 yards, TOUCHDOWN.')['S.Barkley'].rush_td, 1);
});

test('a failed two-point try leaves the touchdown standing, and a good one scores', () => {
  const failed = statsOf('J.Allen pass short left to D.Moore for 11 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Allen pass to J.Hawes is incomplete. ATTEMPT FAILS.');
  assert.deepEqual(failed['D.Moore'], { rec: 1, rec_tgt: 1, rec_yd: 11, rec_td: 1 });
  const good = statsOf('T.Pollard left end for 1 yard, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. C.Ward rushes left end. ATTEMPT SUCCEEDS.');
  assert.deepEqual(good['C.Ward'], { rush_2pt: 1 });
  assert.equal(good['T.Pollard'].rush_td, 1);
});

test('kicks fall into the league scoring buckets', () => {
  assert.deepEqual(statsOf('C.Little 45 yard field goal is GOOD, Center-R.Matiscik.')['C.Little'], { fgm: 1, fga: 1, fgm_40_49: 1 });
  assert.deepEqual(statsOf('C.Little 63 yard field goal is GOOD.')['C.Little'].fgm_60p, 1);
  assert.deepEqual(statsOf('C.Little 52 yard field goal is No Good, Wide Right.')['C.Little'], { fga: 1, fgmiss: 1 });
});

test('wiped-out plays earn nothing, and summary wording still counts', () => {
  assert.deepEqual(parseOffense('J.Burrow pass deep right to C.Brown for 20 yards, TOUCHDOWN NULLIFIED by Penalty.PENALTY on CIN-D.Fairchild.'), []);
  assert.deepEqual(statsOf('Jalen Coker 26 Yd pass from Bryce Young (Two-Point Pass Conversion Failed)')['Jalen Coker'], { rec: 1, rec_tgt: 1, rec_yd: 26, rec_td: 1 });
});

const at = (minute) => new Date(Date.UTC(2026, 9, 25, 17, minute)).toISOString();
const play = (id, minute, period, clock, text, extra = {}) => ({
  id, text, wallclock: at(minute), period: { number: period }, clock: { displayValue: clock }, ...extra,
});
const summary = {
  boxscore: { teams: [{ homeAway: 'away', team: { abbreviation: 'JAX' } }, { homeAway: 'home', team: { abbreviation: 'BAL' } }] },
  drives: { previous: [{
    team: { abbreviation: 'JAX' },
    plays: [
      play('1', 0, 1, '15:00', 'T.Hunter left end to BLT 40 for 10 yards.'),
      play('2', 30, 2, '15:00', 'T.Lawrence pass short left to T.Hunter for 20 yards, TOUCHDOWN.'),
      play('3', 60, 4, '0:00', 'End Game'),
    ],
  }] },
  scoringPlays: [{ id: '2', text: 'Travis Hunter 20 Yd pass from Trevor Lawrence', team: { abbreviation: 'JAX' }, homeScore: 0, awayScore: 6 }],
};
const week = () => buildWeek({
  season: '2026',
  week: 8,
  league: { scoring_settings: { rec_td: 6, rec_yd: 0.1, rec: 0.5, rush_yd: 0.1, pts_allow_1_6: 7 }, roster_positions: ['WR', 'BN'] },
  teams: { 1: 'One', 2: 'Two' },
  entries: [
    { roster_id: 1, matchup_id: 1, players: ['h', 'x'], starters: ['h'], starters_points: [12], points: 12 },
    { roster_id: 2, matchup_id: 1, players: ['BAL'], starters: ['BAL'], starters_points: [7], points: 7 },
  ],
  projections: [
    { player_id: 'h', team: 'JAX', stats: { rec: 4, rec_yd: 50 }, player: { position: 'WR', first_name: 'Travis', last_name: 'Hunter' } },
    { player_id: 'BAL', team: 'BAL', stats: {}, player: { position: 'DEF' } },
  ],
  finalStats: [{ player_id: 'h', stats: { rec: 1, rec_yd: 20, rec_td: 1, rush_att: 1, rush_yd: 11 } }],
  summaries: { g: summary },
});

test('a rebuilt week ends on Sleeper finals, with the gap spread over the game', () => {
  const { doc, accuracy } = week();
  const last = doc.snapshots.at(-1);
  assert.equal(doc.reconstructed, true);
  assert.equal(last.teams[1].points, 12);
  assert.equal(last.teams[2].points, 7);
  assert.equal(last.live, false);
  assert.equal(last.games.JAX, 1);
  const hunter = accuracy.find((a) => a.id === 'h');
  assert.ok(Math.abs(hunter.gap - (12 - 9.5)) < 1e-9, 'the plays explain 9.5 of the 12');
  const midGame = doc.snapshots.find((s) => s.live && s.games.JAX >= 0.25 && s.t > Date.parse(at(30)));
  assert.ok(midGame.teams[1].points > 9.5 && midGame.teams[1].points < 12);
});

test('a rebuilt week starts before kickoff and carries plays and a box score for its starters', () => {
  const { doc } = week();
  assert.equal(doc.snapshots[0].teams[1].points, 0);
  assert.equal(doc.snapshots[0].live, false);
  assert.deepEqual(doc.matchups, [[1, 2]]);
  assert.equal(doc.plays.g.plays[0].kind, 'TD');
  assert.equal(doc.stats.h.at(-1)[1].rush_yd, 11, 'the box score ends on Sleeper numbers');
  assert.deepEqual(doc.slots, ['WR']);
  const times = doc.snapshots.map((s) => s.t);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('game progress follows the clock, and only counts as live between the first and last plays', () => {
  const clock = gameClockReader(summary);
  assert.deepEqual(clock.at(Date.parse(at(0)) - 1), { progress: 0, live: false });
  assert.deepEqual(clock.at(Date.parse(at(30))), { progress: 0.25, live: true });
  assert.deepEqual(clock.at(Date.parse(at(61))), { progress: 1, live: false });
});

test('a play stamped a day late takes the time of the play before it', () => {
  const late = { ...play('4', 60, 4, '0:30', 'x'), wallclock: new Date(Date.parse(at(60)) + 86_400_000).toISOString() };
  const broken = { ...summary, drives: { previous: [{ ...summary.drives.previous[0], plays: [...summary.drives.previous[0].plays, late] }] } };
  const repaired = repairPlayTimes(broken).drives.previous[0].plays;
  assert.equal(repaired.at(-1).wallclock, at(60));
  assert.equal(repaired[1].wallclock, at(30), 'good times are left alone');
  const clock = gameClockReader(repairPlayTimes(broken));
  assert.equal(clock.last, Date.parse(at(60)));
});

test('a week fails its checks on wrong finals, an overlong game, or a high average miss', () => {
  const entries = [{ roster_id: 1, points: 12 }, { roster_id: 2, points: 7 }];
  const built = { ...week(), accuracy: [{ id: 'h', gap: 0.1, final: 12, proj: 9 }] };
  assert.deepEqual(checkWeek(built, entries).failures, []);
  assert.deepEqual(checkWeek(built, [{ roster_id: 1, points: 13 }, { roster_id: 2, points: 7 }]).failures, ['1 final scores differ from Sleeper']);
  const overlong = checkWeek({ ...built, longestGameMs: 6 * 3_600_000 }, entries);
  assert.ok(overlong.failures.some((f) => f.includes('6.0 hours')));
  const missed = checkWeek({ ...built, accuracy: [{ id: 'x', gap: 6, final: 6, proj: 9 }] }, entries);
  assert.ok(missed.failures.some((f) => f.includes('average miss')));
  assert.equal(missed.review.length, 1);
});

test('a lateral moves the yards and the touchdown to whoever carried it in', () => {
  const stats = statsOf('B.Purdy pass short left to M.Evans to SF 20 for 2 yards. Lateral to D.Samuel for 80 yards, TOUCHDOWN. E.Pineiro extra point is GOOD.');
  assert.deepEqual(stats['B.Purdy'], { pass_att: 1, pass_cmp: 1, pass_yd: 82, pass_td: 1 });
  assert.deepEqual(stats['M.Evans'], { rec: 1, rec_tgt: 1, rec_yd: 2 });
  assert.deepEqual(stats['D.Samuel'], { rec_yd: 80, rec_td: 1 });
});
