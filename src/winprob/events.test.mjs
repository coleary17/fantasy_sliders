import assert from 'node:assert/strict';
import test from 'node:test';
import { findEvents } from './events.js';
import { gameWindowSnapshots, indexAtTime, layoutTimeline } from './data.js';

const MIN = 60_000;
const doc = { players: { p1: { name: 'Patrick Mahomes', pos: 'QB' }, p2: { name: 'Joe Goff', pos: 'QB' } } };
const team = (id, points) => ({ starters: [id], starterPoints: [points], points });
const point = (minutes, probability, a = 0, b = 0, live = true) => ({
  t: minutes * MIN, live, probability, a: team('p1', a), b: team('p2', b),
});

test('a big play that moves the odds is an event, credited to the team that gained', () => {
  const [event, ...rest] = findEvents(doc, [point(0, 0.4), point(5, 0.46, 6.4)]);
  assert.equal(rest.length, 0);
  assert.equal(event.title, 'P. Mahomes +6.4');
  assert.equal(event.gainer, 'a');
  assert.equal(event.flipped, false);
});

test('a big play in a decided game is not an event', () => {
  assert.deepEqual(findEvents(doc, [point(0, 0.99), point(5, 0.995, 7)]), []);
});

test('a new favorite is flagged, and a tiny wobble across 50% is not', () => {
  const [event] = findEvents(doc, [point(0, 0.48), point(5, 0.53)]);
  assert.equal(event.flipped, true);
  assert.equal(event.title, 'Odds moved');
  assert.deepEqual(findEvents(doc, [point(0, 0.499), point(5, 0.501)]), []);
});

test('points gained across a long gap are not pinned on one play', () => {
  const [event] = findEvents(doc, [point(0, 0.4), point(180, 0.55, 20)]);
  assert.equal(event.title, 'Odds moved');
});

test('losses are shown and the odds favor the other side', () => {
  const [event] = findEvents(doc, [point(0, 0.6, 10), point(5, 0.55, 8)]);
  assert.equal(event.title, 'P. Mahomes −2.0');
  assert.equal(event.gainer, 'b');
  assert.ok(Math.abs(event.from - 0.4) < 1e-9);
});

test('only the largest moments are kept, in time order', () => {
  const series = Array.from({ length: 21 }, (_, i) => point(i * 5, i % 2 ? 0.3 + i / 100 : 0.7));
  const events = findEvents(doc, series);
  assert.equal(events.length, 8);
  assert.deepEqual(events.map((e) => e.index), [...events.map((e) => e.index)].sort((x, y) => x - y));
});

test('the timeline keeps game windows and drops the time between them', () => {
  const snap = (hours, live) => ({ t: hours * 3_600_000, live });
  const snapshots = [snap(0, false), snap(1, false), snap(2, true), snap(3, false), snap(4, false), snap(50, false), snap(51, true)];
  assert.deepEqual(gameWindowSnapshots(snapshots).map((s) => s.t / 3_600_000), [1, 2, 3, 50, 51]);
  assert.ok(layoutTimeline(snapshots).width < 100);
});

test('indexAtTime finds the latest reading at or before a time', () => {
  const series = [{ t: 10 }, { t: 20 }, { t: 30 }];
  assert.equal(indexAtTime(series, 20), 1);
  assert.equal(indexAtTime(series, 25), 1);
  assert.equal(indexAtTime(series, 5), 0);
  assert.equal(indexAtTime(series, null), 2);
});
