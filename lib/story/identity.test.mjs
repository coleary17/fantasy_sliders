import assert from 'node:assert/strict';
import test from 'node:test';
import { ORIGINAL_LEAGUE_ID, legacyStoryKey, normalizeStoryIdentity, storyKey, validateStoryDocument } from './identity.mjs';

const identity = { leagueId: ORIGINAL_LEAGUE_ID, season: '2026', rosterId: 7 };
const story = { ...identity, team: 'Team', threads: [], chapters: [] };

test('identity normalizes and produces distinct scoped keys', () => {
  assert.deepEqual(normalizeStoryIdentity({ ...identity, season: 2026, rosterId: '7' }), identity);
  assert.equal(legacyStoryKey(identity), '2026-r07');
  assert.notEqual(storyKey(identity), storyKey({ ...identity, leagueId: 'another/league' }));
  assert.match(storyKey({ ...identity, leagueId: 'another/league' }), /another%2Fleague/);
  for (const invalid of [{ ...identity, leagueId: '' }, { ...identity, season: '26' }, { ...identity, rosterId: 0 }, { ...identity, rosterId: 1.5 }]) assert.throws(() => normalizeStoryIdentity(invalid));
});

test('document identity and reader shape are checked, with restricted legacy support', () => {
  assert.deepEqual(validateStoryDocument(story, identity), []);
  assert.ok(validateStoryDocument({ ...story, rosterId: 8 }, identity).length);
  const { leagueId, ...legacy } = story;
  assert.ok(validateStoryDocument(legacy, identity).length);
  assert.deepEqual(validateStoryDocument(legacy, identity, { allowLegacy: true }), []);
  assert.ok(validateStoryDocument(legacy, { ...identity, leagueId: 'other' }, { allowLegacy: true }).length);
  assert.ok(validateStoryDocument({ ...story, chapters: [{ week: 1, facts: null, story: {} }] }, identity).length);
});

test('rejects malformed reader copy and graphic data', () => {
  const chapter = { week: 1, facts: [], story: { headline: 'Title', beats: [{ factId: 'game', text: 'Text', eyebrow: 'Label' }] } };
  assert.deepEqual(validateStoryDocument({ ...story, chapters: [chapter] }, identity), []);
  assert.ok(validateStoryDocument({ ...story, arc: { logline: {} } }, identity).length);
  assert.ok(validateStoryDocument({ ...story, chapters: [{ ...chapter, story: { ...chapter.story, headline: {} } }] }, identity).length);
  assert.ok(validateStoryDocument({ ...story, chapters: [{ ...chapter, facts: [{ type: 'trade', got: {}, gave: [] }] }] }, identity).length);
  assert.ok(validateStoryDocument({ ...story, chapters: [{ ...chapter, facts: [{ type: 'game', ourScore: {}, theirScore: 10 }] }] }, identity).length);
});
