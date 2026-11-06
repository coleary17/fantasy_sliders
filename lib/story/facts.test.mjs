import assert from 'node:assert/strict';
import test from 'node:test';
import { auctions, chapterFacts, optimalPoints } from './facts.mjs';

const claim = (roster, player, bid, status, updated, notes = 'x', extra = {}) => ({
  type: 'waiver', status, roster_ids: [roster], adds: { [player]: roster }, drops: null, status_updated: updated,
  settings: { waiver_bid: bid }, metadata: { notes }, ...extra,
});
const OUTBID = 'This player was claimed by another owner.';

test('an auction joins the winner with each rival once, at their highest bid', () => {
  const [auction] = auctions([
    claim(1, 'p', 277, 'complete', 5),
    claim(2, 'p', 275, 'failed', 5, OUTBID),
    claim(3, 'p', 50, 'failed', 5, OUTBID),
    claim(3, 'p', 111, 'failed', 5, OUTBID),
  ]);
  assert.deepEqual(auction.winner, { roster: 1, bid: 277 });
  assert.deepEqual(auction.losers, [{ roster: 2, bid: 275 }, { roster: 3, bid: 111 }]);
});

test('bids rejected for a full roster and drop-only moves are not auctions', () => {
  assert.deepEqual(auctions([
    claim(2, 'p', 75, 'failed', 5, 'Unfortunately, your roster will have too many players after this transaction.'),
    { type: 'free_agent', status: 'complete', roster_ids: [1], adds: null, drops: { q: 1 }, status_updated: 5 },
    { type: 'waiver', status: 'complete', roster_ids: [1], adds: null, drops: { q: 1 }, status_updated: 5 },
  ]), []);
});

test('the best lineup fills fixed slots before flex spots', () => {
  const players = { q1: { pos: 'QB' }, q2: { pos: 'QB' }, r1: { pos: 'RB' }, r2: { pos: 'RB' }, w1: { pos: 'WR' } };
  const entry = { players_points: { q1: 20, q2: 30, r1: 10, r2: 8, w1: 5 } };
  // q2 at QB, q1 can't flex, r1 at RB, w1 at WR, r2 at FLEX.
  assert.equal(optimalPoints(entry, ['QB', 'RB', 'WR', 'FLEX'], players), 53);
});

const entry = (roster, matchup, points, starters, bench = {}) => ({
  roster_id: roster, matchup_id: matchup, points, starters: Object.keys(starters), starters_points: Object.values(starters),
  players_points: { ...starters, ...bench },
});

function season(overrides = {}) {
  const players = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => [id, { name: `Player ${id.toUpperCase()}`, pos: 'WR' }]));
  return {
    names: { 1: 'Us', 2: 'Them', 3: 'Third', 4: 'Fourth' },
    slots: ['WR'],
    waiverBudget: 1000,
    playoffSpots: 2,
    lastRegularWeek: 3,
    oddsIterations: 200,
    players,
    docs: {},
    matchups: {
      1: [entry(1, 1, 100, { a: 100 }), entry(2, 1, 90, { b: 90 }), entry(3, 2, 80, { c: 80 }), entry(4, 2, 70, { d: 70 })],
      2: [entry(1, 1, 110, { a: 110 }, { g: 125 }), entry(3, 1, 120, { c: 120 }), entry(2, 2, 60, { e: 60 }), entry(4, 2, 50, { d: 50 })],
      3: [entry(1, 1, 0, { a: 0 }), entry(4, 1, 0, { d: 0 }), entry(2, 2, 0, { b: 0 }), entry(3, 2, 0, { c: 0 })],
    },
    transactions: { 1: [], 2: [] },
    ...overrides,
  };
}
const fact = (chapter, id) => chapter.facts.find((f) => f.id === id);

test('a chapter reports the game and the table as they stood that week', () => {
  const chapter = chapterFacts(season(), 1, 2);
  assert.deepEqual({ ...fact(chapter, 'game') }, {
    id: 'game', type: 'game', opponent: 'Third', opponentId: 3, ourScore: 110, theirScore: 120, margin: 10, result: 'L',
    recordAfter: '1-1', opponentRecordBefore: '1-0', weekRank: 2, teamsThisWeek: 4, wouldHaveBeaten: 2, leagueHigh: 120,
  });
  const standings = fact(chapter, 'standings');
  assert.equal(standings.rank, 2);
  assert.equal(standings.previousRank, 1);
  assert.equal(standings.streak, '1L');
});

