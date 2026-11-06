import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPicks, applyReadings, biggestMovers, formatOdds, lastPickedWeek, normalizeMargin, playoffOdds, projectedScores, prunePicks, tableAfterWeeks, teamStrengths, weekReading, whatIfScores, sortStandings } from './playoffs.mjs';

const team = (id, wins, losses, pointsFor, ties = 0) => ({ id, wins, losses, ties, pointsFor });

test('strength pulls a hot start toward the league average', () => {
  const strengths = teamStrengths([team(1, 2, 0, 300), team(2, 0, 2, 100)]);
  assert.equal(strengths[1], (300 + 6 * 100) / 8);
  assert.equal(strengths[2], (100 + 6 * 100) / 8);
});

test('strength is level before any games', () => {
  const strengths = teamStrengths([team(1, 0, 0, 0), team(2, 0, 0, 0)]);
  assert.equal(strengths[1], strengths[2]);
});

test('with no games left the current table decides, and points break ties', () => {
  const teams = [team(1, 8, 6, 1500), team(2, 8, 6, 1600), team(3, 9, 5, 1000)];
  const odds = playoffOdds({ teams, schedule: [], playoffSpots: 2, iterations: 10 });
  assert.deepEqual(odds, { 1: 0, 2: 1, 3: 1 });
});

test('a tie counts as half a win', () => {
  const teams = [team(1, 7, 6, 1000, 1), team(2, 7, 7, 2000)];
  const odds = playoffOdds({ teams, schedule: [], playoffSpots: 1, iterations: 10 });
  assert.deepEqual(odds, { 1: 1, 2: 0 });
});

test('a final-week winner-take-all between level teams is a coin flip', () => {
  const teams = [team(1, 5, 5, 1100), team(2, 5, 5, 1100)];
  const odds = playoffOdds({ teams, schedule: [{ pairs: [[1, 2]] }], playoffSpots: 1 });
  assert.ok(Math.abs(odds[1] - 0.5) < 0.02, `got ${odds[1]}`);
  assert.ok(Math.abs(odds[1] + odds[2] - 1) < 1e-9);
});

test('a finished live game decides the week regardless of strength', () => {
  const teams = [team(1, 5, 5, 2000), team(2, 5, 5, 1000)];
  const outlooks = { 1: { expected: 80, variance: 0 }, 2: { expected: 90, variance: 0 } };
  const odds = playoffOdds({ teams, schedule: [{ pairs: [[1, 2]], outlooks }], playoffSpots: 1, iterations: 50 });
  assert.deepEqual(odds, { 1: 0, 2: 1 });
});

test('the same inputs give the same odds', () => {
  const input = { teams: [team(1, 3, 2, 600), team(2, 2, 3, 580)], schedule: [{ pairs: [[1, 2]] }], playoffSpots: 1, iterations: 500 };
  assert.deepEqual(playoffOdds(input), playoffOdds(input));
});

test('odds only claim certainty once the season is over', () => {
  assert.equal(formatOdds(1, false), '>99%');
  assert.equal(formatOdds(0, false), '<1%');
  assert.equal(formatOdds(0.42, false), '42%');
  assert.equal(formatOdds(1, true), '100%');
  assert.equal(formatOdds(0, true), '0%');
});

test('a finished week still counts after Sleeper moves on but before it is scored', () => {
  const teams = [team(1, 5, 3, 900), team(2, 5, 3, 900)];
  const finished = {
    week: 9,
    snapshots: [
      { t: 1, live: true, teams: { 1: { expected: 100, variance: 50 }, 2: { expected: 100, variance: 50 } } },
      { t: 2, live: false, teams: { 1: { expected: 80, variance: 0 }, 2: { expected: 140, variance: 0 } } },
    ],
  };
  const schedule = applyReadings([{ week: 9, pairs: [[1, 2]] }, { week: 10, pairs: [] }], [weekReading(finished)]);
  assert.deepEqual(schedule[0].outlooks, finished.snapshots[1].teams);
  assert.equal(schedule[1].outlooks, undefined);
  assert.deepEqual(playoffOdds({ teams, schedule, playoffSpots: 1, iterations: 50 }), { 1: 0, 2: 1 });
});

test('a recorded week with no snapshots gives no reading', () => {
  assert.equal(weekReading({ week: 9, snapshots: [] }), null);
});

test('a picked result scores the loser 110 and the winner 110 plus the margin', () => {
  assert.deepEqual(whatIfScores([7, 10], { winner: 10, margin: 25 }), { 10: 135, 7: 110 });
});

