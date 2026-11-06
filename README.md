# The New World Order

Win probability graphs and a playoff simulator for our Sleeper league.

## Win probability

`netlify/functions/collect.mjs` runs every 5 minutes on Netlify and saves a snapshot
of each matchup to Netlify Blobs. Sleeper has no score history, so a graph only covers
time after collection started. Scores and projections come from Sleeper, and game
clocks from ESPN. The model is in `lib/model.mjs`.

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

## Deployment

Netlify builds from `netlify.toml` on each push to GitHub.
