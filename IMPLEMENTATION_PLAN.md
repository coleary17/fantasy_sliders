# Story phase 1 implementation plan

Implemented locally · 6 November 2026 · based on [PRODUCT_PLAN.md](PRODUCT_PLAN.md).

## Implementation status

The phase 1 code is implemented: scoped story identity and compatibility, offline cataloging, CLI catalog refresh, a team picker, canonical/legacy links, navigation and recovery states, and production route gating. Existing league data is the primary development source. The new raw outputs are imported through the existing fact checks; originals are retained when a corrected copy is needed.

Validation: 145 automated tests, lint, and production build passed. Browser checks covered 375 × 667, 390 × 844, and desktop layouts; real Connacht Cougars/Substation switching at the same week; Back/Forward; direct-link reload; missing stories/weeks; tap advancement; resize; and refresh preserving the selected week. Production preview rejected the Story route, and `dist/data` was absent. A final routing dependency fix also passed the targeted route tests and lint. Reduced-motion preference emulation and physical touch-device testing remain manual follow-ups; they were not exercised in this browser pass.

Private publishing remains phase 2 and has not been deployed. The sections below retain the implementation decisions and acceptance criteria for reference.

## Outcome and scope

Deliver the first implementation slice using the existing league data and saved stories, with a team picker and direct links to a team's week in the existing phone reader. The user is generating stories for the remaining teams; support those files as they arrive. Treat this as phase 1, before private publishing. Preserve the local CLI and existing saved stories.

This phase is complete when at least two existing league stories can be selected and read locally, newly generated team stories become discoverable, and links, switching, and browser navigation work at phone width. Reading saved stories must not require provider credentials or a fresh LLM call. Synthetic fixtures remain useful for isolated tests, not a prerequisite for the reader.

This updates the product plan's synthetic-first development assumption following the user's direction on 6 November. Keep real league files git-ignored and preserve the separate prerequisite concerning data rights before inviting external leagues.

## Review of the product plan

The sequence is sound: stabilize the reader, establish private publishing, then add paid generation. Phase 1 needs explicit decisions about identity, story discovery, and URL behavior so phase 2 can reuse its reader. The proposed defaults below make that slice implementable.

Two later requirements deserve separate design work before phase 2/3 implementation:

- Private publishing needs an authentication and invitation mechanism, server-enforced membership, revision storage, and a policy for private response caching. Hiding the Story tab is not access control; `Root.jsx` currently accepts direct Story hashes even in production.
- Atomic budget reservations need a storage design that can guarantee concurrency safety. Do not assume the existing Blob store provides the required transaction semantics. Evaluate this before choosing the hosted job implementation.

The existing fact checker is useful but is not a general proof of factual correctness: it checks numbers against allowed facts and names against a supplied player list. Keep commissioner review in the publishing workflow, and validate structure and fact references as well as copy when introducing edits.

## Current baseline

Inspected the working tree at `e6b0d19`. Story work remains uncommitted; preserve those changes during implementation.

| Area | Current behavior | Work needed |
| --- | --- | --- |
| Loader | `src/story/data.js` imports the collector's league ID, fetches Sleeper for the season, then loads a local file | Explicit identity and local catalog |
| Saved stories | CLI keys are `YYYY-rNN`; `newStory` has no league ID | Shared scoped identity with legacy compatibility |
| Reader | Roster 7 default; route parsed once on mount | Team picker and reactive route handling |
| Links | `#/story/{roster}/{week}`; scrolling replaces the hash | Include league and season; handle history and switching |
| Story discovery | Saved local stories; more teams being generated | Catalog existing stories and expose availability for every team |
| Empty state | Missing file handled; cover assumes a final chapter and game fact | Distinguish missing, invalid, empty, and failed loads |
| Production | Story tab hidden; build strips `dist/data` | Keep reader development-only and gate direct route consistently |

Baseline checks run on 6 November: `npm test` passed 132 tests; `npm run lint` and `npm run build` passed. Tooling reported stale browser-data warnings. ESLint does not cover `.mjs`; passing checks are not a full review of the uncommitted Story work. No phone UI verification has been performed for this draft.

## Proposed implementation sequence

### 1. Establish Story identity and compatibility

Files: new `lib/story/identity.mjs`, `lib/story/chapter.mjs`, `src/story/data.js`, `scripts/generate-story.mjs`, relevant tests.

- Define a shared identity `{ leagueId, season, rosterId }`. Keep league IDs as strings; validate season and roster values and encode path segments.
- Add league ID to newly created stories. Use a flat scoped key such as `{leagueId}-{season}-r{NN}` so the existing local store can keep indexing JSON files without a nested-directory rewrite.
- Change the reader loader to accept explicit identity and an injectable fetch implementation. It must not discover the season through Sleeper on each load.
- Check loaded document identity and minimum reader structure before rendering. Return distinct missing, invalid, and request-failure states; treat the dev server's HTML fallback as missing.
- Preserve reads of `YYYY-rNN` files only for the original league's explicitly configured local context. Never use that fallback for another league. New writes use scoped keys and retain legacy files.
- Keep the existing CLI invocation working. Resolve the original league and its season once, pass identity through to story creation and saving, and resume legacy stories safely. Do not add general multi-league collection in this slice: saved week documents still lack league scoping.

