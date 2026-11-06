#!/usr/bin/env node
// Writes a team's story chapter by chapter to public/data/story, picking up where it left off.
// Usage: npm run story -- <roster id> [--through 8] [--force]   generate chapters
//        npm run story -- <roster id> --facts [--week 5]        print the facts only, no LLM
//        npm run story -- <roster id> --dry-run --week 5        print the prompt only, no LLM
//        npm run story -- <roster id> --export                  write a prompt to paste into the Claude app
//        npm run story -- <roster id> --import <file>           check the app's reply and save it as the story
//        npm run story -- <roster id> --refresh-facts           rebuild a saved story's facts, keeping its writing
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { jsonFetcher } from '../lib/collector.mjs';
import { addChapter, appPrompt, chapterPrompt, generateChapter, importChapters, newStory, PROMPT_VERSION, SYSTEM_PROMPT } from '../lib/story/chapter.mjs';
import { chapterFacts } from '../lib/story/facts.mjs';
import { loadStorySeason, trimPlayers } from '../lib/story/season.mjs';
import { localStore, store as weeks } from './local-store.mjs';
import { legacyStoryKey, normalizeStoryIdentity, ORIGINAL_LEAGUE_ID, storyKey, validateStoryDocument } from '../lib/story/identity.mjs';
import { refreshStoryCatalog } from './index-stories.mjs';

const stories = localStore('story');
const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYERS_PATH = join(import.meta.dirname, '..', 'public', 'data', 'story', 'players.json');
const INPUT_PER_TOKEN = 4 / 1_000_000; // Claude Opus 5.5
const OUTPUT_PER_TOKEN = 20 / 1_000_000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : Number(args[index + 1]);
};
const rosterId = Number(args[0]);
if (!Number.isInteger(rosterId)) throw new Error('Usage: npm run story -- <roster id> [--through 8] [--force] [--facts] [--dry-run] [--week 5]');

const getJson = jsonFetcher(fetch);

// Sleeper asks for at most one pull of this large file a day.
async function loadPlayers() {
  const age = await stat(PLAYERS_PATH).then((s) => Date.now() - s.mtimeMs, () => Infinity);
  if (age < DAY_MS) return JSON.parse(await readFile(PLAYERS_PATH, 'utf8'));
  const players = trimPlayers(await getJson('https://api.sleeper.app/v1/players/nfl'));
  await stories.set('players', players);
  return players;
}

const season = await loadStorySeason({ getJson, loadDoc: (key) => weeks.get(key), players: await loadPlayers() });
const team = season.names[rosterId];
if (!team) throw new Error(`No team with roster id ${rosterId}. Teams: ${JSON.stringify(season.names)}`);
const through = option('through') ?? season.lastScoredWeek;
const identity = normalizeStoryIdentity({ leagueId: ORIGINAL_LEAGUE_ID, season: season.season, rosterId });
const key = storyKey(identity);
let saved = flag('force') ? null : await stories.get(key);
let legacy = false;
if (!saved && !flag('force')) {
  saved = await stories.get(legacyStoryKey(identity));
  legacy = Boolean(saved);
}
if (saved) {
  const problems = validateStoryDocument(saved, identity, { allowLegacy: legacy });
  if (problems.length) throw new Error(`Saved story is invalid: ${problems.join(' ')}`);
  saved = { ...saved, leagueId: identity.leagueId };
}
const saveStory = async (document) => {
  await stories.set(key, document);
  await refreshStoryCatalog();
};
if (saved && saved.promptVersion !== PROMPT_VERSION) console.log(`Note: ${key} was started on prompt version ${saved.promptVersion}. Use --force to restart it.`);
let story = saved ?? newStory({ ...identity, team });

const playerNames = [...new Set(Object.values(season.docs).flatMap((doc) => Object.values(doc?.players ?? {}).map((p) => p.name)))].filter(Boolean);
const chaptersThrough = () => Array.from({ length: through }, (_, i) => chapterFacts(season, rosterId, i + 1));

