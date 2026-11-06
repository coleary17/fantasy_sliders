# The Story So Far product plan

The first milestone is a hosted team serial. A commissioner generates a chapter for a team and week, reviews it in the existing swipeable reader, and publishes it for invited league members. Test that workflow in The New World Order before opening self-serve onboarding or adding billing.

The current prototype runs locally and defaults to roster 7. It already computes chapter facts, validates generated copy, and falls back to a plain chapter. Keep the [fact builder](lib/story/facts.mjs), [chapter generator](lib/story/chapter.mjs), [local CLI](scripts/generate-story.mjs), and [card reader](src/story/StoryPage.jsx) as the starting point.

## 1. Stabilize the Story prototype

- Review the uncommitted Story work and run the repo checks. Add a reproducible demo with synthetic facts for two teams in the same league.
- Pass league, season, and roster IDs explicitly through the Story loader and reader. Replace the hardcoded roster with a team picker.
- Keep the local CLI workflow available. Check the cards and direct team and week links at phone width.

**Done when** two teams can have different stories, and opening a direct link selects the right team and week on a phone.

## 2. Add private publishing

- Add a hosted Story API and store drafts and published revisions by league, season, roster, and week.
- Invite commissioners and readers manually for the pilot. Enforce league membership and role permissions on the server for each read and write.
- Give commissioners draft preview, copy editing, publish, and unpublish controls. Run edited copy through the existing fact checks before publishing.
- When correcting a published chapter, keep serving the previous version until the commissioner publishes the correction.

**Done when** invited readers see only published chapters for their league, and a commissioner can preview, correct, publish, and withdraw a chapter.

## 3. Add hosted LLM generation and spend controls

- Start with a server-side job for one team and one week. Reuse the existing facts, schema, validation, retry, and plain chapter fallback.
- Keep provider keys and model configuration on the server. Record actual token usage and cost, including retries and regenerations.
- Deduplicate repeat submissions. Reserve the estimated maximum cost against the league's budget before each attempt and reconcile it against actual usage. Enforce reservations atomically across simultaneous jobs and include the cost of any later backfill.
- Generate chapters in order because later chapters draw on earlier ones. Preserve published revisions and flag later drafts for review when an earlier result changes. Let the commissioner decide whether to regenerate them.
- Keep the first admin screen focused on selecting a team and week, generating, previewing, publishing, and checking the remaining budget.

**Done when** a commissioner can generate and preview a draft, see the usage, and produce a plain chapter if generation fails or the budget runs out. Duplicate and concurrent jobs respect the cap.

## 4. Add league branding and sharing

- Make Banknote selectable and add two more presets using the existing theme tokens. Let commissioners set a crest and accent color.
- Apply the branding to the Story, charts, and a shareable card for a matchup turning point.
- Link the card back to the full story and require league access to read it.

**Done when** the Story, charts, and share card use the same branding, and sharing a card keeps private chapters behind league access.

## 5. Onboard a second league

- Scope live snapshots, playoff reads, and saved what-if picks by league and season. Preserve access to the original league's saved weeks and picks.
- Start with manually onboarded head-to-head leagues. Verify scoring, playoff rules, and tiebreakers before enabling projections for each league.
- Exercise both leagues during the same season and week to verify their data, permissions, and saved picks stay separate.

**Done when** two leagues can use the same season and week without mixing data, permissions, or picks.

## Pilot scope

Use synthetic fixtures for development while commercial data rights are being clarified. Before inviting external leagues, confirm that the intended data sources permit the pilot's collection, storage, sharing, and use of selected facts in LLM requests.

Defer automatic weekly generation, full-season backfills, self-serve onboarding, and billing until the pilot shows which chapters commissioners publish and what those chapters cost.

## First implementation slice

Build the two-team Story demo with a team picker and direct team and week links. Verify both teams in the existing swipeable reader on a phone-sized viewport. Use that reader for the hosted publishing workflow in phase 2.
