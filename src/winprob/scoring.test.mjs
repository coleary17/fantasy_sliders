import assert from 'node:assert/strict';
import test from 'node:test';
import { findScores, formatStatLine, keyMoments, layoutScoreLabels, scoreLineAnchor, statsAt, LABEL_HEIGHT } from './scoring.js';
import { scoreAxisMax, scoreShare } from './data.js';

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
  assert.equal(formatStatLine({ sack: 2, def_st_fum_rec: 1, safe: 1, blk_kick: 1, pts_allow: 7 }), '2 sacks, 1 FR, 1 safety, 1 blocked, 7 pts allowed');
  assert.equal(formatStatLine(null), null);
});

const defenseDoc = (defense, extra = {}) => ({
  players: { ...players, BAL: { name: 'Baltimore Ravens', team: 'BAL', pos: 'DEF' } },
  plays: { g: { plays: [], defense, ...extra.game } },
  ...extra.doc,
});
const pick = { id: 'i', t: 150, kind: 'INT', team: 'BAL', victimTeam: 'JAX', defender: 'M.Brown', victim: 'T.Lawrence', period: 3, clock: '5:15' };
const twoPoints = (a, b) => [point(100, 0.4, a, b), point(200, 0.6, a, b)];

test('a turnover credits the defense, or else hurts the owner of the player who gave it up', () => {
  const both = findScores(defenseDoc([pick]), twoPoints(team('BAL'), team('qb')));
  assert.deepEqual(both.map((s) => [s.gainer, s.kind, s.title]), [['a', 'INT', 'BAL DEF: M. Brown INT off T. Lawrence']]);
  const victimOnly = findScores(defenseDoc([pick]), twoPoints(team('rb'), team('qb')));
  assert.deepEqual(victimOnly.map((s) => [s.gainer, s.title]), [['a', 'T. Lawrence throws INT']]);
  const sameTeam = findScores(defenseDoc([pick]), twoPoints(team('BAL', 'qb'), team('rb')));
  assert.deepEqual(sameTeam.map((s) => s.gainer).sort(), ['a', 'b']);
  assert.deepEqual(findScores(defenseDoc([pick]), twoPoints(team('rb'), team('wr'))), []);
});

test('a pick returned for a touchdown leaves its label to the touchdown', () => {
  assert.deepEqual(findScores(defenseDoc([{ ...pick, scored: true }]), twoPoints(team('BAL'), team('rb'))), []);
});

test('sacks are chart ticks, listed only when the odds move', () => {
  const sack = { id: 's', t: 150, kind: 'SACK', team: 'BAL', victimTeam: 'JAX', defender: null, victim: 'T.Lawrence' };
  const scores = findScores(defenseDoc([sack]), [point(100, 0.5, team('BAL'), team('rb')), point(200, 0.51, team('BAL'), team('rb'))]);
  assert.equal(scores[0].minor, true);
  assert.equal(keyMoments([], scores).length, 0);
  assert.equal(keyMoments([], [{ ...scores[0], to: 0.6 }]).length, 1);
});

test('a final game keeps only as many plays as Sleeper counted, while a live game keeps them all', () => {
  const two = [pick, { ...pick, id: 'j', t: 160 }];
  const stats = { BAL: [[1, { int: 1 }]] };
  const series = twoPoints(team('BAL'), team('rb'));
  assert.equal(findScores(defenseDoc(two, { doc: { stats } }), series).length, 2);
  const final = findScores(defenseDoc(two, { doc: { stats }, game: { final: true } }), series);
  assert.deepEqual(final.map((s) => s.playT), [150]);
});

test('a score that costs a starting defense 2+ points is marked for the other team', () => {
  const pa = (id, allowed) => ({ id, t: 150, kind: 'PA', team: 'BAL', allowed, period: 1, clock: '1:00' });
  const ptsAllowScoring = { pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0 };
  const doc = defenseDoc([pa('x', 7), pa('y', 14), pa('z', 21)], { doc: { ptsAllowScoring } });
  const scores = findScores(doc, twoPoints(team('rb'), team('BAL')));
  assert.deepEqual(scores.map((s) => [s.gainer, s.kind, s.title]).slice(0, 2), [
    ['a', 'PA', 'BAL DEF −6 pts: 7 allowed'],
    ['a', 'PA', 'BAL DEF −3 pts: 14 allowed'],
  ]);
  assert.equal(scores.length, 2, 'a one-point drop is not marked');
  assert.equal(scores[0].negative, true);
  assert.deepEqual(findScores(defenseDoc([pa('x', 7)]), twoPoints(team('rb'), team('BAL'))), [], 'older weeks have no tier scoring');
});

test('in score mode a label sits on the line it moved, pointing away from the other line', () => {
  const points = [{ x: 100, aY: 40, bY: 90 }];
  const labels = layoutScoreLabels(
    [
      { key: 'lead', index: 0, gainer: 'a', scoreSide: 'a' },
      { key: 'drop', index: 0, gainer: 'a', scoreSide: 'b', negative: true },
    ],
    points, 12, 154, scoreLineAnchor,
  );
  const [lead, drop] = labels;
  assert.deepEqual([lead.side, lead.lineY], ['a', 40]);
  assert.ok(lead.y < lead.lineY, 'the higher line labels upward');
  assert.deepEqual([drop.side, drop.lineY], ['b', 90]);
  assert.ok(drop.y > drop.lineY, 'the lower line labels downward');
});

test('the score axis rounds up to the next 25 and never starts tiny', () => {
  const at = (a, b) => ({ a: { points: a }, b: { points: b } });
  assert.equal(scoreAxisMax([at(0, 0)]), 50);
  assert.equal(scoreAxisMax([at(12.3, 40), at(101.2, 88)]), 125);
  assert.equal(scoreAxisMax([at(100, 75)]), 100);
});

test('a score below zero sits on the baseline of the axis', () => {
  assert.equal(scoreShare(-1.5, 100), 0);
  assert.equal(scoreShare(50, 100), 0.5);
});
