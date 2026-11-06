import assert from 'node:assert/strict';
import test from 'node:test';
import { creditedPlayers, parseSummary, pickStats, playerIndex } from './plays.mjs';

const summaryOf = (...texts) => ({
  scoringPlays: texts.map((text, i) => ({ id: String(i), text, team: { abbreviation: 'WSH' }, period: { number: 2 }, clock: { displayValue: '0:58' } })),
  drives: { previous: [{ plays: texts.map((_, i) => ({ id: String(i), wallclock: '2026-11-06T02:24:58Z' })) }] },
});
const parseOne = (text) => parseSummary(summaryOf(text))[0];

test('passes, runs and field goals are read from the wording, ignoring the kicker', () => {
  const passing = parseOne('Parker Washington 50 Yd pass from Trevor Lawrence (Cam Little Kick)');
  assert.equal(passing.kind, 'TD');
  assert.equal(passing.scorer, 'Parker Washington');
  assert.equal(passing.passer, 'Trevor Lawrence');
  assert.equal(passing.yards, 50);
  assert.equal(passing.team, 'WAS', 'ESPN codes become Sleeper codes');
  assert.equal(passing.t, Date.parse('2026-11-06T02:24:58Z'));

  assert.deepEqual(
    (({ kind, how, scorer, yards }) => ({ kind, how, scorer, yards }))(parseOne('Chris Rodriguez Jr. 2 Yd Rush (Cam Little Kick)')),
    { kind: 'TD', how: 'rush', scorer: 'Chris Rodriguez Jr.', yards: 2 },
  );
  const kick = parseOne('Cam Little 45 Yd Field Goal ');
  assert.equal(kick.kind, 'FG');
  assert.equal(kick.scorer, 'Cam Little');
});

test('return touchdowns are recognized, including ones with no yardage', () => {
  assert.equal(parseOne('T.J. Watt 35 Yd Interception Return (Chris Boswell Kick)').how, 'return');
  assert.equal(parseOne('Gracen Halton Fumble Recovery in End Zone (Eddy Pineiro Kick)').how, 'return');
  assert.equal(parseOne('Myles Price 86 Yd Punt Return (Will Reichard Kick)').how, 'kick-return');
  assert.equal(parseOne('Dylan Laube 95 Yd Kickoff Return (Matt Gay Kick)').how, 'kick-return');
  assert.equal(parseOne('Oluwafemi Oladejo 14 Yd return of blocked punt (J.Slye kick)').kind, 'TD');
});

test('safeties and defensive conversions are not labeled', () => {
  assert.deepEqual(parseSummary(summaryOf('Team Safety', 'Zyon McCollum Defensive PAT Conversion')), []);
});

test('a play with no timestamp is dropped, since it cannot be placed on the chart', () => {
  const summary = summaryOf('Cam Little 45 Yd Field Goal');
  summary.drives.previous = [];
  assert.deepEqual(parseSummary(summary), []);
});

test('credit goes to rostered players on the scoring team, matched despite punctuation and suffixes', () => {
  const index = playerIndex({
    a: { name: 'Chris Rodriguez', team: 'JAX', pos: 'RB' },
    b: { name: 'Trevor Lawrence', team: 'JAX', pos: 'QB' },
    c: { name: 'Parker Washington', team: 'JAX', pos: 'WR' },
    d: { name: 'Parker Washington', team: 'BAL', pos: 'WR' },
    e: { name: 'Myles Price', team: 'MIN', pos: 'WR' },
  });
  const credit = (play) => creditedPlayers(play, index);
  assert.deepEqual(credit({ team: 'JAX', how: 'rush', scorer: 'Chris Rodriguez Jr.' }), ['a']);
  assert.deepEqual(credit({ team: 'JAX', how: 'pass', scorer: 'Parker Washington', passer: 'Trevor Lawrence' }), ['b', 'c']);
  assert.deepEqual(credit({ team: 'JAX', how: 'pass', scorer: 'Unrostered Guy', passer: 'Trevor Lawrence' }), ['b']);
  assert.deepEqual(credit({ team: 'JAX', how: 'return', scorer: 'Some Linebacker' }), ['JAX'], 'a defender scores for the DEF slot');
  assert.deepEqual(credit({ team: 'JAX', how: 'return', scorer: 'Parker Washington' }), ['c'], 'an offense recovering its own fumble does not credit the DEF');
  assert.deepEqual(credit({ team: 'MIN', how: 'kick-return', scorer: 'Myles Price' }), ['e', 'MIN'], 'a return scores for both');
});

test('only box score fields are kept, and zeros are dropped', () => {
  assert.deepEqual(pickStats({ rec: 3, rec_yd: 0, pts_ppr: 9, rec_td_lng: 50 }), { rec: 3 });
});
