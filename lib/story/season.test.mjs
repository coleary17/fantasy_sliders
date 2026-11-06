import assert from 'node:assert/strict';
import test from 'node:test';
import { movesByLineupWeek } from './season.mjs';

const move = (id, status_updated) => ({ id, status_updated });
const docs = { 4: { snapshots: [{ t: 100, live: true }, { t: 200, live: true }, { t: 300, live: false }] } };

test('a claim processed after a week\'s last game counts toward the next lineup', () => {
  const weeks = movesByLineupWeek({ 4: [move('before', 50), move('during', 150), move('after', 250)] }, docs);
  assert.deepEqual(weeks[4].map((m) => m.id), ['before', 'during']);
  assert.deepEqual(weeks[5].map((m) => m.id), ['after']);
});

test('moved claims join the ones filed under the next week', () => {
  const weeks = movesByLineupWeek({ 4: [move('after', 250)], 5: [move('early', 260)] }, docs);
  assert.deepEqual(weeks[5].map((m) => m.id).sort(), ['after', 'early']);
});

test('a week with no recorded games keeps Sleeper\'s own filing', () => {
  assert.deepEqual(movesByLineupWeek({ 6: [move('x', 999)] }, {})[6].map((m) => m.id), ['x']);
});
