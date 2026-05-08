/**
 * SpacetimeDB write helper for game records.
 *
 * Bridges the legacy `GameResult` shape (used by the existing TS engine and
 * `resultsStore.ts`) to the new SpacetimeDB schema. Two responsibilities:
 *
 *   1. **Resolve model names → ids.** The schema FKs games to models by `u32`
 *      id, but the engine deals in model name strings. `ensureModel` subscribes
 *      to the `model` table once, caches the existing rows, and registers any
 *      newly-seen names via `register_model` — returning the assigned id.
 *
 *   2. **Record a finished game.** `recordCompleteGame(result, variant)`
 *      resolves the four model ids, then calls the `record_complete_game`
 *      reducer to insert one Game row with `started_at == completed_at` and
 *      strict no-cheating defaults. Best-effort: failures are logged, not
 *      thrown — the caller's localStorage save is the source of truth for now.
 *
 * Intended usage from `useGame.ts` after a game ends:
 *
 *     try {
 *       await recordCompleteGame(result, gameConfig.variant);
 *     } catch (e) {
 *       console.warn('SpacetimeDB record failed', e);
 *     }
 */

import { getConnection } from './spacetime-client';
import type { GameResult } from './engine/resultsStore';

// ─── Model registry ─────────────────────────────────────────────────────

/** name → id, populated from the model-table subscription. */
const modelIdByName = new Map<string, number>();

/** name → resolvers waiting for that name's id to appear. */
const pendingResolvers = new Map<string, Array<(id: number) => void>>();

let subscriptionReady: Promise<void> | null = null;

/**
 * Subscribe to the model table once. The returned promise resolves when the
 * initial sync is complete (i.e., the cache reflects the database).
 */
function getSubscriptionReady(): Promise<void> {
  if (subscriptionReady) return subscriptionReady;

  subscriptionReady = new Promise<void>((resolve) => {
    const conn = getConnection();

    // Cache rows as they arrive — both initial sync and subsequent inserts.
    conn.db.model.onInsert((_ctx, row) => {
      modelIdByName.set(row.name, row.id);
      const waiters = pendingResolvers.get(row.name);
      if (waiters) {
        waiters.forEach((r) => r(row.id));
        pendingResolvers.delete(row.name);
      }
    });

    conn
      .subscriptionBuilder()
      .onApplied(() => {
        // Initial sync complete — cache now reflects the database.
        resolve();
      })
      .subscribe(['SELECT * FROM model']);
  });

  return subscriptionReady;
}

/**
 * Resolve a model name to its `u32` id, registering the model if not already
 * present. Multiple concurrent calls for the same name de-duplicate to a
 * single `register_model` call.
 */
export async function ensureModel(
  name: string,
  kind: number,
  version: string,
): Promise<number> {
  await getSubscriptionReady();

  // Already registered: return cached id immediately.
  const cached = modelIdByName.get(name);
  if (cached !== undefined) return cached;

  // Not registered yet — wait for the row to appear after register_model fires.
  return new Promise<number>((resolve) => {
    const existing = pendingResolvers.get(name);
    if (existing) {
      existing.push(resolve); // de-dupe: another caller is already registering
      return;
    }
    pendingResolvers.set(name, [resolve]);
    getConnection().reducers.registerModel({ name, kind, version });
  });
}

// ─── Model classification ──────────────────────────────────────────────

/**
 * Heuristic for the `Model.kind` field given a model name.
 * 0 = random, 1 = heuristic, 2 = LLM, 3 = iterate, 4 = human.
 */
function classifyModel(name: string): number {
  const n = name.toLowerCase();
  if (n === 'human' || n === 'player') return 4;
  if (n.includes('iterate')) return 3;
  if (n === 'random') return 0;
  if (n === 'heuristic') return 1;
  return 2; // anything else is treated as an LLM
}

// ─── Game recording ─────────────────────────────────────────────────────

type LegacyVariant = 'standard' | 'jokers';

/**
 * Map the legacy 2-variant engine to the new 3-variant schema:
 *   - 'standard' → 0 (Standard, Ace high)
 *   - 'jokers'   → 1 (JJA — closest match in the new schema)
 *
 * The new JJDD variant has no legacy equivalent.
 */
function variantToCode(variant: LegacyVariant): number {
  return variant === 'jokers' ? 1 : 0;
}

/**
 * Record a finished game to SpacetimeDB. Idempotent w.r.t. model registration
 * (re-running with the same names won't create duplicate model rows).
 *
 * The Game row inserted has:
 *   - `started_at == completed_at == ctx.timestamp` (server-set)
 *   - Strict no-cheating defaults (`allow_renege = false`, etc.)
 *   - `spades_lead_policy = MustBeBroken`, `minimum_team_bid = 0`
 *   - `schema_version = 1`, `rng_seed = 0n` (engine doesn't currently seed)
 *
 * These defaults match the existing engine's actual behavior. Once the engine
 * starts honoring cheating settings / house rules, the caller will pass them
 * through here.
 */
export async function recordCompleteGame(
  result: GameResult,
  variant: LegacyVariant,
): Promise<void> {
  if (result.team1Models.length < 2 || result.team2Models.length < 2) {
    throw new Error('GameResult must have 2 models per team');
  }

  // Resolve all four model ids in parallel.
  const [t1s0, t1s2, t2s1, t2s3] = await Promise.all([
    ensureModel(result.team1Models[0], classifyModel(result.team1Models[0]), '1'),
    ensureModel(result.team1Models[1], classifyModel(result.team1Models[1]), '1'),
    ensureModel(result.team2Models[0], classifyModel(result.team2Models[0]), '1'),
    ensureModel(result.team2Models[1], classifyModel(result.team2Models[1]), '1'),
  ]);

  const conn = getConnection();
  conn.reducers.recordCompleteGame({
    input: {
      schemaVersion: 1,
      tournamentId: undefined,
      targetScore: result.targetScore,
      variant: variantToCode(variant),
      team1Seat0ModelId: t1s0,
      team1Seat2ModelId: t1s2,
      team2Seat1ModelId: t2s1,
      team2Seat3ModelId: t2s3,
      team1Score: result.team1Score,
      team2Score: result.team2Score,
      team1Bags: result.team1Bags,
      team2Bags: result.team2Bags,
      winnerTeam: result.winner,
      rngSeed: 0n,
      // Strict no-cheating defaults.
      allowRenege: false,
      chatPolicy: 1, // PublicOnly
      promptCheatingMode: 0, // Silent
      promptForDetection: false,
      announceDetectedCheats: false,
      agentDetectionQuorum: false,
      cheatConsequenceKind: 0, // LogOnly
      cheatConsequenceValue: 0,
      // House-rule defaults matching the legacy engine.
      spadesLeadPolicy: 0, // MustBeBroken
      minimumTeamBid: 0,
    },
  });
}
