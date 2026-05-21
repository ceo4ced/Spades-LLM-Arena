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
import {
  STRICT_CHEATING_POLICY,
  type CheatingPolicy,
  type SpadesLeadPolicy,
  type CheatConsequenceKind,
} from './engine/types';

function spadesLeadPolicyToCode(p: SpadesLeadPolicy): number {
  return p === 'AlwaysAllowed' ? 1 : 0;
}

function cheatConsequenceKindToCode(k: CheatConsequenceKind): number {
  switch (k) {
    case 'LogOnly': return 0;
    case 'HandPenalty': return 1;
    case 'GameForfeit': return 2;
  }
}

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
 * Pass the actual `CheatingPolicy` and `rngSeed` the game was played under.
 * Policy defaults to `STRICT_CHEATING_POLICY`; seed defaults to `0n` only as a
 * legacy fallback (the engine assigns a real seed to every game).
 *
 * `schema_version = 1`. Best-effort: failures are logged, not thrown.
 */
export async function recordCompleteGame(
  result: GameResult,
  variant: LegacyVariant,
  policy: CheatingPolicy = STRICT_CHEATING_POLICY,
  rngSeed: bigint = 0n,
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
      rngSeed,
      // Real policy values from the engine.
      allowRenege: policy.allowRenege,
      chatPolicy: 1, // PublicOnly — chat layer not yet engine-enforced.
      promptCheatingMode: 0, // Silent — prompt layer not yet engine-enforced.
      promptForDetection: false,
      announceDetectedCheats: false,
      agentDetectionQuorum: false,
      cheatConsequenceKind: cheatConsequenceKindToCode(policy.consequence.kind),
      cheatConsequenceValue: policy.consequence.value,
      spadesLeadPolicy: spadesLeadPolicyToCode(policy.spadesLeadPolicy),
      minimumTeamBid: policy.minimumTeamBid,
    },
  });
}
