/**
 * React hooks backed by SpacetimeDB subscriptions.
 *
 * Each hook subscribes to a table on first mount, caches the rows in module
 * state, and triggers re-renders on insert/update/delete. Multiple components
 * mounting the same hook share one subscription.
 *
 * If the connection isn't ready yet (e.g., SpacetimeDB unreachable), the
 * hooks return their stale-or-empty fallback values without throwing. The
 * Dashboard can show those alongside its existing localStorage data.
 */

import { useEffect, useState } from 'react';
import { getConnection } from '../spacetime-client';
import type { Game, Model } from '../spacetime-bindings/types';

// ─── Module-state caches ────────────────────────────────────────────────

const gameById = new Map<bigint, Game>();
const modelById = new Map<number, Model>();

const gameListeners = new Set<() => void>();
const modelListeners = new Set<() => void>();

let gamesSubscribed = false;
let modelsSubscribed = false;

function notifyGames() {
  gameListeners.forEach((cb) => cb());
}

function notifyModels() {
  modelListeners.forEach((cb) => cb());
}

function ensureGameSubscription(): void {
  if (gamesSubscribed) return;
  gamesSubscribed = true;
  const conn = getConnection();
  conn.db.game.onInsert((_ctx, row) => {
    gameById.set(row.id, row);
    notifyGames();
  });
  conn.db.game.onUpdate((_ctx, _oldRow, newRow) => {
    gameById.set(newRow.id, newRow);
    notifyGames();
  });
  conn.db.game.onDelete((_ctx, row) => {
    gameById.delete(row.id);
    notifyGames();
  });
  conn
    .subscriptionBuilder()
    .onApplied(() => {
      notifyGames();
    })
    .subscribe(['SELECT * FROM game']);
}

function ensureModelSubscription(): void {
  if (modelsSubscribed) return;
  modelsSubscribed = true;
  const conn = getConnection();
  conn.db.model.onInsert((_ctx, row) => {
    modelById.set(row.id, row);
    notifyModels();
  });
  conn.db.model.onUpdate((_ctx, _oldRow, newRow) => {
    modelById.set(newRow.id, newRow);
    notifyModels();
  });
  conn.db.model.onDelete((_ctx, row) => {
    modelById.delete(row.id);
    notifyModels();
  });
  conn
    .subscriptionBuilder()
    .onApplied(() => {
      notifyModels();
    })
    .subscribe(['SELECT * FROM model']);
}

// ─── Hooks ──────────────────────────────────────────────────────────────

/** All games in the database, live-updated. Empty until the subscription syncs. */
export function useGames(): Game[] {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      ensureGameSubscription();
    } catch (e) {
      console.warn('[useGames] subscription failed:', e);
    }
    const cb = () => setVersion((v) => v + 1);
    gameListeners.add(cb);
    return () => {
      gameListeners.delete(cb);
    };
  }, []);

  // version is intentionally referenced to opt into re-renders.
  void version;
  return Array.from(gameById.values());
}

/** All registered models, live-updated. */
export function useModels(): Model[] {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      ensureModelSubscription();
    } catch (e) {
      console.warn('[useModels] subscription failed:', e);
    }
    const cb = () => setVersion((v) => v + 1);
    modelListeners.add(cb);
    return () => {
      modelListeners.delete(cb);
    };
  }, []);

  void version;
  return Array.from(modelById.values());
}

// ─── Derived views ──────────────────────────────────────────────────────

export interface SpacetimeModelStats {
  modelName: string;
  wins: number;
  losses: number;
  totalPoints: number;
  totalBags: number;
  gamesPlayed: number;
}

/**
 * Build a leaderboard from the live `game` + `model` tables. Same shape as
 * `resultsStore.getLeaderboard()` (`ModelStats`-compatible) but sourced from
 * SpacetimeDB rather than localStorage.
 */
export function useSpacetimeLeaderboard(): SpacetimeModelStats[] {
  const games = useGames();
  const models = useModels();

  const nameById = new Map<number, string>();
  for (const m of models) nameById.set(m.id, m.name);

  const stats = new Map<string, SpacetimeModelStats>();
  const ensure = (name: string) => {
    if (!stats.has(name)) {
      stats.set(name, {
        modelName: name,
        wins: 0,
        losses: 0,
        totalPoints: 0,
        totalBags: 0,
        gamesPlayed: 0,
      });
    }
    return stats.get(name)!;
  };

  for (const g of games) {
    const team1Names = [
      nameById.get(g.team1Seat0ModelId),
      nameById.get(g.team1Seat2ModelId),
    ].filter((n): n is string => Boolean(n));
    const team2Names = [
      nameById.get(g.team2Seat1ModelId),
      nameById.get(g.team2Seat3ModelId),
    ].filter((n): n is string => Boolean(n));

    for (const name of team1Names) {
      const s = ensure(name);
      s.gamesPlayed++;
      s.totalPoints += g.team1Score;
      s.totalBags += g.team1Bags;
      if (g.winnerTeam === 1) s.wins++;
      else if (g.winnerTeam === 2) s.losses++;
    }
    for (const name of team2Names) {
      const s = ensure(name);
      s.gamesPlayed++;
      s.totalPoints += g.team2Score;
      s.totalBags += g.team2Bags;
      if (g.winnerTeam === 2) s.wins++;
      else if (g.winnerTeam === 1) s.losses++;
    }
  }

  return Array.from(stats.values()).sort((a, b) => {
    const aRate = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0;
    const bRate = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0;
    if (bRate !== aRate) return bRate - aRate;
    return b.totalPoints - a.totalPoints;
  });
}

/** Live count of games recorded to SpacetimeDB. */
export function useSpacetimeGameCount(): number {
  const games = useGames();
  return games.length;
}
