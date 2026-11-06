import { ORIGINAL_LEAGUE_ID, legacyStoryKey, normalizeStoryIdentity, storyKey, validateStoryDocument } from '../../lib/story/identity.mjs';

// Vite serves the app HTML for missing files; other malformed JSON is an invalid file.
async function readJson(path, fetchImpl) {
  try {
    const response = await fetchImpl(path, { cache: 'no-store' });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'error', message: `Request failed (${response.status}).` };
    const body = await response.text();
    if (/^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(body)) return { status: 'missing' };
    try { return { status: 'ready', value: JSON.parse(body) }; }
    catch { return { status: 'invalid', message: 'The file is not valid JSON.' }; }
  } catch {
    return { status: 'error', message: 'Could not load the file.' };
  }
}

export async function loadStory(identity, { fetchImpl = fetch } = {}) {
  let normalized;
  try { normalized = normalizeStoryIdentity(identity); }
  catch { return { status: 'invalid', message: 'Invalid story identity.' }; }
  let result = await readJson(`/data/story/${storyKey(normalized)}.json`, fetchImpl);
  let legacy = false;
  if (result.status === 'missing' && normalized.leagueId === ORIGINAL_LEAGUE_ID) {
    result = await readJson(`/data/story/${legacyStoryKey(normalized)}.json`, fetchImpl);
    legacy = true;
  }
  if (result.status !== 'ready') return result;
  const problems = validateStoryDocument(result.value, normalized, { allowLegacy: legacy });
  return problems.length ? { status: 'invalid', message: problems.join(' ') } : { status: 'ready', story: result.value };
}

function validCatalog(catalog) {
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.leagues)) return false;
  const identities = new Set();
  return catalog.leagues.every((league) => {
    if (!league || !Array.isArray(league.teams)) return false;
    try { normalizeStoryIdentity({ ...league, rosterId: 1 }); } catch { return false; }
    return league.teams.every((team) => {
      let identity;
      try { identity = normalizeStoryIdentity({ ...league, rosterId: team?.rosterId }); } catch { return false; }
      const key = storyKey(identity);
      if (identities.has(key)) return false;
      identities.add(key);
      return typeof team.team === 'string' && !!team.team.trim() && typeof team.available === 'boolean'
        && Array.isArray(team.weeks) && team.weeks.every((week) => Number.isSafeInteger(week) && week > 0)
        && new Set(team.weeks).size === team.weeks.length
        && (team.promptVersion === undefined || (Number.isSafeInteger(team.promptVersion) && team.promptVersion >= 0));
    });
  });
}

export async function loadCatalog({ fetchImpl = fetch } = {}) {
  const result = await readJson('/data/story/catalog.json', fetchImpl);
  if (result.status !== 'ready') return result;
  return validCatalog(result.value) ? { status: 'ready', catalog: result.value } : { status: 'invalid', message: 'The story catalog is invalid.' };
}

// The cards in reading order: a cover, each week's title, beats and sign-off, then where it stands.
export function buildSlides(story) {
  const slides = [{ kind: 'cover', week: null }];
  for (const { week, facts, story: chapter } of story.chapters) {
    const fact = (id) => facts.find((f) => f.id === id) ?? null;
    slides.push({ kind: 'intro', week, chapter, game: fact('game') });
    for (const beat of chapter.beats) slides.push({ kind: 'beat', week, beat, fact: fact(beat.factId), game: fact('game'), foe: fact('foe') });
    slides.push({ kind: 'cliffhanger', week, chapter, standings: fact('standings'), game: fact('game') });
  }
  slides.push({ kind: 'end', week: null });
  return slides;
}

export const firstSlideOfWeek = (slides, week) => Math.max(slides.findIndex((s) => s.week === week), 0);

// How far through each week's cards a reader is, from 0 to 1, for the progress bar.
export function weekProgress(slides, index) {
  const weeks = [...new Set(slides.map((s) => s.week).filter((w) => w !== null))];
  return weeks.map((week) => {
    const cards = slides.map((s, i) => [s, i]).filter(([s]) => s.week === week).map(([, i]) => i);
    const seen = cards.filter((i) => i <= index).length;
    return { week, share: seen / cards.length };
  });
}
