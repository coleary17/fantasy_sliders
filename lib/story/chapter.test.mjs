import assert from 'node:assert/strict';
import test from 'node:test';
import { addChapter, appPrompt, chapterPrompt, chapterSchema, checkChapter, generateChapter, importChapters, newStory, storySoFar } from './chapter.mjs';

const game = { id: 'game', type: 'game', opponent: 'Them', ourScore: 162.16, theirScore: 116.6, result: 'W', recordAfter: '3-2', margin: 45.56 };
const star = { id: 'star', type: 'performer', player: 'Drake Maye', points: 39.46 };
const standings = { id: 'standings', type: 'standings', rank: 5, teams: 10, playoffOddsPct: 67 };
const wp = { id: 'wp', type: 'winProb', pregamePct: 34, series: [{ t: 123456, pct: 77 }] };
const chapter = { week: 5, facts: [game, wp, star, standings] };
const story = () => newStory({ season: '2026', rosterId: 7, team: 'Us' });

const draft = (overrides = {}) => ({
  chapter: {
    headline: 'The $77 man',
    dek: 'A big week.',
    mood: 'triumph',
    beats: [
      { factId: 'game', eyebrow: 'The result', text: 'You won 162.16 to 116.6.' },
      { factId: 'star', eyebrow: 'The star', text: 'Drake Maye scored 39.46, or about 39.5.' },
      { factId: 'wp', eyebrow: 'The odds', text: 'You started at 34%.' },
    ],
    cliffhanger: 'Now 3-2.',
    recap: 'Won in week 5.',
    threads: [{ id: 'maye-bet', title: 'The Maye bet', status: 'opened', note: 'Paying off' }],
    ...overrides,
  },
  arc: { logline: 'Rising.', act: 'rising' },
});
const check = (output, playerNames) => checkChapter(output, { ...chapter, story: story(), playerNames });
const pastFacts = { facts: [{ id: 'game', type: 'game', result: 'L', recordAfter: '2-2' }, { id: 'x', type: 'pickup', bid: 77, player: 'Drake Maye' }] };

test('numbers must come from the facts, though they may be rounded', () => {
  const withPast = { ...story(), chapters: [{ week: 4, ...pastFacts, story: { headline: 'h', recap: 'r', cliffhanger: 'c' } }] };
  assert.deepEqual(checkChapter(draft(), { ...chapter, story: withPast }).failures, []);
  const made = draft();
  made.chapter.beats[2].text = 'You started at 41%.';
  assert.deepEqual(check(made).failures.sort(), ['41 isn\'t in the facts.', '77 isn\'t in the facts.']);
});

test('a number only in the chart series does not count as a fact', () => {
  const made = draft({ headline: 'At 123456' });
  assert.ok(check(made).failures.includes('123456 isn\'t in the facts.'));
});

test('a chapter needs a game card and the right number of cards', () => {
  const { beats } = draft().chapter;
  assert.ok(check(draft({ beats: beats.slice(1) })).failures.join().includes('3 to 5'));
  assert.ok(check(draft({ beats: beats.slice(1) })).failures.join().includes('game fact'));
});

test('a player who is not in the facts fails on a full name and warns on a surname', () => {
  const full = draft({ dek: 'Patrick Mahomes watched.' });
  assert.ok(check(full, ['Patrick Mahomes', 'Drake Maye']).failures.includes('Patrick Mahomes isn\'t in the facts.'));
  const surname = draft({ dek: 'Mahomes watched.' });
  assert.ok(check(surname, ['Patrick Mahomes']).warnings.join().includes('Mahomes'));
});

test('the schema only allows this week\'s facts and every object is closed', () => {
  const schema = chapterSchema(['game', 'star']);
  assert.deepEqual(schema.properties.chapter.properties.beats.items.properties.factId.enum, ['game', 'star']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.arc.additionalProperties, false);
});

test('the chart series stays out of the prompt', () => {
  assert.ok(!chapterPrompt(story(), chapter).includes('series'));
});

const fakeClient = (...replies) => {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => {
      calls.push(params);
      const reply = replies[calls.length - 1];
      return typeof reply === 'string'
        ? { stop_reason: reply, content: [], usage: {} }
        : { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 1 } };
    } } },
  };
};
const passingStory = () => ({ ...story(), chapters: [{ week: 4, ...pastFacts, story: { headline: 'h', recap: 'r', cliffhanger: 'c' } }] });

