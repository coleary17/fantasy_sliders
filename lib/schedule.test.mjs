import assert from 'node:assert/strict';
import test from 'node:test';
import { inGameWindow, shouldCollect } from './schedule.mjs';

const at = (iso) => Date.parse(iso);

test('a normal Sunday opens at noon Eastern and stays open through Monday 2 am', () => {
  assert.equal(inGameWindow(at('2026-11-22T16:59:00Z')), false); // 11:59 am
  assert.equal(inGameWindow(at('2026-11-22T17:00:00Z')), true); // noon
  assert.equal(inGameWindow(at('2026-11-23T06:59:00Z')), true); // Mon 1:59 am
  assert.equal(inGameWindow(at('2026-11-23T07:00:00Z')), false); // Mon 2:00 am
});

test('an international Sunday opens at 8 am Eastern, this week and next', () => {
  assert.equal(inGameWindow(at('2026-11-08T12:59:00Z')), false); // 7:59 am
  assert.equal(inGameWindow(at('2026-11-08T13:00:00Z')), true); // 8:00 am
  assert.equal(inGameWindow(at('2026-11-08T14:30:00Z')), true); // kickoff in Madrid
  assert.equal(inGameWindow(at('2026-11-15T14:30:00Z')), true); // kickoff in Munich
});

test('Thursday and Monday nights run until 2 am', () => {
  assert.equal(inGameWindow(at('2026-11-12T23:29:00Z')), false); // Thu 6:29 pm
  assert.equal(inGameWindow(at('2026-11-12T23:30:00Z')), true); // Thu 6:30 pm
  assert.equal(inGameWindow(at('2026-11-13T06:30:00Z')), true); // Fri 1:30 am
  assert.equal(inGameWindow(at('2026-11-13T12:00:00Z')), false); // Fri morning
  assert.equal(inGameWindow(at('2026-11-17T06:30:00Z')), true); // Tue 1:30 am
  assert.equal(inGameWindow(at('2026-11-17T07:00:00Z')), false); // Tue 2:00 am
});

test('Tuesday, Wednesday and Saturday have no window on ordinary weeks', () => {
  assert.equal(inGameWindow(at('2026-11-10T20:00:00Z')), false);
  assert.equal(inGameWindow(at('2026-11-11T20:00:00Z')), false);
  assert.equal(inGameWindow(at('2026-11-14T20:00:00Z')), false);
});

test('holiday and late-season games get a window on their own day', () => {
  assert.equal(inGameWindow(at('2026-11-26T18:00:00Z')), true); // Thanksgiving 1 pm
  assert.equal(inGameWindow(at('2026-11-27T20:00:00Z')), true); // Black Friday 3 pm
  assert.equal(inGameWindow(at('2026-11-26T01:00:00Z')), true); // Wed 8 pm before Thanksgiving
  assert.equal(inGameWindow(at('2026-12-19T22:00:00Z')), true); // Saturday 5 pm
  assert.equal(inGameWindow(at('2026-12-25T18:00:00Z')), true); // Christmas 1 pm
});

test('Eastern time holds on both sides of a clock change', () => {
  assert.equal(inGameWindow(at('2026-10-04T12:00:00Z')), true); // 8 am EDT, London week
  assert.equal(inGameWindow(at('2026-10-04T11:59:00Z')), false);
  assert.equal(inGameWindow(at('2026-11-01T17:00:00Z')), true); // noon EST, the day clocks change
  assert.equal(inGameWindow(at('2026-11-01T16:59:00Z')), false);
});

test('the collector runs every minute in a window and every 5 minutes outside one', () => {
  assert.equal(shouldCollect(at('2026-11-08T15:01:00Z')), true);
  assert.equal(shouldCollect(at('2026-11-10T15:01:00Z')), false);
  assert.equal(shouldCollect(at('2026-11-10T15:05:00Z')), true);
});
