<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Spades LLM Arena

Bots-vs-bots Spades. Drop in any combination of LLMs across the 4 seats and
watch them play. Game results persist to a SpacetimeDB-backed leaderboard
that anyone can read.

View this app in AI Studio:
https://ai.studio/apps/9b3ae051-69dc-4114-8546-029d001d90a8

---

## Quick start

**Prerequisites:** Node.js

```bash
npm install
cp .env.example .env.local      # then add at least one provider API key (see below)
npm run dev
```

The app opens at **http://localhost:5273/**. Click **Start Match** to play
right away — by default all four seats are configured for OpenRouter using
the free `openai/gpt-oss-120b:free` model. If you wait 60 seconds without
touching the screen, an auto-start match begins with the same defaults.

## Configuration

`.env.local` (gitignored) holds your API keys. Copy from `.env.example`.
Fill in only the providers you actually use:

| Variable                | Purpose                                                              |
|-------------------------|----------------------------------------------------------------------|
| `OPENROUTER_API_KEY`    | Default agent provider (live catalog of 300+ models, free tier ok)   |
| `ANTHROPIC_API_KEY`     | Direct Claude agents (Opus / Sonnet / Haiku)                         |
| `OPENAI_API_KEY`        | Direct GPT-4o / GPT-4o Mini agents                                   |
| `GEMINI_API_KEY`        | Direct Gemini Flash / Pro agents                                     |
| `YOUTUBE_STREAM_KEY`    | Used by `npm run stream:live` for unattended YouTube broadcasts      |
| `VITE_SPACETIME_URI`    | Override the SpacetimeDB endpoint (default: maincloud)               |
| `VITE_SPACETIME_MODULE` | Override the SpacetimeDB database name (default: `spades-arena`)     |

`Vite` bakes the `*_API_KEY` values into the JS bundle at build time. Treat
them like development credentials, not production secrets.

## How it works

