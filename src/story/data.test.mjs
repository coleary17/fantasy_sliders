import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSlides, firstSlideOfWeek, loadCatalog, loadStory, weekProgress } from './data.js';
import { ORIGINAL_LEAGUE_ID, storyKey } from '../../lib/story/identity.mjs';

const chapter = (week, beats) => ({
  week,
  facts: [{ id: 'game', type: 'game' }, { id: 'standings', type: 'standings' }, { id: 'star', type: 'performer' }],
  story: { beats },
});
const story = { chapters: [chapter(1, [{ factId: 'game' }, { factId: 'star' }]), chapter(2, [{ factId: 'game' }])] };

test('each week runs from its title through its beats to a sign-off', () => {
  const slides = buildSlides(story);
  assert.deepEqual(slides.map((s) => s.kind), ['cover', 'intro', 'beat', 'beat', 'cliffhanger', 'intro', 'beat', 'cliffhanger', 'end']);
  assert.equal(slides[3].fact.type, 'performer');
  assert.equal(slides[4].standings.type, 'standings');
});

test('a beat whose fact is missing still gets a card', () => {
  const slides = buildSlides({ chapters: [chapter(1, [{ factId: 'gone' }])] });
  assert.equal(slides[2].fact, null);
});

test('jumping to a week lands on its title card', () => {
  const slides = buildSlides(story);
  assert.equal(firstSlideOfWeek(slides, 2), 5);
  assert.equal(firstSlideOfWeek(slides, 9), 0);
});

test('progress fills each week as its cards are reached', () => {
  const slides = buildSlides(story);
  assert.deepEqual(weekProgress(slides, 0), [{ week: 1, share: 0 }, { week: 2, share: 0 }]);
  assert.deepEqual(weekProgress(slides, 2), [{ week: 1, share: 0.5 }, { week: 2, share: 0 }]);
  assert.deepEqual(weekProgress(slides, 5), [{ week: 1, share: 1 }, { week: 2, share: 1 / 3 }]);
});

const identity = { leagueId: ORIGINAL_LEAGUE_ID, season: '2026', rosterId: 7 };
const document = { ...identity, team: 'Us', threads: [], chapters: [] };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const fetchMap = (map, calls = []) => async (url) => { calls.push(url); return map[url] ?? response('', 404); };

test('loads scoped stories and refuses a mismatched identity', async () => {
  const path = `/data/story/${storyKey(identity)}.json`;
  assert.deepEqual(await loadStory(identity, { fetchImpl: fetchMap({ [path]: response(JSON.stringify(document)) }) }), { status: 'ready', story: document });
  assert.equal((await loadStory(identity, { fetchImpl: fetchMap({ [path]: response(JSON.stringify({ ...document, rosterId: 8 })) }) })).status, 'invalid');
});

test('legacy fallback is limited to the original league and only on missing', async () => {
  const { leagueId, ...legacy } = document;
  const calls = [];
  assert.equal((await loadStory(identity, { fetchImpl: fetchMap({ '/data/story/2026-r07.json': response(JSON.stringify(legacy)) }, calls) })).status, 'ready');
  assert.equal(calls.length, 2);
  const otherCalls = [];
  assert.equal((await loadStory({ ...identity, leagueId: 'other' }, { fetchImpl: fetchMap({}, otherCalls) })).status, 'missing');
  assert.equal(otherCalls.length, 1);
  const path = `/data/story/${storyKey(identity)}.json`;
  assert.equal((await loadStory(identity, { fetchImpl: fetchMap({ [path]: response('{bad') }) })).status, 'invalid');
});

test('distinguishes HTML fallback, bad JSON and request errors', async () => {
  const html = async () => response('<!doctype html><html>');
  assert.equal((await loadStory(identity, { fetchImpl: html })).status, 'missing');
  assert.equal((await loadCatalog({ fetchImpl: async () => response('{bad') })).status, 'invalid');
  assert.equal((await loadCatalog({ fetchImpl: async () => { throw new Error('offline'); } })).status, 'error');
  assert.equal((await loadCatalog({ fetchImpl: async () => response('', 500) })).status, 'error');
});

test('loads and validates the local catalog', async () => {
  const catalog = { version: 1, leagues: [{ leagueId: identity.leagueId, season: identity.season, teams: [{ rosterId: 7, team: 'Us', weeks: [1], available: true }] }] };
  const calls = [];
  assert.deepEqual(await loadCatalog({ fetchImpl: fetchMap({ '/data/story/catalog.json': response(JSON.stringify(catalog)) }, calls) }), { status: 'ready', catalog });
  assert.deepEqual(calls, ['/data/story/catalog.json']);
  catalog.leagues[0].teams[0].weeks = ['1'];
  assert.equal((await loadCatalog({ fetchImpl: async () => response(JSON.stringify(catalog)) })).status, 'invalid');
});
