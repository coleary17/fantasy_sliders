# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

"The New World Order" is a private site for one Sleeper fantasy football league: live win probability graphs, playoff odds with what-if picks, and (in progress) a generated serial about each team's season. React 19, Vite and Tailwind on the front end, Netlify Functions and Blobs on the back end. It uses plain JavaScript, with no TypeScript.

## Commands

```bash
npm run dev       # Vite dev server. The preview config in .claude/launch.json is "win-probability", port 5199
npm test          # node:test, no framework
npm run lint      # ESLint
npm run build     # vite build, then removes dist/data so local data never ships

node --test lib/collector.test.mjs                            # one test file
node --test --test-name-pattern="some words" lib/*.test.mjs   # tests matching a name

npm run collect              # save one snapshot to public/data/wp (add -- --loop to keep going)
npm run backfill -- 8        # rebuild a finished week, or a range (1-8), from ESPN play-by-play. Has --dry-run and --force
npm run story -- 7 --facts   # one team's story facts, no LLM. See the flags at the top of scripts/generate-story.mjs

npm run build && npx netlify-cli deploy --prod --dir=dist     # deploy. A git push does not deploy
npx netlify-cli blobs:set win-probability 2026-w09 --input public/data/wp/2026-w09.json   # upload a local week
```

Two tooling gaps to know about:
- `npm test` lists its test folders explicitly in `package.json`. A test in a new folder won't run until it's added there.
- ESLint's rules are only configured for `.js` and `.jsx`, so `npm run lint` passing says nothing about `lib/`, `scripts/` or `netlify/` (all `.mjs`).

## Architecture

`lib/` is the shared core, written to run in Node and the browser. The same modules are used by the Netlify functions, the local scripts and the React app. `collect()` takes `store`, `fetchImpl` and `now` as arguments, and that's how one collector runs against Blobs, against local files, or under test.

### The week document

Everything except live standings hangs off one JSON document per NFL week, keyed `YYYY-wNN` (`weekKey` in `lib/collector.mjs`). It holds teams, matchups, players, snapshots and plays. Three things write it or depend on its shape, so a change to it reaches all of them:

- **Written by** `lib/collector.mjs` (live) and `lib/backfill.mjs` (rebuilt after the fact). Backfilled weeks spread each starter's gap across their game, so they always end on Sleeper's exact final scores.
- **Stored in** the Netlify Blob store `win-probability` in production, or `public/data/wp/` locally (`scripts/local-store.mjs`, git-ignored).
- **Read by** the win probability page, the playoff odds page (`weekReading`) and the story facts.

Already-saved weeks keep their old shape, so a new field needs a fallback or a backfill. Chart labels and box scores come from what was saved, so a collector change doesn't alter old data, and a running `collect-local` needs a restart to pick it up.

### Collection

`netlify/functions/collect.mjs` fires every minute and `lib/schedule.mjs` decides whether to run: every minute inside a game window, every 5 minutes otherwise. Sleeper has no score history, so a chart only covers time after collection started.

Each source has one job. Sleeper supplies scores, projections and stat lines. ESPN supplies game clocks and scoring and defensive plays, and Sleeper's schedule is the fallback for game status if ESPN is down. Sleeper's stats trigger a read of an ESPN game when a starting defense makes a play that doesn't change the score, and settle which of those plays stand once the game ends.

During live games every run is visible on the site, but only some snapshots stay in the history (`shouldKeep`). The others are marked `latestOnly`, and the next run replaces them so the file doesn't grow by one snapshot a minute.

### Serving and the local fallback

`src/winprob/data.js` tries `/api/wp` (`netlify/functions/wp.mjs`, with ETags so polling phones get 304s) and falls back to `/data/wp/*.json`. Local dev has no functions, so it always takes the fallback. In dev a missing file comes back as the app's HTML, which is why JSON parse failures are treated as "not found" here and in the story loader.

### Win probability

`lib/model.mjs` is a normal approximation: each team's expected final score and variance come from its starters' projections and remaining game time, with standard deviations per position measured on this league. Snapshots store `expected`, `variance` and raw starter data, the client computes the probability from them, and the raw data is kept so the model can be re-run on old weeks. `src/winprob/events.js` and `scoring.js` turn snapshots and plays into key moments and chart labels.

