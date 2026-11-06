import assert from 'node:assert/strict';
import test from 'node:test';
import { findScores, formatStatLine, keyMoments, layoutScoreLabels, statsAt, LABEL_HEIGHT } from './scoring.js';

const players = {
  qb: { name: 'Trevor Lawrence', team: 'JAX', pos: 'QB' },
  wr: { name: 'Parker Washington', team: 'JAX', pos: 'WR' },
  k: { name: 'Cam Little', team: 'JAX', pos: 'K' },
  rb: { name: 'Justice Hill', team: 'BAL', pos: 'RB' },
  JAX: { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DEF' },
};
const pass = { id: 'p', t: 150, team: 'JAX', kind: 'TD', how: 'pass', scorer: 'Parker Washington', passer: 'Trevor Lawrence', yards: 50, period: 2, clock: '0:58' };
const team = (...starters) => ({ starters });
const point = (t, probability, a, b) => ({ t, probability, a, b });

test('a score lands on the first reading after it and names only that matchup\'s starters', () => {
  const series = [point(100, 0.4, team('qb'), team('rb')), point(200, 0.6, team('qb'), team('rb'))];
  const [score, ...rest] = findScores({ players, plays: { g: { plays: [pass] } } }, series);
  assert.equal(rest.length, 0);
  assert.equal(score.index, 1);
  assert.equal(score.title, 'T. Lawrence 50 yd TD pass');
  assert.equal(score.gameClock, 'Q2 0:58');
  assert.equal(score.gainer, 'a');
  assert.equal(score.from, 0.4);
  assert.equal(score.to, 0.6);
});

test('a QB and receiver on one team share a label, and on opposing teams each get one', () => {
  const doc = { players, plays: { g: { plays: [pass] } } };
  const same = findScores(doc, [point(200, 0.5, team('qb', 'wr'), team('rb'))]);
  assert.deepEqual(same.map((s) => s.title), ['T. Lawrence to P. Washington, 50 yd TD']);
  const opposed = findScores(doc, [point(200, 0.5, team('qb'), team('wr'))]);
  assert.deepEqual(opposed.map((s) => [s.gainer, s.title]), [['a', 'T. Lawrence 50 yd TD pass'], ['b', 'P. Washington 50 yd TD catch']]);
});

test('field goals and defensive touchdowns are labeled, and benched players are not', () => {
  const plays = [
    { id: 'f', t: 10, team: 'JAX', kind: 'FG', how: 'kick', scorer: 'Cam Little', yards: 45 },
    { id: 'd', t: 20, team: 'JAX', kind: 'TD', how: 'return', scorer: 'Some Linebacker', yards: 38 },
    { id: 'r', t: 30, team: 'BAL', kind: 'TD', how: 'rush', scorer: 'Justice Hill', yards: 65 },
  ];
  const scores = findScores({ players, plays: { g: { plays } } }, [point(100, 0.5, team('k', 'JAX'), team('qb'))]);
  assert.deepEqual(scores.map((s) => [s.kind, s.title]), [['FG', 'C. Little 45 yd FG'], ['TD', 'JAX DEF 38 yd TD return']]);
});

test('weeks collected before plays were added have no scores', () => {
  assert.deepEqual(findScores({ players }, [point(1, 0.5, team(), team())]), []);
});

test('key moments keep swings no score explains, and carry a new favorite onto the score', () => {
  const scores = [{ key: 's', index: 2, gainer: 'a', playT: 15, flipped: false, title: 'TD' }];
  const events = [
    { t: 20, index: 2, gainer: 'a', flipped: true, title: 'Odds moved' },
    { t: 40, index: 4, gainer: 'b', flipped: false, title: 'Odds moved' },
  ];
  const moments = keyMoments(events, scores);
  assert.deepEqual(moments.map((m) => m.key), ['s', 'swing-40']);
  assert.equal(moments[0].flipped, true);
});

test('labels stack when they would overlap and stay inside the plot', () => {
  const scores = [
    { key: '1', index: 0, gainer: 'a' },
    { key: '2', index: 0, gainer: 'a' },
    { key: '3', index: 0, gainer: 'a' },
    { key: '4', index: 1, gainer: 'b' },
  ];
  const labels = layoutScoreLabels(scores, [{ x: 100, y: 20 }, { x: 100, y: 150 }], 12, 154);
  const ys = labels.slice(0, 3).map((l) => l.y);
  assert.equal(new Set(ys).size, 3);
  labels.forEach((l) => {
    assert.ok(l.y >= 12);
    assert.ok(l.y + LABEL_HEIGHT <= 154);
  });
});

test('labels far enough apart share a level', () => {
  const scores = [{ key: '1', index: 0, gainer: 'a' }, { key: '2', index: 1, gainer: 'a' }];
  const [first, second] = layoutScoreLabels(scores, [{ x: 100, y: 80 }, { x: 200, y: 80 }], 12, 154);
  assert.equal(first.y, second.y);
});

test('stats follow the cursor, and no time means the latest', () => {
  const doc = { stats: { p: [[100, { rec: 1 }], [200, { rec: 2 }]] } };
  assert.equal(statsAt(doc, 'p', null).rec, 2);
  assert.equal(statsAt(doc, 'p', 150).rec, 1);
  assert.equal(statsAt(doc, 'p', 50), null);
  assert.equal(statsAt(doc, 'nobody', null), null);
});

test('stat lines read like a box score for each kind of player', () => {
  assert.equal(formatStatLine({ pass_cmp: 18, pass_att: 27, pass_yd: 242, pass_td: 1, pass_int: 1, rush_att: 3, rush_yd: 12 }), '18/27 pass, 242 yd, 1 TD, 1 INT · 3 car, 12 yd');
  assert.equal(formatStatLine({ rec: 2, rec_tgt: 4, rec_yd: 61, rec_td: 1 }), '2/4 rec, 61 yd, 1 TD');
  assert.equal(formatStatLine({ fgm: 4, fga: 4, xpm: 3, xpa: 3 }), '4/4 FG, 3/3 XP');
  assert.equal(formatStatLine({ sack: 1, int: 2, pts_allow: 10 }), '1 sack, 2 INT, 10 pts allowed');
  assert.equal(formatStatLine(null), null);
});
