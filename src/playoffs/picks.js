const storageKey = (season) => `playoff-picks-${season}`;
const memory = new Map(); // keeps picks across views when the browser blocks storage

export function loadPicks(season) {
  if (memory.has(season)) return memory.get(season);
  try {
    return JSON.parse(localStorage.getItem(storageKey(season))) ?? {};
  } catch {
    return {};
  }
}

export function savePicks(season, picks) {
  memory.set(season, picks);
  try {
    localStorage.setItem(storageKey(season), JSON.stringify(picks));
  } catch {
    // Nothing to do: the picks still hold for this visit.
  }
}