test('margins stay in range and blank falls back to the default', () => {
  assert.equal(normalizeMargin(''), 10);
  assert.equal(normalizeMargin('abc'), 10);
  assert.equal(normalizeMargin(0), 1);
  assert.equal(normalizeMargin(500), 70);
  assert.equal(normalizeMargin('12.5'), 12.5);
});

test('a pick locks every other game that week at its projected score, and no other week', () => {
  const teams = [team(1, 4, 4, 800), team(2, 4, 4, 800), team(3, 4, 4, 800), team(4, 4, 4, 800)];
  const live = { 3: { expected: 120, variance: 40 }, 4: { expected: 100, variance: 40 } };
  const schedule = [{ week: 9, pairs: [[1, 2], [3, 4]], outlooks: live }, { week: 10, pairs: [[1, 3]] }];
  const [nine, ten] = applyPicks(schedule, { 9: { '1-2': { winner: 2, margin: 5 } } }, teams);
  assert.deepEqual(nine.outlooks[1], { expected: 110, variance: 0 });
  assert.deepEqual(nine.outlooks[2], { expected: 115, variance: 0 });
  assert.deepEqual(nine.outlooks[3], { expected: 120, variance: 0 });
  assert.deepEqual(nine.outlooks[4], { expected: 100, variance: 0 });
  assert.equal(ten.outlooks, undefined);
  assert.deepEqual(schedule[0].outlooks, live);
});

test('a locked game with no live estimate is projected from season scoring', () => {
  const teams = [team(1, 2, 0, 300), team(2, 0, 2, 100), team(3, 1, 1, 200), team(4, 1, 1, 200)];
  const schedule = [{ week: 3, pairs: [[1, 2], [3, 4]] }];
  const [week] = applyPicks(schedule, { 3: { '3-4': { winner: 3, margin: 5 } } }, teams);
  assert.equal(week.outlooks[1].expected, projectedScores(schedule[0], teams)[1]);
  assert.ok(week.outlooks[1].expected > week.outlooks[2].expected);
  assert.equal(week.outlooks[1].variance, 0);
});

test('the projected leader of an unpicked game takes the win once anything is picked', () => {
  const teams = [team(1, 5, 5, 1000), team(2, 5, 5, 1000), team(3, 5, 5, 900), team(4, 5, 5, 900)];
  const live = { 1: { expected: 121, variance: 400 }, 2: { expected: 120, variance: 400 } };
  const schedule = [{ week: 9, pairs: [[1, 2], [3, 4]], outlooks: live }];
  const picks = { '3-4': { winner: 3, margin: 5 } };
  const odds = playoffOdds({ teams, schedule: applyPicks(schedule, { 9: picks }, teams), playoffSpots: 1, iterations: 20 });
  assert.equal(odds[1], 1);
});

test('a picked result decides the odds, and the margin can swing the points tiebreak', () => {
  const teams = [team(1, 5, 5, 1000), team(2, 5, 5, 1010)];
  const schedule = [{ week: 9, pairs: [[1, 2]] }];
  const odds = (margin) => playoffOdds({ teams, schedule: applyPicks(schedule, { 9: { '1-2': { winner: 1, margin } } }, teams), playoffSpots: 1, iterations: 20 });
  assert.deepEqual(odds(5), { 1: 1, 2: 0 });
  const three = [...teams, team(3, 6, 5, 900)];
  const tiebreak = (margin) => playoffOdds({ teams: three, schedule: applyPicks(schedule, { 9: { '1-2': { winner: 2, margin } } }, three), playoffSpots: 2, iterations: 20 });
  assert.deepEqual(tiebreak(5), { 1: 0, 2: 1, 3: 1 });
});

test('with no picks the what-if odds match the baseline exactly', () => {
  const input = { teams: [team(1, 3, 2, 600), team(2, 2, 3, 580)], playoffSpots: 1, iterations: 500 };
  const schedule = [{ week: 6, pairs: [[1, 2]] }];
  assert.deepEqual(playoffOdds({ ...input, schedule }), playoffOdds({ ...input, schedule: applyPicks(schedule, {}, input.teams) }));
});

test('the table after a locked week adds its results and points', () => {
  const teams = [team(1, 5, 3, 900), team(2, 4, 4, 800), team(3, 4, 4, 800), team(4, 3, 5, 700)];
  const schedule = [{ week: 9, pairs: [[1, 2], [3, 4]], outlooks: { 3: { expected: 120, variance: 40 }, 4: { expected: 120, variance: 40 } } }];
  const [week] = applyPicks(schedule, { 9: { '1-2': { winner: 2, margin: 5 } } }, teams);
  const [one, two, three, four] = tableAfterWeeks(teams, [week]);
  assert.deepEqual([one.wins, one.losses, one.pointsFor], [5, 4, 1010]);
  assert.deepEqual([two.wins, two.losses, two.pointsFor], [5, 4, 915]);
  assert.deepEqual([three.ties, four.ties], [1, 1]);
  assert.equal(teams[0].wins, 5);
});

