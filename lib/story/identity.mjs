import { LEAGUE_ID } from '../collector.mjs';

export const ORIGINAL_LEAGUE_ID = LEAGUE_ID;

export function normalizeStoryIdentity({ leagueId, season, rosterId } = {}) {
  if (typeof leagueId !== 'string' || !leagueId.trim() || leagueId !== leagueId.trim()) throw new Error('Invalid league ID.');
  const year = String(season ?? '');
  if (!/^\d{4}$/.test(year)) throw new Error('Invalid season.');
  if (!/^[1-9]\d*$/.test(String(rosterId ?? '')) || !Number.isSafeInteger(Number(rosterId))) throw new Error('Invalid roster ID.');
  return { leagueId, season: year, rosterId: Number(rosterId) };
}

export function storyKey(identity) {
  const { leagueId, season, rosterId } = normalizeStoryIdentity(identity);
  return `${encodeURIComponent(leagueId)}-${season}-r${String(rosterId).padStart(2, '0')}`;
}

export function legacyStoryKey(identity) {
  const { season, rosterId } = normalizeStoryIdentity(identity);
  return `${season}-r${String(rosterId).padStart(2, '0')}`;
}

// Validate the data needed by the reader without requiring every optional graphic fact.
export function validateStoryDocument(document, identity, { allowLegacy = false } = {}) {
  let expected;
  try { expected = normalizeStoryIdentity(identity); } catch { return ['Invalid story identity.']; }
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['Story must be an object.'];
  const problems = [];
  if (document.leagueId == null) {
    if (!allowLegacy || expected.leagueId !== ORIGINAL_LEAGUE_ID) problems.push('Story league ID is missing.');
  } else if (document.leagueId !== expected.leagueId) problems.push('Story league ID does not match.');
  if (String(document.season) !== expected.season) problems.push('Story season does not match.');
  if (document.rosterId !== expected.rosterId) problems.push('Story roster ID does not match.');
  if (typeof document.team !== 'string' || !document.team.trim()) problems.push('Story team is missing.');
  const textOrAbsent = (value) => value == null || typeof value === 'string';
  if (document.arc != null && (typeof document.arc !== 'object' || Array.isArray(document.arc) || !textOrAbsent(document.arc.logline))) problems.push('Story arc is invalid.');
  if (!Array.isArray(document.threads) || document.threads.some((t) => !t || typeof t !== 'object' || Array.isArray(t) || !textOrAbsent(t.title) || !textOrAbsent(t.note))) problems.push('Story threads are invalid.');
  if (!Array.isArray(document.chapters)) problems.push('Story chapters must be a list.');
  else {
    const weeks = new Set();
    for (const chapter of document.chapters) {
      if (!chapter || !Number.isSafeInteger(chapter.week) || chapter.week < 1 || weeks.has(chapter.week)) { problems.push('Chapter weeks must be unique positive integers.'); continue; }
      weeks.add(chapter.week);
      if (!Array.isArray(chapter.facts) || chapter.facts.some((f) => !f || typeof f !== 'object' || Array.isArray(f))) problems.push(`Week ${chapter.week} facts must be a list of objects.`);
      if (!chapter.story || typeof chapter.story !== 'object' || !['headline', 'dek', 'mood', 'cliffhanger'].every((key) => textOrAbsent(chapter.story[key])) || !Array.isArray(chapter.story.beats) || chapter.story.beats.some((b) => !b || typeof b !== 'object' || typeof b.factId !== 'string' || !textOrAbsent(b.eyebrow) || !textOrAbsent(b.text))) problems.push(`Week ${chapter.week} writing is invalid.`);
      if (Array.isArray(chapter.facts)) for (const fact of chapter.facts) {
        if (!fact || typeof fact !== 'object') continue;
        const arrays = fact.type === 'trade' ? ['got', 'gave'] : fact.type === 'turningPoint' ? ['ours', 'theirs'] : fact.type === 'biddingWar' ? ['rivals', 'cutToMakeRoom'] : fact.type === 'pickup' ? ['cutToMakeRoom'] : fact.type === 'winProb' ? ['series'] : [];
        if (arrays.some((key) => fact[key] != null && !Array.isArray(fact[key])) || (fact.type === 'trade' && (!Array.isArray(fact.got) || !Array.isArray(fact.gave)))) problems.push(`Week ${chapter.week} graphic data is invalid.`);
        const numbers = { game: ['ourScore', 'theirScore'], standings: ['playoffOddsPct', 'pointsFor'], turningPoint: ['fromPct', 'toPct'], performer: ['points'], opponentStar: ['points'], bust: ['projected', 'points'], biddingWar: ['bid'], market: ['budgetLeft'], droppedPlayerBoom: ['points'], gotAway: ['points'] }[fact.type] ?? [];
        if (fact.type === 'pickup' && fact.startedThisWeek) numbers.push('pointsThisWeek');
        if (fact.type === 'benchRegret') numbers.push(...(fact.benchedPlayer ? ['benchedPoints', 'startedPoints'] : ['pointsLeftOnBench']));
        if (numbers.some((key) => typeof fact[key] !== 'number' || !Number.isFinite(fact[key]))) problems.push(`Week ${chapter.week} graphic numbers are invalid.`);
      }
    }
  }
  return problems;
}