if (flag('export')) {
  const path = join(import.meta.dirname, '..', 'public', 'data', 'story', `${key}-prompt.txt`);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, appPrompt(team, chaptersThrough()));
  console.log(path);
  process.exit(0);
}

if (flag('import')) {
  const text = await readFile(args[args.indexOf('--import') + 1], 'utf8');
  const result = importChapters({ text, story: { ...newStory({ ...identity, team }), model: 'claude-app' }, chapters: chaptersThrough(), playerNames });
  for (const w of result.warnings ?? []) console.log(`warning: ${w}`);
  if (!result.story) {
    console.log(`Not saved. Paste this back to Claude:\n\nPlease fix these and send the full JSON again:\n- ${result.failures.join('\n- ')}`);
    process.exit(1);
  }
  await saveStory(result.story);
  console.log(`Saved ${result.story.chapters.length} chapters to public/data/story/${key}.json`);
  process.exit(0);
}

if (flag('refresh-facts')) {
  if (!saved) throw new Error(`No saved story for ${team}.`);
  const chapters = saved.chapters.map((c) => ({ ...c, facts: chapterFacts(season, rosterId, c.week).facts }));
  for (const c of chapters) {
    const gone = c.story.beats.filter((b) => !c.facts.some((f) => f.id === b.factId));
    for (const b of gone) console.log(`Week ${c.week}: "${b.eyebrow}" no longer has a fact, so its card has no graphic.`);
  }
  await saveStory({ ...saved, chapters });
  console.log(`Refreshed ${chapters.length} chapters in public/data/story/${key}.json`);
  process.exit(0);
}

if (flag('facts') || flag('dry-run')) {
  const only = option('week');
  const chosen = only ? [only] : Array.from({ length: through }, (_, i) => i + 1);
  for (const week of chosen) {
    const chapter = chapterFacts(season, rosterId, week);
    if (flag('dry-run')) {
      console.log(`--- system ---\n${SYSTEM_PROMPT}\n\n--- user ---\n${chapterPrompt(story, chapter)}`);
    } else {
      console.log(`\nWeek ${week}`);
      for (const { series, ...fact } of chapter.facts) console.log(`  ${JSON.stringify(fact)}`);
    }
  }
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY first, for example in a .env.local file in this folder (git ignores it).');
  process.exit(1);
}
const client = new Anthropic();
let cost = 0;
for (let week = (story.throughWeek ?? 0) + 1; week <= through; week++) {
  const chapter = chapterFacts(season, rosterId, week);
  const generated = await generateChapter({ client, story, chapter, playerNames });
  story = addChapter(story, chapter, generated);
  await saveStory(story);

  const { input_tokens: input = 0, output_tokens: output = 0 } = generated.usages.reduce((sum, u) => ({
    input_tokens: sum.input_tokens + (u.input_tokens ?? 0),
    output_tokens: sum.output_tokens + (u.output_tokens ?? 0),
  }), { input_tokens: 0, output_tokens: 0 });
  const spent = input * INPUT_PER_TOKEN + output * OUTPUT_PER_TOKEN;
  cost += spent;

  const c = generated.chapter;
  console.log(`\n=== Week ${week}: ${c.headline} [${c.mood}]${generated.fallback ? ' (PLAIN FALLBACK)' : ''}`);
  console.log(c.dek);
  for (const beat of c.beats) console.log(`  [${beat.factId}] ${beat.eyebrow}: ${beat.text}`);
  console.log(`  >> ${c.cliffhanger}`);
  for (const t of c.threads) console.log(`  thread ${t.status}: ${t.id} (${t.note})`);
  for (const w of generated.warnings) console.log(`  warning: ${w}`);
  for (const f of generated.failures ?? []) console.log(`  failed: ${f}`);
  console.log(`  ${generated.attempts} attempt(s), ${input} in / ${output} out, about $${spent.toFixed(3)}`);
}
if (story.arc) console.log(`\nSo far: ${story.arc.logline} (${story.arc.act})`);
console.log(`Saved to public/data/story/${key}.json, about $${cost.toFixed(2)} this run.`);
