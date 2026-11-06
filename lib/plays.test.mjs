import assert from 'node:assert/strict';
import test from 'node:test';
import { abbreviatedIndex, creditedPlayers, defenseStatCount, findAbbreviated, parseDefense, parseSummary, pickStats, playerIndex } from './plays.mjs';

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

const WALLCLOCK = '2026-11-06T02:00:05Z';
const gameOf = (drives, scoringPlays = []) => ({
  boxscore: { teams: [
    { homeAway: 'away', team: { abbreviation: 'JAX' } },
    { homeAway: 'home', team: { abbreviation: 'BAL' } },
  ] },
  drives: { previous: drives.map(([offense, ...texts], d) => ({
    team: { abbreviation: offense },
    plays: texts.map((text, i) => ({ id: `${d}.${i}`, text, wallclock: WALLCLOCK, period: { number: 3 }, clock: { displayValue: '5:15' } })),
  })) },
  scoringPlays,
});
const defenseOf = (offense, text) => parseDefense(gameOf([[offense, text]]))
  .map(({ kind, team, defender, victim, victimTeam }) => ({ kind, team, defender, victim, victimTeam }));

test('interceptions and sacks go to the team not on offense, whatever code the text uses', () => {
  assert.deepEqual(
    defenseOf('BAL', '(Shotgun) J.Fagnano pass short left intended for Z.Flowers INTERCEPTED by M.Brown at BLT 32. M.Brown to BLT 26 for 6 yards (J.Hill).'),
    [{ kind: 'INT', team: 'JAX', defender: 'M.Brown', victim: 'J.Fagnano', victimTeam: 'BAL' }],
  );
  assert.deepEqual(
    defenseOf('BAL', '(Shotgun) J.Fagnano sacked at BLT 43 for -2 yards (F.Oluokun).'),
    [{ kind: 'SACK', team: 'JAX', defender: 'F.Oluokun', victim: 'J.Fagnano', victimTeam: 'BAL' }],
  );
});

test('a fumble only counts when the other team recovers it', () => {
  assert.deepEqual(
    defenseOf('JAX', '(Shotgun) T.Lawrence pass short left to T.Hunter to JAX 48 for -3 yards (M.Starks). FUMBLES (M.Starks), RECOVERED by BLT-T.Buchanan at 50.'),
    [{ kind: 'FR', team: 'BAL', defender: 'T.Buchanan', victim: 'T.Hunter', victimTeam: 'JAX' }],
  );
  assert.deepEqual(defenseOf('BAL', 'M.Andrews FUMBLES (Aborted) at JAX 41, and recovers at JAX 41.'), []);
  assert.deepEqual(defenseOf('JAX', 'T.Lawrence FUMBLES (Aborted) at JAX 41, RECOVERED by JAX-A.Line at JAX 41.'), []);
});

test('a recovered kick or muffed punt goes to the kicking team', () => {
  const kickoff = 'C.Little kicks 61 yards from JAX 35 to BLT 4. L.Wester to BLT 31 for 27 yards. FUMBLES (J.Mcleod), RECOVERED by JAX-J.Mcleod at BLT 32.';
  assert.equal(defenseOf('BAL', kickoff)[0].team, 'JAX');
  const punt = 'L.Cooke punts 48 yards to BLT 22, Center-R.Matiscik. Ji.Horn MUFFS catch, RECOVERED by JAX-K.Davis at BLT 28.';
  assert.deepEqual(defenseOf('JAX', punt)[0], { kind: 'FR', team: 'JAX', defender: 'K.Davis', victim: 'Ji.Horn', victimTeam: 'BAL' });
});

test('plays wiped out by a penalty or review do not count, but what a review leaves does', () => {
  assert.deepEqual(defenseOf('BAL', 'J.Fagnano pass INTERCEPTED by M.Brown at BLT 32. PENALTY on JAX-X.Y, Roughing the Passer, 15 yards, enforced at BLT 40 - No Play.'), []);
  assert.deepEqual(defenseOf('BAL', 'J.Fagnano pass INTERCEPTED by M.Brown at BLT 32. Baltimore challenged, and the play was REVERSED. J.Fagnano pass incomplete.'), []);
  const upheld = 'L.Wester to BLT 31. Jacksonville challenged, and the play was REVERSED.C.Little kicks 61 yards from JAX 35 to BLT 4. FUMBLES (J.Mcleod), RECOVERED by JAX-J.Mcleod at BLT 32.';
  assert.equal(defenseOf('BAL', upheld)[0].kind, 'FR');
});

