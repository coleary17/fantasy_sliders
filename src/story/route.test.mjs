import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINAL_LEAGUE_ID } from '../../lib/story/identity.mjs';
import { formatStoryRoute, parseStoryRoute, resolveStoryRoute } from './route.js';

const catalog = { leagues: [
  { leagueId: ORIGINAL_LEAGUE_ID, season: '2025', teams: [{ rosterId: 2, available: true }] },
  { leagueId: ORIGINAL_LEAGUE_ID, season: '2026', teams: [{ rosterId: 3, available: false }, { rosterId: 7, available: true }] },
] };

test('canonical links round-trip encoded identity and optional week', () => {
  const route = { leagueId: 'league/with spaces', season: '2026', rosterId: 7, week: 4 };
  assert.deepEqual(parseStoryRoute(formatStoryRoute(route)), { kind: 'team', ...route });
  assert.deepEqual(parseStoryRoute(formatStoryRoute({ ...route, week: null })), { kind: 'team', ...route, week: null });
});

test('bare and legacy links resolve in the latest original league context', () => {
  assert.deepEqual(resolveStoryRoute(parseStoryRoute('#/story'), catalog), { kind: 'team', leagueId: ORIGINAL_LEAGUE_ID, season: '2026', rosterId: 7, week: null });
  assert.deepEqual(resolveStoryRoute(parseStoryRoute('#/story/3/8'), catalog), { kind: 'team', leagueId: ORIGINAL_LEAGUE_ID, season: '2026', rosterId: 3, week: 8 });
  assert.equal(resolveStoryRoute(parseStoryRoute('#/story'), { leagues: [] }).kind, 'empty');
});

test('malformed links are recoverable invalid routes', () => {
  for (const hash of ['#/story/0', '#/story/7/nope', '#/story/a/2026/0', '#/story/a/2026/1/0', '#/story/%ZZ/2026/1', '#/story/a/2026/1/2/3']) {
    assert.equal(parseStoryRoute(hash).kind, 'invalid', hash);
  }
});