test('a bad draft is retried with its problems, and a good one is kept', async () => {
  const bad = draft({ dek: 'You scored 999.' });
  const client = fakeClient(bad, draft());
  const result = await generateChapter({ client, story: passingStory(), chapter });
  assert.equal(result.attempts, 2);
  assert.equal(result.fallback, undefined);
  assert.ok(client.calls[1].messages[0].content.includes('999 isn\'t in the facts.'));
  assert.equal(client.calls[0].output_config.format.type, 'json_schema');
});

test('two bad replies become a plain chapter with accurate numbers', async () => {
  const result = await generateChapter({ client: fakeClient('refusal', 'max_tokens'), story: story(), chapter });
  assert.equal(result.fallback, true);
  assert.equal(result.chapter.beats[0].text, 'Beat Them 162.16–116.6.');
  assert.deepEqual(checkChapter(result.chapter ? { chapter: result.chapter, arc: { logline: '' } } : null, { ...chapter, story: story() }).failures, []);
});

test('API errors surface rather than becoming a plain chapter', async () => {
  const client = { beta: { messages: { create: async () => { throw new Error('401'); } } } };
  await assert.rejects(generateChapter({ client, story: story(), chapter }), /401/);
});

test('threads carry forward by id and later chapters see only open ones', () => {
  let s = addChapter(story(), chapter, draft());
  s = addChapter(s, { ...chapter, week: 6 }, draft({ threads: [{ id: 'maye-bet', title: 'The Maye bet', status: 'closed', note: 'Done' }, { id: 'new', title: 'New', status: 'opened', note: 'n' }] }));
  const soFar = storySoFar(s);
  assert.deepEqual(soFar.openThreads.map((t) => t.id), ['new']);
  assert.equal(soFar.chapters.length, 2);
  assert.equal(soFar.chapters[0].result, 'W 3-2');
  assert.equal(s.throughWeek, 6);
});

const reply = (overrides = {}) => [{ week: 5, ...draft(), ...overrides }];
const prior = { week: 4, facts: pastFacts.facts };
const chapters = [prior, chapter];
const week4 = { week: 4, chapter: { ...draft().chapter, headline: 'Four', beats: [
  { factId: 'game', eyebrow: 'Result', text: 'You lost.' },
  { factId: 'x', eyebrow: 'Move', text: 'Bid $77 on Drake Maye.' },
  { factId: 'y', eyebrow: 'Table', text: 'Now 2-2.' },
], dek: 'Week 4.', cliffhanger: 'Next.', recap: 'Lost.', threads: [] }, arc: { logline: 'Early.', act: 'setup' } };
const fullChapters = [{ week: 4, facts: [...pastFacts.facts, { id: 'y', type: 'standings' }] }, chapter];

test('a fenced reply from the app imports into a story', () => {
  const text = `\`\`\`json\n${JSON.stringify([week4, ...reply()])}\n\`\`\``;
  const result = importChapters({ text, story: story(), chapters: fullChapters });
  assert.deepEqual(result.failures, []);
  assert.equal(result.story.throughWeek, 5);
  assert.equal(result.story.arc.act, 'rising');
});

test('an import saves nothing when a chapter is wrong, and says what to fix', () => {
  const wrong = reply({ chapter: { ...draft().chapter, mood: 'sad' } });
  const result = importChapters({ text: JSON.stringify([week4, ...wrong]), story: story(), chapters: fullChapters });
  assert.equal(result.story, null);
  assert.ok(result.failures.join().includes('mood can\'t be "sad"'));
  assert.deepEqual(importChapters({ text: JSON.stringify([week4]), story: story(), chapters: fullChapters }).failures, ['Week 5: missing.']);
  assert.ok(importChapters({ text: 'Here you go!', story: story(), chapters }).failures[0].includes('valid JSON'));
});

test('a chapter cannot use a number that only appears in a later week', () => {
  const early = { ...week4, chapter: { ...week4.chapter, dek: 'Soon 162.16.' } };
  const result = importChapters({ text: JSON.stringify([early, ...reply()]), story: story(), chapters: fullChapters });
  assert.ok(result.failures.includes('Week 4: 162.16 isn\'t in the facts.'));
});

test('the app prompt carries the rules and every week, but not the chart series', () => {
  const prompt = appPrompt('Us', fullChapters);
  assert.ok(prompt.includes('The Story So Far'));
  assert.ok(prompt.includes('"week": 5'));
  assert.ok(!prompt.includes('series'));
});

test('a card that recites figures is sent back', () => {
  const { beats } = draft().chapter;
  const recited = draft({ beats: [{ ...beats[0], text: 'You won 162.16 to 116.6 by 45.56.' }, ...beats.slice(1)] });
  assert.ok(check(recited).failures.join().includes('too many figures'));
});