### Playoff odds

The browser fetches standings and schedule directly from Sleeper and merges in the collector's latest reading for unscored weeks (`src/playoffs/data.js`). `lib/playoffs.mjs` runs a seeded Monte Carlo in a Web Worker (`odds.worker.js`). What-if picks are saved per season in `localStorage`. All games through the last picked week count as decided, at picked or projected scores, and later weeks stay simulated.

### Story

The rule behind this feature is that the LLM never supplies a fact.

1. `lib/story/season.mjs` gathers Sleeper data and saved week documents. Sleeper files the main waiver run under the week whose games just finished, so `movesByLineupWeek` moves it to the next week by timestamp.
2. `lib/story/facts.mjs` computes what a chapter may state, using only data up to that week so it can't spoil later ones. It imports `src/winprob/data.js` and `events.js`, so those two files have to stay importable from Node.
3. `lib/story/chapter.mjs` has Claude write against a JSON schema, then `checkChapter` verifies every number and full player name against the facts. It retries once, then falls back to a plain chapter.
4. `scripts/generate-story.mjs` saves to `public/data/story/` (git-ignored). `src/story/` renders the swipeable cards, and `Graphics.jsx` draws each fact's graphic from the fact data.

There are two ways to write a story, and both go through the same checks. API generation (`npm run story -- 7`) goes week by week, needs `ANTHROPIC_API_KEY` in the environment or `.env.local`, and costs money. The app route (`--export`, then paste the reply into a file and `--import <file>`) has the Claude app write the whole season at once. `--refresh-facts` rebuilds a saved story's facts and keeps the writing. The README doesn't cover the app route or `--refresh-facts`.

Bump `PROMPT_VERSION` when the prompt changes. Saved stories started on an older version only get a printed note until they're regenerated with `--force`.

### Front end

Routing is by hash in `src/Root.jsx`, with no router library. Theme colors are CSS variables in `src/index.css`, exposed through `tailwind.config.js`, so use those tokens rather than literal colors. The site is mainly read on phones (`useIsPhone`, bottom tab bar, `src/polling.js` pauses while hidden and refreshes on return), so check layouts at phone width.

### League-specific values

- `LEAGUE_ID` is hardcoded in `lib/collector.mjs`.
- `lib/schedule.mjs` has 2026's international and holiday dates. **They must be added by hand each season**, or early kickoffs fall outside the per-minute window.
- `LAST_LEAGUE_WEEK` is defined separately in `lib/collector.mjs` and `lib/story/season.mjs`.
- `fantasy-football-spec.md` describes the original slider app, which has been removed. It's history, not a current spec. The what-if picks on the playoff odds page now do that job.

## Initiatives underway

State as of 2026-11-06, the middle of the 2026 season (week 9). This section goes stale, so check `git status` and `git log`, and update it when an initiative changes.

| Initiative | Status |
| --- | --- |
| Win probability and live collection | Shipped. It runs in production through the season, so collector changes affect live data |
| Playoff odds and what-if picks | Shipped |
| Backfill of uncollected weeks | Shipped |
| Phone usability, installable icons and manifest, banknote theme | Shipped in the latest commits |
| **The Story So Far** | **In progress and uncommitted** |

**Where the story work stands:**

- It's all uncommitted on the `win-probability` branch, whose last commit matches `main`: `lib/story/`, `scripts/generate-story.mjs`, `src/story/`, plus edits to `scripts/local-store.mjs`, `src/Root.jsx`, `src/winprob/events.js`, `package.json`, `package-lock.json`, `README.md` and `.gitignore`.
- It's local only. The Story tab appears only under `import.meta.env.DEV`, and stories are loaded from local files. There's no hosted storage or function for them, and `npm run build` strips `dist/data`, so shipping it needs both a place to store stories and the tab enabled.
- Only roster 7 (the default team in `StoryPage.jsx`) has a story so far. It covers weeks 1-8, was written through the Claude app route, and is saved at prompt version 2, while the code is at version 3. Version 2 was written before moves were reassigned to the lineup week they affect, so some of its chapters have waiver moves in the wrong order and need regenerating.
