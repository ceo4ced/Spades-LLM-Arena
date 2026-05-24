/**
 * SpacetimeDB write helper for game records.
 *
 * Bridges the legacy `GameResult` shape (used by the existing TS engine and
 * `resultsStore.ts`) to the new SpacetimeDB schema. Three responsibilities:
 *
 *   1. **Resolve model names → ids.** The schema FKs games to models by `u32`
 *      id, but the engine deals in model name strings.
 *
 *   2. **Record a finished game.** `recordCompleteGame(result, variant)`
 *      resolves the four model ids, then calls the `record_complete_game`
 *      reducer.
 *
 *   3. **Record per-decision data.** `recordDecisions()` batch-writes
 *      accumulated DecisionRecords after the game ends.
 */

import { getConnection } from './spacetime-client';
import type { GameResult } from './engine/resultsStore';
import {
  STRICT_CHEATING_POLICY,
  type CheatingPolicy,
  type SpadesLeadPolicy,
  type CheatConsequenceKind,
  type DecisionRecord,
  type ChatMessage,
  chatPolicyToCode,
  promptCheatingModeToCode,
} from './engine/types';
import { chatAudienceToCode } from './engine/chat';

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

const modelIdByName = new Map<string, number>();
const pendingResolvers = new Map<string, Array<(id: number) => void>>();

let subscriptionReady: Promise<void> | null = null;

function getSubscriptionReady(): Promise<void> {
  if (subscriptionReady) return subscriptionReady;

  subscriptionReady = new Promise<void>((resolve) => {
    const conn = getConnection();

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
        resolve();
      })
      .subscribe(['SELECT * FROM model']);
  });

  return subscriptionReady;
}

export async function ensureModel(
  name: string,
  kind: number,
  version: string,
): Promise<number> {
  await getSubscriptionReady();

  const cached = modelIdByName.get(name);
  if (cached !== undefined) return cached;

  return new Promise<number>((resolve) => {
    const existing = pendingResolvers.get(name);
    if (existing) {
      existing.push(resolve);
      return;
    }
    pendingResolvers.set(name, [resolve]);
    getConnection().reducers.registerModel({ name, kind, version });
  });
}

// ─── Model classification ──────────────────────────────────────────────

function classifyModel(name: string): number {
  const n = name.toLowerCase();
  if (n === 'human' || n === 'player') return 4;
  if (n.includes('iterate')) return 3;
  if (n === 'random') return 0;
  if (n === 'heuristic') return 1;
  return 2;
}

// ─── Game recording ─────────────────────────────────────────────────────

type LegacyVariant = 'standard' | 'jokers';

function variantToCode(variant: LegacyVariant): number {
  return variant === 'jokers' ? 1 : 0;
}

/**
 * Record a finished game to SpacetimeDB and return the game_id.
 * Also records per-decision data and chat messages if provided.
 */
export async function recordCompleteGame(
  result: GameResult,
  variant: LegacyVariant,
  policy: CheatingPolicy = STRICT_CHEATING_POLICY,
  rngSeed: bigint = 0n,
  decisions?: DecisionRecord[],
  chatMessages?: ChatMessage[],
): Promise<void> {
  if (result.team1Models.length < 2 || result.team2Models.length < 2) {
    throw new Error('GameResult must have 2 models per team');
  }

  const [t1s0, t1s2, t2s1, t2s3] = await Promise.all([
    ensureModel(result.team1Models[0], classifyModel(result.team1Models[0]), '1'),
    ensureModel(result.team1Models[1], classifyModel(result.team1Models[1]), '1'),
    ensureModel(result.team2Models[0], classifyModel(result.team2Models[0]), '1'),
    ensureModel(result.team2Models[1], classifyModel(result.team2Models[1]), '1'),
  ]);

  const conn = getConnection();

  // Build model-id lookup by seat for decision writes.
  const modelIdBySeat: Record<number, number> = {
    0: t1s0,
    1: t2s1,
    2: t1s2,
    3: t2s3,
  };

  // Listen for the inserted Game row to get the game_id for decision writes.
  const needsGameId = (decisions && decisions.length > 0) || (chatMessages && chatMessages.length > 0);
  const gameIdPromise = needsGameId
    ? new Promise<bigint>((resolve) => {
        let resolved = false;
        conn.db.game.onInsert((_ctx, row) => {
          if (!resolved && row.rngSeed === rngSeed && row.winnerTeam === result.winner) {
            resolved = true;
            resolve(row.id);
          }
        });
        setTimeout(() => { if (!resolved) { resolved = true; resolve(0n); } }, 10000);
      })
    : Promise.resolve(0n);

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
      allowRenege: policy.allowRenege,
      chatPolicy: chatPolicyToCode(policy.chatPolicy),
      promptCheatingMode: promptCheatingModeToCode(policy.promptCheatingMode),
      promptForDetection: false,
      announceDetectedCheats: false,
      agentDetectionQuorum: false,
      cheatConsequenceKind: cheatConsequenceKindToCode(policy.consequence.kind),
      cheatConsequenceValue: policy.consequence.value,
      spadesLeadPolicy: spadesLeadPolicyToCode(policy.spadesLeadPolicy),
      minimumTeamBid: policy.minimumTeamBid,
    },
  });

  // Write decisions after game_id is known.
  if (decisions && decisions.length > 0) {
    const gameId = await gameIdPromise;
    if (gameId === 0n) return;

    // Use hand 0 as a synthetic hand_id (we don't create per-hand rows yet).
    const syntheticHandId = gameId * 100n;

    for (const d of decisions) {
      try {
        conn.reducers.recordDecision({
          input: {
            gameId,
            handId: syntheticHandId + BigInt(d.handNumber),
            modelId: modelIdBySeat[d.seat] ?? t1s0,
            decisionIndex: d.decisionIndex,
            seat: d.seat,
            kind: d.kind,
            action: d.action,
            legalMask: d.legalMask,
            fingerprint: d.fingerprint,
            latencyMs: Math.min(d.latencyMs, 65535),
            engineCheatKind: d.engineCheatKind,
            selfReportedCheat: 0,
          },
        });
      } catch (e) {
        console.warn('Decision write failed:', e);
      }
    }
  }

  // Write chat messages.
  if (chatMessages && chatMessages.length > 0) {
    const gameId = await gameIdPromise;
    if (gameId === 0n) return;
    const syntheticHandId = gameId * 100n;
    const encoder = new TextEncoder();

    for (const msg of chatMessages) {
      try {
        conn.reducers.recordCommunication({
          input: {
            gameId,
            handId: syntheticHandId + BigInt(msg.handNumber),
            seat: msg.seat,
            phase: msg.phase === 'bidding' ? 0 : 1,
            audience: chatAudienceToCode(msg.audience),
            targetSeat: msg.targetSeat ?? null,
            textZstd: encoder.encode(msg.text),
            referencedCard: null,
            selfReportedCheat: msg.selfReportedCheat,
            engineDetectedLie: msg.engineDetectedLie,
          },
        });
      } catch (e) {
        console.warn('Communication write failed:', e);
      }
    }
  }
}