test('points allowed leave out the other offense giveaways, but not kick returns', () => {
  const score = (id, code, text, awayScore, homeScore) => ({ id, text, team: { abbreviation: code }, awayScore, homeScore, period: { number: 1 }, clock: { displayValue: '1:00' } });
  const summary = gameOf([['JAX', 'x'], ['BAL', 'y']], [
    score('0.0', 'BAL', 'T.J. Watt 35 Yd Interception Return (K Kick)', 0, 7),
    score('1.0', 'BAL', 'Justice Hill 65 Yd Rush (K Kick)', 0, 14),
    score('n', 'BAL', 'Dylan Laube 95 Yd Kickoff Return (K Kick)', 0, 21),
    score('m', 'JAX', 'Team Safety', 2, 21),
  ]);
  summary.drives.previous[1].plays[0].id = '1.0';
  for (const id of ['n', 'm']) summary.drives.previous[1].plays.push({ id, text: '', wallclock: WALLCLOCK });
  const defense = parseDefense(summary);
  assert.deepEqual(defense.filter((p) => p.team === 'JAX' && p.kind === 'PA').map((p) => p.allowed), [1, 8, 15]);
  assert.deepEqual(defense.filter((p) => p.team === 'BAL' && p.kind === 'PA').map((p) => p.allowed), [0]);
  assert.equal(defense.filter((p) => p.kind === 'SAF' && p.team === 'JAX').length, 1);
});

test('a blocked extra point counts once, however it is worded', () => {
  const text = 'B.Young pass to J.Coker for 8 yards, TOUCHDOWN. R.Fitzgerald extra point is Blocked (D.Odeyingbo), Center-J.Jansen.';
  const summary = gameOf([['BAL', text]], [{ id: '0.0', text: 'Jalen Coker 8 Yd pass from Bryce Young (Ryan Fitzgerald PAT blocked)', team: { abbreviation: 'BAL' }, awayScore: 0, homeScore: 6 }]);
  assert.equal(parseDefense(summary).filter((p) => p.kind === 'BLK').length, 1);
});

test('stats count toward a kind of play, and play text names find rostered players', () => {
  assert.equal(defenseStatCount({ fum_rec: 1, def_st_fum_rec: 1 }, 'FR'), 2);
  assert.equal(defenseStatCount(undefined, 'INT'), 0);
  const index = abbreviatedIndex({
    h: { name: 'Travis Hunter', team: 'JAX', pos: 'WR' },
    a: { name: 'Amon-Ra St. Brown', team: 'DET', pos: 'WR' },
    r: { name: 'Chris Rodriguez Jr.', team: 'WAS', pos: 'RB' },
  });
  assert.equal(findAbbreviated(index, 'JAX', 'T.Hunter'), 'h');
  assert.equal(findAbbreviated(index, 'DET', 'A.St. Brown'), 'a');
  assert.equal(findAbbreviated(index, 'WAS', 'C.Rodriguez'), 'r');
  assert.equal(findAbbreviated(index, 'BAL', 'T.Hunter'), undefined);
  assert.equal(findAbbreviated(index, 'WAS', 'Chris Rodriguez Jr.'), 'r', 'summary wording has full names');

  const teammates = abbreviatedIndex({
    bijan: { name: 'Bijan Robinson', team: 'ATL', pos: 'RB' },
    brian: { name: 'Brian Robinson Jr.', team: 'ATL', pos: 'RB' },
    stroud: { name: 'C.J. Stroud', team: 'HOU', pos: 'QB' },
  });
  assert.equal(findAbbreviated(teammates, 'ATL', 'Bi.Robinson'), 'bijan');
  assert.equal(findAbbreviated(teammates, 'ATL', 'Br.Robinson'), 'brian');
  assert.equal(findAbbreviated(teammates, 'ATL', 'B.Robinson'), undefined, 'ambiguous, so no one gets the credit');
  assert.equal(findAbbreviated(teammates, 'ATL', 'J.Robinson'), undefined);
  assert.equal(findAbbreviated(teammates, 'HOU', 'C.J.Stroud'), 'stroud');
});