test('standings rank by record, then points for, with a tie worth half a win', () => {
  const team = (id, wins, losses, ties, pointsFor) => ({ id, wins, losses, ties, pointsFor });
  const teams = [team('a', 5, 3, 0, 1000), team('b', 6, 2, 0, 900), team('c', 5, 3, 0, 1100), team('d', 5, 2, 1, 800)];
  assert.deepEqual(sortStandings(teams).map((t) => t.id), ['b', 'd', 'c', 'a']);
  assert.equal(teams[0].id, 'a', 'the input keeps its order');
});

test('the last picked week ignores weeks whose picks were all undone', () => {
  assert.equal(lastPickedWeek({}), null);
  assert.equal(lastPickedWeek({ 9: {} }), null);
  assert.equal(lastPickedWeek({ 9: { '1-2': { winner: 1, margin: 5 } }, 11: { '1-2': { winner: 2, margin: 5 } }, 12: {} }), 11);
});

test('picks in a later week lock the weeks before it at their projected scores, and leave later weeks simulated', () => {
  const teams = [team(1, 4, 4, 900), team(2, 4, 4, 700)];
  const schedule = [9, 10, 11, 12].map((week) => ({ week, pairs: [[1, 2]] }));
  const [nine, ten, eleven, twelve] = applyPicks(schedule, {
    9: { '1-2': { winner: 2, margin: 5 } },
    11: { '1-2': { winner: 2, margin: 20 } },
  }, teams);
  assert.deepEqual(nine.outlooks[2], { expected: 115, variance: 0 });
  assert.deepEqual(ten.outlooks[1], { expected: projectedScores(schedule[1], teams)[1], variance: 0 });
  assert.equal(ten.outlooks[1].variance, 0);
  assert.deepEqual(eleven.outlooks[2], { expected: 130, variance: 0 });
  assert.equal(twelve.outlooks, undefined);
});

test('picks across weeks add up in the table and the odds', () => {
  const teams = [team(1, 5, 3, 1000), team(2, 3, 5, 800)];
  const schedule = [{ week: 9, pairs: [[1, 2]] }, { week: 10, pairs: [[1, 2]] }, { week: 11, pairs: [[1, 2]] }];
  const upset = { '1-2': { winner: 2, margin: 70 } };
  const locked = applyPicks(schedule, { 9: upset, 10: upset, 11: upset }, teams);
  const [one, two] = tableAfterWeeks(teams, locked);
  assert.deepEqual([one.wins, one.losses, one.pointsFor], [5, 6, 1330]);
  assert.deepEqual([two.wins, two.losses, two.pointsFor], [6, 5, 1340]);
  assert.deepEqual(playoffOdds({ teams, schedule: locked, playoffSpots: 1, iterations: 20 }), { 1: 0, 2: 1 });
});

test('saved picks keep only games still on the schedule', () => {
  const schedule = [{ week: 10, pairs: [[1, 2], [3, 4]] }];
  const saved = {
    9: { '1-2': { winner: 1, margin: 10 } }, // already scored
    10: {
      '1-2': { winner: 2, margin: 15 },
      '3-4': { winner: 9, margin: 15 }, // not in this game
      '5-6': { winner: 5, margin: 15 }, // not this week's game
    },
  };
  assert.deepEqual(prunePicks(saved, schedule), { 10: { '1-2': { winner: 2, margin: 15 } } });
  assert.deepEqual(prunePicks({ 9: saved[9] }, schedule), {}, 'a week with nothing left is dropped');
  assert.deepEqual(prunePicks(null, schedule), {});
});

test('biggest movers rank by size of the displayed change, up or down', () => {
  const rows = [
    { id: 1, name: 'A', odds: 0.5, baseline: 0.47 },
    { id: 2, name: 'B', odds: 0.2, baseline: 0.31 },
    { id: 3, name: 'C', odds: 0.704, baseline: 0.701 },
    { id: 4, name: 'D', odds: 0.9, baseline: 0.83 },
  ];
  assert.deepEqual(biggestMovers(rows, 2), [{ id: 2, name: 'B', change: -11 }, { id: 4, name: 'D', change: 7 }]);
  assert.deepEqual(biggestMovers([rows[2]], 2), [], 'a change too small to show is no change');
});
