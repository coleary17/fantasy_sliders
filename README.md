# The New World Order

Win probability graphs and playoff odds for our Sleeper league.

## Win probability

`netlify/functions/collect.mjs` runs on Netlify and saves a snapshot of each matchup to
Netlify Blobs. It runs every minute during the game windows in `lib/schedule.mjs`, and every
5 minutes otherwise. Add each season's international and holiday dates there. Sleeper has no score history, so a graph only covers
time after collection started. Scores and projections come from Sleeper, and game
clocks, scoring plays and defensive plays from ESPN. Sleeper's stats trigger a read of a game when a starting defense makes a play that doesn't change the score, and settle which of those plays stand once the game ends. Chart labels and box scores come from what the collector
saved, so a running `collect-local` needs a restart to pick up collector changes. The model is
in `lib/model.mjs`.

```bash
npm test
npm run collect    # save one snapshot to public/data/wp for local viewing
npm run dev
```

### Moving snapshots collected locally to Netlify

Once the site is deployed, upload the local file, then stop the local collector:

```bash
npx netlify-cli blobs:set win-probability 2026-w09 --input public/data/wp/2026-w09.json
pkill -f collect-local
```

### Rebuilding a week that wasn't collected

`npm run backfill -- 8` rebuilds a finished week from ESPN's play-by-play and saves it to
`public/data/wp`, printing how close the plays came to Sleeper's finals. Each starter's gap is
spread over their game, so the week always ends on Sleeper's exact scores. Sleeper may have changed a
past week's projections, so early odds are an estimate. Upload it the same way as a local snapshot.

## Playoff odds

`lib/playoffs.mjs` simulates the rest of the regular season in the browser, from Sleeper's
standings and schedule plus the collector's latest reading for the current week. The what-if
picks cover every remaining regular-season week: all games through the last picked week count as
decided, at their picked or projected scores, and later weeks stay simulated.

## The story so far

`lib/story/facts.mjs` works out what happened to a team each week: the game, how the odds moved, waiver bids won and lost, lineup regrets and the table. A chapter only sees data up to its own week. `lib/story/chapter.mjs` asks Claude to write around those facts, then checks every number and full player name against them. It retries once, then falls back to a plain chapter.

```bash
npm run story -- 7 --facts            # print a team's facts, no LLM
npm run story -- 7 --dry-run --week 5 # print the prompt, no LLM
npm run story -- 7                    # write chapters to public/data/story, resuming if stopped
```

Generating needs `ANTHROPIC_API_KEY`, in the environment or in a `.env.local` file here. Add `--force` to start a team over.

### Reading and discovering local stories

```bash
npm run story:index  # catalog saved stories and team names from local week documents
npm run dev
```

Open the Story tab and choose a team. The catalog includes teams whose stories have not been written yet. Re-run `story:index` after adding story files outside the CLI, then refresh the reader's catalog. Reading and indexing saved files make no LLM calls and need no provider key. The catalog uses local data by default; `npm run story:index -- --refresh` explicitly refreshes league/team metadata from Sleeper.

Direct links use `#/story/{leagueId}/{season}/{rosterId}/{week}`; omit the week to open the cover. Existing `#/story/7/3` links still resolve within the original league. Team switching retains the current week when the other team has it. Browser Back and Forward return to earlier selections.

New stories use `{leagueId}-{season}-rNN.json` under `public/data/story/`. The original league's existing `YYYY-rNN.json` files remain readable and are retained when the CLI resumes into a scoped file. `catalog.json` lists available teams and weeks; `index.json` is the local store's generic file index. Private stories and catalog data stay git-ignored. The Story reader remains development-only, and production builds remove `dist/data`.

### Writing through the app

```bash
npm run story -- 7 --export             # export the facts and writing prompt
npm run story -- 7 --import /path/to/reply.json # validate the app's reply and save
npm run story -- 7 --refresh-facts      # replace saved facts while retaining prose
```

Export and import do not call the paid model API. They still load the league data needed to compute and validate facts. Successful CLI saves update the catalog. Refreshing facts does not regenerate or fully revalidate existing prose; review the writing when facts change. Older prompt versions remain readable and are flagged for review rather than silently regenerated.

## Deployment

Deploy from this folder with `npm run build && npx netlify-cli deploy --prod --dir=dist`. The
Netlify site isn't linked to GitHub, so a push doesn't deploy.
