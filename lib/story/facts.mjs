// Everything a chapter of a team's story may state, computed only from data up to that week so
// a chapter can't spoil what comes later. The LLM writes around these facts and never supplies a number.
import { pairMatchups, round } from '../collector.mjs';
import { playoffOdds, sortStandings } from '../playoffs.mjs';
import { matchupSeries } from '../../src/winprob/data.js';
import { bigPlays, findEvents } from '../../src/winprob/events.js';

const FLEX_POSITIONS = new Set(['RB', 'WR', 'TE']);
const OUTBID_NOTE = 'claimed by another owner';
const BIG_DAY_POINTS = 20; // worth a mention when a player you lost goes off for someone else
const MIN_BUST_PROJECTION = 8;
const MIN_BUST_MISS = 8;
const MIN_BENCH_EDGE = 10; // a bench player out-scoring a starter by less than this isn't a regret
const NOTABLE_BID = 50;
const COMEBACK_LOW = 25;
const COLLAPSE_HIGH = 75;
const MIN_TURN_SWING = 10; // percentage points
const MAX_SERIES_POINTS = 60;

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pct = (p) => Math.round(p * 100);
const record = ({ wins, losses, ties }) => (ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`);

export const playerName = (season, id) => season.players[id]?.name ?? id;

// The most a lineup could have scored. Fixed slots fill first so flex spots take what's left.
export function optimalPoints(entry, slots, players) {
  const remaining = Object.entries(entry.players_points ?? {})
    .map(([id, points]) => ({ id, points, pos: players[id]?.pos }))
    .sort((a, b) => b.points - a.points);
  const take = (fits) => {
    const index = remaining.findIndex(fits);
    return index === -1 ? 0 : remaining.splice(index, 1)[0].points;
  };
  const fixed = slots.filter((slot) => slot !== 'FLEX');
  const flex = slots.length - fixed.length;
  let total = 0;
  for (const slot of fixed) total += take((p) => p.pos === slot);
  for (let i = 0; i < flex; i++) total += take((p) => FLEX_POSITIONS.has(p.pos));
  return round(total);
}

// One waiver run's bids on one player. A team's repeat bids count once, at its highest.
export function auctions(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'waiver' || !tx.adds) continue;
    const outbid = tx.status === 'failed' && tx.metadata?.notes?.includes(OUTBID_NOTE);
    if (tx.status !== 'complete' && !outbid) continue;
    for (const playerId of Object.keys(tx.adds)) {
      const key = `${playerId}:${tx.status_updated}`;
      const group = groups.get(key) ?? { playerId, winner: null, losers: new Map() };
      const roster = tx.roster_ids[0];
      const bid = tx.settings?.waiver_bid ?? 0;
      if (tx.status === 'complete') group.winner = { roster, bid };
      else group.losers.set(roster, Math.max(bid, group.losers.get(roster) ?? 0));
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ playerId, winner, losers }) => ({
    playerId,
    winner,
    losers: [...losers].map(([roster, bid]) => ({ roster, bid })).sort((a, b) => b.bid - a.bid),
  }));
}

function movesThrough(season, rosterId, week) {
  const moves = [];
  for (let leg = 1; leg <= week; leg++) {
    for (const tx of season.transactions[leg] ?? []) {
      if (tx.status !== 'complete' || !tx.roster_ids.includes(rosterId)) continue;
      moves.push({ tx, leg });
    }
  }
  return moves.sort((a, b) => a.tx.status_updated - b.tx.status_updated);
}

// How this player last reached the roster, if it was by a move this season.
function acquisition(moves, rosterId, playerId) {
  const found = moves.findLast(({ tx }) => tx.adds?.[playerId] === rosterId);
  if (!found) return null;
  return { week: found.leg, how: found.tx.type, ...(found.tx.type === 'waiver' ? { bid: found.tx.settings?.waiver_bid ?? 0 } : {}) };
}

function teamTables(season, throughWeek) {
  const table = new Map(Object.keys(season.names).map((id) => [Number(id), {
    id: Number(id), wins: 0, losses: 0, ties: 0, pointsFor: 0, results: [],
  }]));
  for (let week = 1; week <= throughWeek; week++) {
    const entries = season.matchups[week];
    const byRoster = new Map(entries.map((e) => [e.roster_id, e]));
    for (const [a, b] of pairMatchups(entries)) {
      const [x, y] = [byRoster.get(a), byRoster.get(b)];
      table.get(a).pointsFor += x.points;
      table.get(b).pointsFor += y.points;
      if (x.points > y.points) {
        table.get(a).wins += 1;
        table.get(b).losses += 1;
        table.get(a).results.push('W');
        table.get(b).results.push('L');
      } else if (y.points > x.points) {
        table.get(b).wins += 1;
        table.get(a).losses += 1;
        table.get(b).results.push('W');
        table.get(a).results.push('L');
      } else {
        table.get(a).ties += 1;
        table.get(b).ties += 1;
        table.get(a).results.push('T');
        table.get(b).results.push('T');
      }
    }
  }
  return [...table.values()];
}

function oddsAfter(season, week) {
  season.oddsCache ??= new Map();
  if (!season.oddsCache.has(week)) {
    const teams = teamTables(season, week);
    const schedule = [];
    for (let w = week + 1; w <= season.lastRegularWeek; w++) schedule.push({ week: w, pairs: pairMatchups(season.matchups[w]) });
    season.oddsCache.set(week, playoffOdds({ teams, schedule, playoffSpots: season.playoffSpots, iterations: season.oddsIterations }));
  }
  return season.oddsCache.get(week);
}

function streak(results) {
  const last = results.at(-1);
  if (!last || last === 'T') return null;
  let length = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) length++;
  return `${length}${last}`;
}

function standingsFact(season, rosterId, week) {
  const table = sortStandings(teamTables(season, week));
  const before = sortStandings(teamTables(season, week - 1));
  const me = table.find((t) => t.id === rosterId);
  return {
    id: 'standings',
    type: 'standings',
    rank: table.indexOf(me) + 1,
    ...(week > 1 ? { previousRank: before.findIndex((t) => t.id === rosterId) + 1 } : {}),
    teams: table.length,
    playoffSpots: season.playoffSpots,
    streak: streak(me.results),
    pointsFor: round(me.pointsFor),
    playoffOddsPct: pct(oddsAfter(season, week)[rosterId]),
    previousPlayoffOddsPct: pct(oddsAfter(season, week - 1)[rosterId]),
  };
}

function thin(series) {
  const step = Math.max(1, Math.ceil(series.length / MAX_SERIES_POINTS));
  return series.filter((_, i) => i % step === 0 || i === series.length - 1);
}

// The collector's reading of how the game felt, from the team's side.
function winProbFacts(season, rosterId, week, opponent, won) {
  const doc = season.docs[week];
  const pair = doc?.matchups.find((p) => p.includes(rosterId) && p.includes(opponent));
  if (!pair) return [];
  const series = matchupSeries(doc, pair);
  if (series.length === 0) return [];
  const ours = (p) => (pair[0] === rosterId ? p : 1 - p);
  const path = series.map((s) => ours(s.probability));
  const low = pct(Math.min(...path));
  const high = pct(Math.max(...path));
  const facts = [{
    id: 'wp',
    type: 'winProb',
    pregamePct: pct(path[0]),
    lowPct: low,
    highPct: high,
    ...(won && low <= COMEBACK_LOW ? { shape: 'comeback' } : {}),
    ...(!won && high >= COLLAPSE_HIGH ? { shape: 'collapse' } : {}),
    series: thin(series.map((s, i) => ({ t: s.t, pct: pct(path[i]) }))),
  }];

  // The moment that fits the result: what won it, or what lost it.
  const forUs = (event) => (event.gainer === 'a') === (pair[0] === rosterId);
  const toUs = (event, share) => pct(forUs(event) ? share : 1 - share);
  const turning = findEvents(doc, series)
    .filter((e) => e.title !== 'Odds moved' && forUs(e) === won && Math.abs(e.to - e.from) * 100 >= MIN_TURN_SWING)
    .sort((a, b) => b.rank - a.rank)[0];
  if (turning) {
    const [before, after] = [series[turning.index - 1], series[turning.index]];
    const [ourSide, theirSide] = pair[0] === rosterId ? ['a', 'b'] : ['b', 'a'];
    const plays = (side) => bigPlays(doc, before[side], after[side]).map(({ name, gain }) => ({ player: name, points: round(gain, 1) }));
    facts.push({ id: 'turn', type: 'turningPoint', ours: plays(ourSide), theirs: plays(theirSide), fromPct: toUs(turning, turning.from), toPct: toUs(turning, turning.to), wentOurWay: won });
  }
  return facts;
}

function lineupFacts(season, rosterId, week, me, them, moves) {
  const doc = season.docs[week];
  const starters = me.starters.map((id, i) => ({ id, points: me.starters_points[i] }));
  const facts = [];

  const best = starters.reduce((a, b) => (b.points > a.points ? b : a));
  const how = acquisition(moves, rosterId, best.id);
  facts.push({ id: 'star', type: 'performer', player: playerName(season, best.id), points: best.points, ...(how ? { acquired: how } : {}) });

  const misses = starters
    .map((s) => ({ ...s, proj: doc?.players[s.id]?.proj ?? 0 }))
    .filter((s) => s.proj >= MIN_BUST_PROJECTION && s.proj - s.points >= MIN_BUST_MISS)
    .sort((a, b) => (b.proj - b.points) - (a.proj - a.points));
  if (misses[0]) facts.push({ id: 'bust', type: 'bust', player: playerName(season, misses[0].id), points: misses[0].points, projected: round(misses[0].proj, 1) });

  const foe = them.starters.map((id, i) => ({ id, points: them.starters_points[i] })).reduce((a, b) => (b.points > a.points ? b : a));
  facts.push({ id: 'foe', type: 'opponentStar', player: playerName(season, foe.id), points: foe.points });

  const optimal = optimalPoints(me, season.slots, season.players);
  const lost = me.points <= them.points;
  const couldHaveWon = lost && optimal > them.points;
  const benched = Object.entries(me.players_points ?? {}).filter(([id]) => !me.starters.includes(id));
  const flexible = (a, b) => season.players[a]?.pos === season.players[b]?.pos
    || (FLEX_POSITIONS.has(season.players[a]?.pos) && FLEX_POSITIONS.has(season.players[b]?.pos));
  const swaps = benched.flatMap(([id, points]) => starters
    .filter((s) => flexible(id, s.id) && points - s.points >= MIN_BENCH_EDGE)
    .map((s) => ({ benched: id, benchedPoints: points, started: s.id, startedPoints: s.points, edge: points - s.points })))
    .sort((a, b) => b.edge - a.edge);
  if (couldHaveWon || swaps[0]) {
    facts.push({
      id: 'bench',
      type: 'benchRegret',
      optimalPoints: optimal,
      pointsLeftOnBench: round(optimal - me.points),
      couldHaveWon,
      ...(swaps[0] ? {
        benchedPlayer: playerName(season, swaps[0].benched),
        benchedPoints: swaps[0].benchedPoints,
        startedPlayer: playerName(season, swaps[0].started),
        startedPoints: swaps[0].startedPoints,
      } : {}),
    });
  }
  return facts;
}

function marketFacts(season, rosterId, week, moves) {
  const facts = [];
  const name = (roster) => season.names[roster];
  const allMoves = season.transactions[week] ?? [];
  const everDropped = (playerId) => moves.findLast(({ tx, leg }) => leg < week && tx.drops?.[playerId] === rosterId)?.leg;
  const contested = new Set();
  const cutFor = (playerId) => moves
    .filter(({ leg, tx }) => leg === week && tx.adds?.[playerId] === rosterId)
    .flatMap(({ tx }) => Object.entries(tx.drops ?? {}).filter(([, r]) => r === rosterId).map(([id]) => playerName(season, id)));

  for (const auction of auctions(allMoves)) {
    const mine = auction.winner?.roster === rosterId ? auction.winner.bid : auction.losers.find((l) => l.roster === rosterId)?.bid;
    if (mine === undefined) continue;
    const won = auction.winner?.roster === rosterId;
    if (won && auction.losers.length === 0) continue;
    if (!won && mine === 0) continue; // a free flier on a defense or kicker isn't a bidding war
    contested.add(auction.playerId);
    const player = playerName(season, auction.playerId);
    const dropped = everDropped(auction.playerId);
    const cut = won ? cutFor(auction.playerId) : [];
    facts.push({
      id: `bid-${slug(player)}`,
      type: 'biddingWar',
      player,
      won,
      bid: mine,
      ...(won
        ? { rivals: auction.losers.map((l) => ({ team: name(l.roster), bid: l.bid })), wonBy: mine - (auction.losers[0]?.bid ?? 0) }
        : {
            ...(auction.winner ? { winner: { team: name(auction.winner.roster), bid: auction.winner.bid }, lostBy: auction.winner.bid - mine } : {}),
            otherBidders: auction.losers.filter((l) => l.roster !== rosterId).length,
          }),
      ...(cut.length ? { cutToMakeRoom: cut } : {}),
      ...(dropped ? { droppedByUsInWeek: dropped } : {}),
    });
  }

  const thisWeek = moves.filter(({ leg }) => leg === week).map(({ tx }) => tx);
  const entry = season.matchups[week].find((e) => e.roster_id === rosterId);
  for (const tx of thisWeek) {
    if (tx.type === 'trade') {
      const partner = tx.roster_ids.find((r) => r !== rosterId);
      const side = (obj, keep) => Object.entries(obj ?? {}).filter(([, r]) => keep(r)).map(([id]) => playerName(season, id));
      facts.push({
        id: `trade-${slug(name(partner))}`,
        type: 'trade',
        partner: name(partner),
        got: side(tx.adds, (r) => r === rosterId),
        gave: side(tx.drops, (r) => r === rosterId),
        picksMoved: tx.draft_picks?.length ?? 0,
      });
      continue;
    }
    for (const playerId of Object.keys(tx.adds ?? {})) {
      if (tx.adds[playerId] !== rosterId || contested.has(playerId)) continue;
      const bid = tx.settings?.waiver_bid ?? 0;
      const startedNow = entry.starters.includes(playerId);
      if (bid < NOTABLE_BID && !startedNow) continue;
      const player = playerName(season, playerId);
      const cut = Object.entries(tx.drops ?? {}).filter(([, r]) => r === rosterId).map(([id]) => playerName(season, id));
      const droppedBefore = everDropped(playerId);
      facts.push({
        id: `add-${slug(player)}`,
        type: 'pickup',
        player,
        how: tx.type,
        ...(tx.type === 'waiver' ? { bid } : {}),
        ...(cut.length ? { cutToMakeRoom: cut } : {}),
        ...(droppedBefore ? { droppedByUsInWeek: droppedBefore } : {}),
        startedThisWeek: startedNow,
        ...(startedNow ? { pointsThisWeek: entry.starters_points[entry.starters.indexOf(playerId)] } : {}),
      });
    }
  }

  const spend = (m) => (m.tx.type === 'waiver' ? m.tx.settings?.waiver_bid ?? 0 : 0);
  const spent = moves.filter((m) => m.leg === week).reduce((sum, m) => sum + spend(m), 0);
  const total = moves.reduce((sum, m) => sum + spend(m), 0);
  facts.push({ id: 'market', type: 'market', spentThisWeek: spent, spentSeason: total, budget: season.waiverBudget, budgetLeft: season.waiverBudget - total, movesThisWeek: thisWeek.length });
  return facts;
}

// Players this team lost or dropped earlier who started and went off elsewhere this week.
function ghostFacts(season, rosterId, week, opponent, moves) {
  const starters = new Map();
  for (const entry of season.matchups[week]) {
    entry.starters.forEach((id, i) => starters.set(id, { roster: entry.roster_id, points: entry.starters_points[i] }));
  }
  const biggest = (ids) => [...ids]
    .map((id) => ({ id, ...starters.get(id) }))
    .filter((p) => p.roster && p.roster !== rosterId && p.points >= BIG_DAY_POINTS)
    .sort((a, b) => b.points - a.points)[0];
  const facts = [];

  const dropped = new Set();
  for (const { tx } of moves) {
    for (const [id, r] of Object.entries(tx.drops ?? {})) if (r === rosterId) dropped.add(id);
    for (const [id, r] of Object.entries(tx.adds ?? {})) if (r === rosterId) dropped.delete(id);
  }
  const ghost = biggest(dropped);
  if (ghost) {
    const droppedIn = moves.findLast(({ tx }) => tx.drops?.[ghost.id] === rosterId).leg;
    facts.push({ id: 'ghost', type: 'droppedPlayerBoom', player: playerName(season, ghost.id), points: ghost.points, droppedInWeek: droppedIn, nowWith: season.names[ghost.roster], againstUs: ghost.roster === opponent });
  }

  const lost = new Map();
  for (let leg = 1; leg <= week; leg++) {
    for (const a of auctions(season.transactions[leg] ?? [])) {
      const mine = a.losers.find((l) => l.roster === rosterId);
      if (mine && a.winner) lost.set(a.playerId, { week: leg, bid: mine.bid, winningBid: a.winner.bid });
    }
  }
  const away = biggest([...lost.keys()].filter((id) => id !== ghost?.id));
  if (away) {
    const info = lost.get(away.id);
    facts.push({ id: 'away', type: 'gotAway', player: playerName(season, away.id), points: away.points, lostInWeek: info.week, ourBid: info.bid, winningBid: info.winningBid, nowWith: season.names[away.roster], againstUs: away.roster === opponent });
  }
  return facts;
}

// One week from one team's side: the game, then what the story may draw on.
export function chapterFacts(season, rosterId, week) {
  const entries = season.matchups[week];
  const pair = pairMatchups(entries).find((p) => p.includes(rosterId));
  if (!pair) throw new Error(`Team ${rosterId} has no game in week ${week}`);
  const opponent = pair.find((r) => r !== rosterId);
  const me = entries.find((e) => e.roster_id === rosterId);
  const them = entries.find((e) => e.roster_id === opponent);
  const result = me.points > them.points ? 'W' : me.points < them.points ? 'L' : 'T';
  const scores = entries.filter((e) => e.matchup_id != null).map((e) => e.points).sort((a, b) => b - a);
  const tableBefore = teamTables(season, week - 1);
  const tableAfter = teamTables(season, week);
  const moves = movesThrough(season, rosterId, week);

  const game = {
    id: 'game',
    type: 'game',
    opponent: season.names[opponent],
    opponentId: opponent,
    ourScore: me.points,
    theirScore: them.points,
    margin: round(Math.abs(me.points - them.points)),
    result,
    recordAfter: record(tableAfter.find((t) => t.id === rosterId)),
    opponentRecordBefore: record(tableBefore.find((t) => t.id === opponent)),
    weekRank: scores.indexOf(me.points) + 1,
    teamsThisWeek: scores.length,
    wouldHaveBeaten: scores.filter((s) => s < me.points).length,
    leagueHigh: scores[0],
  };
  return {
    week,
    team: season.names[rosterId],
    facts: [
      game,
      ...winProbFacts(season, rosterId, week, opponent, result === 'W'),
      standingsFact(season, rosterId, week),
      ...lineupFacts(season, rosterId, week, me, them, moves),
      ...marketFacts(season, rosterId, week, moves),
      ...ghostFacts(season, rosterId, week, opponent, moves),
    ],
  };
}