test('a bench player who would have won the game is a regret', () => {
  const bench = fact(chapterFacts(season(), 1, 2), 'bench');
  assert.equal(bench.couldHaveWon, true);
  assert.equal(bench.benchedPlayer, 'Player G');
  assert.equal(bench.pointsLeftOnBench, 15);
});

test('a lost bid notes the winner and that we had dropped the player', () => {
  const chapter = chapterFacts(season({
    transactions: {
      1: [{ type: 'free_agent', status: 'complete', roster_ids: [1], adds: null, drops: { e: 1 }, status_updated: 1, settings: null }],
      2: [claim(2, 'e', 175, 'complete', 9), claim(1, 'e', 111, 'failed', 9, OUTBID)],
    },
  }), 1, 2);
  const { id, type, ...bid } = fact(chapter, 'bid-player-e');
  assert.equal(id && type, 'biddingWar');
  assert.deepEqual(bid, { player: 'Player E', won: false, bid: 111, winner: { team: 'Them', bid: 175 }, lostBy: 64, otherBidders: 0, droppedByUsInWeek: 1 });
});

test('a chapter knows nothing of moves after its own week', () => {
  const s = season({
    transactions: {
      1: [],
      2: [claim(1, 'f', 500, 'complete', 9)],
    },
  });
  const early = fact(chapterFacts(s, 1, 1), 'market');
  assert.equal(early.spentSeason, 0);
  assert.equal(fact(chapterFacts(s, 1, 2), 'market').spentSeason, 500);
});

test('a dropped player who goes off elsewhere comes back as a ghost', () => {
  const chapter = chapterFacts(season({
    transactions: {
      1: [{ type: 'free_agent', status: 'complete', roster_ids: [1], adds: null, drops: { c: 1 }, status_updated: 1, settings: null }],
      2: [],
    },
  }), 1, 2);
  const ghost = fact(chapter, 'ghost');
  assert.equal(ghost.player, 'Player C');
  assert.equal(ghost.nowWith, 'Third');
  assert.equal(ghost.againstUs, true);
});

test('a claim records who was cut for it, and a free flier is not a bidding war', () => {
  const chapter = chapterFacts(season({
    transactions: {
      1: [],
      2: [
        claim(1, 'f', 100, 'complete', 9, 'x', { drops: { g: 1 } }),
        claim(2, 'f', 90, 'failed', 9, OUTBID),
        claim(1, 'e', 0, 'failed', 9, OUTBID),
        claim(3, 'e', 31, 'complete', 9),
      ],
    },
  }), 1, 2);
  assert.deepEqual(fact(chapter, 'bid-player-f').cutToMakeRoom, ['Player G']);
  assert.equal(fact(chapter, 'bid-player-e'), undefined);
});

test('adding back a player we cut earlier says so', () => {
  const chapter = chapterFacts(season({
    transactions: {
      1: [{ type: 'free_agent', status: 'complete', roster_ids: [1], adds: null, drops: { a: 1 }, status_updated: 1, settings: null }],
      2: [{ type: 'free_agent', status: 'complete', roster_ids: [1], adds: { a: 1 }, drops: { g: 1 }, status_updated: 2, settings: null }],
    },
  }), 1, 2);
  const add = fact(chapter, 'add-player-a');
  assert.equal(add.droppedByUsInWeek, 1);
  assert.deepEqual(add.cutToMakeRoom, ['Player G']);
});

test('a turning point says which side each big play came from', () => {
  const side = (expected, points) => ({ points, expected, variance: 400, starters: [expected === 0 ? 'x' : 'c'], starterPoints: [points] });
  const reading = (t, us, them) => ({ t, live: true, teams: { 1: { ...side(100, us), starters: ['a'] }, 3: side(them * 10, them) } });
  const doc = {
    matchups: [[1, 3]],
    players: { a: { name: 'Sam Ours', pos: 'WR', team: 'AAA', proj: 10 }, c: { name: 'Tom Foe', pos: 'WR', team: 'BBB', proj: 10 } },
    snapshots: [reading(1, 0, 10), reading(2, 0, 19)],
  };
  const turn = fact(chapterFacts(season({ docs: { 2: doc } }), 1, 2), 'turn');
  assert.deepEqual(turn.ours, []);
  assert.deepEqual(turn.theirs, [{ player: 'T. Foe', points: 9 }]);
  assert.equal(turn.wentOurWay, false);
});