Acceptance: two identities cannot resolve to the same new key; a document for another team is rejected; the original local story remains readable; Node imports remain browser-global-free.

### 2. Discover and reuse existing league stories

Files: new `scripts/index-stories.mjs`, `scripts/generate-story.mjs`, `scripts/local-store.mjs` as needed, `package.json`, Story tests.

- Build a local catalog from saved story documents and existing league/team metadata. Include league ID, season, roster ID, display name, available weeks, and story availability for every team. Prefer locally saved metadata; if a roster is missing, allow an explicit refresh from Sleeper rather than a live request every time a story is opened.
- Add `npm run story:index` to refresh the catalog without generating copy or rewriting stories. Validate document shape and identity, skip auxiliary JSON such as the player cache and index, and report unusable files clearly. Prefer scoped files when both scoped and legacy versions exist.
- Refresh the catalog after successful CLI generation/import saves. Keep the explicit indexing command for stories produced through other workflows, and refresh the picker catalog when the reader is reopened or the user requests it.
- Show teams with no saved story as “Not written yet”; preserve access to the picker from that state. Display each team's actual available weeks rather than assuming every team has the same coverage.
- Preserve existing prose, facts, prompt-version metadata, and files. Cataloging must not trigger regeneration, `--force`, or `--refresh-facts`. Flag older prompt versions for review without blocking reading; the known roster 7 chronology issue remains a separate content task.
- Reuse saved week documents and the existing facts/import pipeline for subsequent content work. The user is generating the remaining stories; this implementation slice does not start paid generation or rewrite those outputs.
- Use small synthetic objects only for deterministic automated tests and missing/error cases. Keep private league inputs and generated stories under the existing ignored paths.

Acceptance: `npm run story:index` → `npm run dev` exposes existing saved stories without LLM calls. Adding another team's valid story and refreshing the index makes it selectable without a code change. A team with no story remains visible and recoverable. Indexing leaves original story content unchanged.

### 3. Make routing and team switching reliable

Files: new `src/story/route.js` and tests, `src/Root.jsx`, `src/story/StoryPage.jsx`, `src/story/data.js`.

- Use canonical links `#/story/{leagueId}/{season}/{rosterId}/{week?}`. A bare `#/story` opens the configured league catalog's first available team. Resolve old roster/week links only within the original league context and canonicalize them.
- Subscribe to hash changes so an already-mounted reader responds to direct links and browser Back/Forward. Separate route-driven positioning from scroll-driven URL replacement to avoid loops or overwriting a requested week during loading.
- Add a labeled team picker outside the tappable slide track. Team changes create history entries, retain the selected week when available, and otherwise open the cover. An unavailable week opens the cover with a short explanation; an unknown team shows a recoverable state rather than silently choosing another team.
- Clear old slides and scroll position during identity changes; ignore stale fetch responses. Keep the picker and close control available during missing/error states.
- Preserve swipe, tap, week progress, reduced motion, and keyboard behavior. Arrow handling must not interfere with the focused picker or other form controls. Recalculate positioning when viewport width changes.
- Supply a theme-token fallback for roster IDs without a `--team-*` variable. Handle empty chapters and missing cover facts without crashing.
- Gate the direct Story route consistently with the development-only tab until private publishing is ready.

Acceptance: opening and refreshing a week link selects its intro card; switching A → B → A never shows the other team's content; Back/Forward works while mounted; swiping updates the week without adding a history entry per card.

### 4. Verify and document the slice

Files: tests beside existing Story modules, `README.md`, and `AGENTS.md` once implementation status changes.

- Test route parsing/formatting and legacy resolution, scoped loading, missing/HTML/invalid responses, mismatched identities, missing weeks, and deterministic fixture validation with `node:test` and fake fetches.
- Add tests to the package script if any live outside its current explicit globs. Review changed `.mjs` files directly rather than relying on ESLint coverage.
- Check the actual reader at 375 × 667 and 390 × 844, plus desktop: both teams, both weeks, reload, Back/Forward, rapid switching, long copy, absent story, keyboard selection, reduced motion, and resize. Verify cards and controls are not clipped and the picker does not advance the story.
- Run `npm test`, `npm run lint`, and `npm run build`; verify generated/private story files are absent from the production output and direct Story URLs cannot expose the development reader there.
- Document the indexing command and example links, scoped keys and legacy behavior, and existing CLI `--export`, `--import`, and `--refresh-facts` workflows. Clarify that refreshing facts does not regenerate or automatically revalidate existing prose.

Acceptance evidence: passing checks, recorded phone screenshots or browser observations, and a reproducible README walkthrough. Do not treat unit tests as evidence that swipe and layout behavior work.

## Handoff to phase 2

Keep the loader boundary independent of its local-file transport, so a future authorized API can return the same reader document assembled from published chapter revisions. The local catalog is development data, not an authorization mechanism.

Before beginning private publishing, decide the authentication provider and invitation flow, commissioner/reader role model, revision and published-pointer storage, concurrency behavior for edits/publishing, and how withdrawn content is removed from caches. Scope revisions by league, season, roster, and week; keep draft edits separate from the revision readers see.

Hosted APIs, paid generation, budget enforcement, branding presets, second-league onboarding, and deployment are subsequent work. This draft does not choose providers or authorize paid runs. The product plan's data-rights check remains a prerequisite before inviting external leagues.
