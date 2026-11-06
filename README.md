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

## Playoff odds

`lib/playoffs.mjs` simulates the rest of the regular season in the browser, from Sleeper's
standings and schedule plus the collector's latest reading for the current week. The what-if
picks cover every remaining regular-season week: all games through the last picked week count as
decided, at their picked or projected scores, and later weeks stay simulated.

## Deployment

Deploy from this folder with `npm run build && npx netlify-cli deploy --prod --dir=dist`. The
Netlify site isn't linked to GitHub, so a push doesn't deploy.
