/**
 * SpacetimeDB connection helper.
 *
 * Singleton DbConnection — first call builds and connects; subsequent calls
 * return the same instance. The auth token is persisted in localStorage so
 * the same identity is used across reloads.
 *
 * Configure via env vars (Vite `VITE_*`):
 *   - VITE_SPACETIME_URI    (default: http://localhost:3000)
 *   - VITE_SPACETIME_MODULE (default: spades-arena)
 *
 * Usage:
 *   import { getConnection } from './spacetime-client';
 *   const conn = getConnection();
 *   conn.reducers.registerModel('gemini-flash', 2, '2025-10');
 */

import { DbConnection, type ErrorContext } from './spacetime-bindings';
import type { Identity } from 'spacetimedb';

const DEFAULT_URI = 'http://localhost:3000';
const DEFAULT_MODULE = 'spades-arena';
const TOKEN_KEY = 'spacetime_auth_token';

let _connection: DbConnection | null = null;
let _identity: Identity | null = null;

export interface ConnectionStatus {
  connected: boolean;
  identity: Identity | null;
  uri: string;
  moduleName: string;
}

/** Idempotent: returns the existing connection if one was already built. */
export function getConnection(): DbConnection {
  if (_connection) return _connection;

  const uri =
    (import.meta as { env?: Record<string, string> }).env?.VITE_SPACETIME_URI ||
    DEFAULT_URI;
  const moduleName =
    (import.meta as { env?: Record<string, string> }).env?.VITE_SPACETIME_MODULE ||
    DEFAULT_MODULE;
  const storedToken = localStorage.getItem(TOKEN_KEY) || undefined;

  _connection = DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(moduleName)
    .withToken(storedToken)
    .onConnect((_conn, identity, token) => {
      _identity = identity;
      // Persist the token so subsequent runs reuse the same identity.
      if (token) localStorage.setItem(TOKEN_KEY, token);
      // eslint-disable-next-line no-console
      console.log('[SpacetimeDB] connected as', identity.toHexString());
    })
    .onDisconnect((_ctx: ErrorContext, error?: Error) => {
      // eslint-disable-next-line no-console
      console.log('[SpacetimeDB] disconnected', error?.message ?? '');
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      // eslint-disable-next-line no-console
      console.error('[SpacetimeDB] connect error:', error.message);
    })
    .build();

  return _connection;
}

export function getStatus(): ConnectionStatus {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {};
  return {
    connected: _connection !== null && _identity !== null,
    identity: _identity,
    uri: env.VITE_SPACETIME_URI || DEFAULT_URI,
    moduleName: env.VITE_SPACETIME_MODULE || DEFAULT_MODULE,
  };
}

/** Tear down the connection and clear local state. Useful for tests / logout. */
export function disconnect(): void {
  if (_connection) {
    _connection.disconnect();
    _connection = null;
    _identity = null;
  }
}

/** Forget the persisted identity token. Next connect will mint a new identity. */
export function forgetIdentity(): void {
  localStorage.removeItem(TOKEN_KEY);
}