```
┌──────────────────────────────────────────────────────────────────────┐
│ React app (Vite, port 5273)                                          │
│                                                                      │
│   GameSetup ──▶ useGame ──▶ engine/game.ts ◀── agents/{openrouter,   │
│        │                                       anthropic, openai,    │
│        │                                       llm (gemini),         │
│        │                                       heuristic, random}    │
│        ▼                                                             │
│   On game over: spacetime-results.recordCompleteGame()               │
│        │                                                             │
│        ▼                                                             │
│   spacetime-bindings/  ──▶ DbConnection ──▶ SpacetimeDB Maincloud    │
│        ▲                                       │                     │
│        │                                       ▼                     │
│   Dashboard ◀── useSpacetime{Leaderboard,Matchups,GameCount}         │
│   (subscribes to live `game` and `model` tables)                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Components

| Path                           | Role                                                       |
|--------------------------------|------------------------------------------------------------|
| `src/engine/`                  | Pure-TS Spades rules: deck, game state, scoring, runner    |
| `src/agents/`                  | One file per provider (random, heuristic, openrouter, …)   |
| `src/components/`              | React UI: `GameSetup`, `GameBoard`, `Dashboard`, …         |
| `src/hooks/useGame.ts`         | Drives the bid/play loop; writes results on game over      |
| `src/hooks/useSpacetime.ts`    | Live read hooks (leaderboard, matchups, game count)        |
| `src/hooks/useOpenRouterModels.ts` | Fetches the live OpenRouter `/v1/models` catalog       |
| `src/spacetime-client.ts`      | Singleton `DbConnection`, defaults to maincloud            |
| `src/spacetime-results.ts`     | Bridges engine results → `record_complete_game` reducer    |
| `src/spacetime-bindings/`      | Generated TS types and reducers (don't hand-edit)          |
| `spacetime/module/`            | Rust SpacetimeDB module (publishes as `spades-arena`)      |
| `spacetime/encoding/`          | Pure-Rust encoding crate, no external deps                 |
| `stream/orchestrator.ts`       | Headless Playwright + FFmpeg for YouTube broadcasts        |

### SpacetimeDB

The `spades-arena` module is published to **SpacetimeDB Maincloud** at
identity `c200c1c5270178f7cd5066b7b9ff02a74743f95e40e28841ecfedfbd1406ff18`.
The React client connects to it with no configuration.

For local development of the module itself (or fully offline play), see
[`spacetime/SETUP.md`](spacetime/SETUP.md).

## NPM scripts

| Script                       | What it does                                                |
|------------------------------|-------------------------------------------------------------|
| `npm run dev`                | Vite dev server, port 5273 (strict)                         |
| `npm run build`              | Production build                                            |
| `npm run preview`            | Serve the production build locally                          |
| `npm run lint`               | TypeScript type-check (`tsc --noEmit`)                      |
| `npm run stream`             | Headless orchestrator: bots play continuously in Playwright |
| `npm run stream:live`        | Same as above, plus FFmpeg → YouTube RTMP                   |
| `npm run spacetime:list`     | List databases on maincloud                                 |
| `npm run spacetime:logs`     | Tail the last 50 lines of the `spades-arena` module log     |
| `npm run spacetime:publish`  | Publish prebuilt wasm to maincloud                          |
| `npm run spacetime:generate` | Regenerate `src/spacetime-bindings/` from the module schema |

Tests run via `npx vitest run`.

---

## What we did (recent work)

- **Vite port collision fixed** — moved from `:5173` (which clashed with
  unrelated Vite projects on the same machine) to **`:5273` with
  `strictPort: true`**. Mistakes are now loud, not silent.
- **SpacetimeDB cloud-default** — `spades-arena` is published to maincloud
  and the React client targets it out of the box. Dashboard data comes from
  there, not localStorage. (`commit 04556b6`)
- **Dashboard now reads live from SpacetimeDB** — total games, leaderboard,
  and head-to-head matchups all subscribe to the live `game` + `model`
  tables. Demo seed data is no longer used. (`commit 1b562d2`)
- **OpenRouter is the default LLM provider** — all four bot seats default to
  OpenRouter, populated from a live fetch of OpenRouter's `/v1/models` catalog
  (cached 24 h in localStorage; falls back to a curated 10-model list if the
  fetch fails).
- **Free-tier-friendly defaults** — the default sub-model is
  `openai/gpt-oss-120b:free` so manual matches and the unattended auto-start
  don't burn paid token credits.
- **Rate-limit fallback** — on the first HTTP 429 from OpenRouter, the
  `OpenRouterAgent` flips a one-way flag and delegates every subsequent
  decision to an internal `RandomAgent`, instead of retry-storming the
  rate-limited endpoint. Covered by `src/agents/openrouter_agent.test.ts`.
- **Streaming orchestrator URL fixed** — `stream/orchestrator.ts` now points
  at the new Vite port (`:5273`). (`commit 558bb69`)
- **Cheating-mode enforcement** — the engine now honors the per-game
  `CheatingPolicy` (`allow_renege`, `spades_lead_policy`, `minimum_team_bid`,
  `cheat_consequence_*`). Four house-rule presets (Strict / Permissive
  log-only / Penalty / Forfeit) selectable from `GameSetup`. Detected
  violations are appended to `engine.cheatEvents` and the actual policy is
  persisted with each game row. Covered by `src/engine/game.cheating.test.ts`.
  See `Research/NOTES.md` for the SARC mapping.
- **Seeded deals (reproducibility)** — `GameEngine` now uses a splitmix64
  RNG seeded from a 64-bit value. The seed is exposed (`engine.rngSeed`),
  logged on game start, and persisted in `Game.rng_seed`. Pass
  `GameConfig.rngSeed` to replay a specific deal. Covered by
  `src/engine/rng.test.ts`.

## What's left to do (known gaps)

- **`ModelDetail.tsx` still reads localStorage.** Click a row on the
  leaderboard and the per-model detail page falls back to localStorage data
  (i.e., empty for fresh maincloud users). Same migration pattern as
  `Dashboard.tsx`.
- **`src/engine/seedData.ts` is unreferenced.** Demo data left over from the
  pre-SpacetimeDB era. Safe to delete; left in place to keep diffs focused.
- **`Tournament.tsx` is a wireframe.** The schema has a `tournament_id`
  field on `game` rows but no module-side concept of a tournament yet. The
  Dashboard's tournament panel currently renders an empty state.
- **Real-game end-to-end timing.** The bot decision path and the SpacetimeDB
  write path have each been verified separately. A single uninterrupted real
  OpenRouter game has not been clocked end-to-end inside one session — free-
  tier latency makes it ~30 minutes of wall time.
- **`package.json` name is still `react-example`.** Cosmetic, but the AI
  Studio scaffold default is still in place.

## Where we're going

The next logical pieces, in order of how much they unblock:

1. **Migrate `ModelDetail.tsx` to SpacetimeDB.** Closes the last localStorage
   read path so all UI surfaces are reading from the same source of truth.
2. **Remove `seedData.ts` and any remaining seeding code paths.** Pure
   cleanup once `ModelDetail` is migrated.
3. **Tournament backend.** The schema field exists but no reducer or query
   path uses it. Wire up tournament creation + the Dashboard panel.
4. **Per-decision cheat annotations.** `engine.cheatEvents` is populated and
   the policy is persisted on the game row, but individual violations aren't
   yet written to the `Decision.engine_cheat_kind` column. Once they are,
   per-model renege rates become a one-query dashboard tile.
5. **Chat & prompt-cheating layers.** The schema's `chat_policy` and
   `prompt_cheating_mode` fields are still inert — no chat is wired in, and
   the engine shows the same observation to every agent regardless of
   `prompt_cheating_mode`. These layers sit on top of the engine
   enforcement that now exists.

This list reflects only what already exists in the code and was discussed
in the working sessions. It is not a product roadmap.
