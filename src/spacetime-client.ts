/**
 * SpacetimeDB connection helper.
 *
 * Singleton DbConnection — first call builds and connects; subsequent calls
 * return the same instance. The auth token is persisted in localStorage so
 * the same identity is used across reloads.
 *
 * Defaults connect to SpacetimeDB Maincloud. Override via env vars (Vite
 * `VITE_*`) — for example to point at a self-hosted local instance:
 *   - VITE_SPACETIME_URI    (default: https://maincloud.spacetimedb.com)
 *   - VITE_SPACETIME_MODULE (default: spades-arena)
 *
 * Usage:
 *   import { getConnection } from './spacetime-client';
 *   const conn = getConnection();
 *   conn.reducers.registerModel('gemini-flash', 2, '2025-10');
 */

import { DbConnection, type ErrorContext } from './spacetime-bindings';
import type { Identity } from 'spacetimedb';

const DEFAULT_URI = 'https://maincloud.spacetimedb.com';
const DEFAULT_MODULE = 'spades-arena';
const TOKEN_KEY = 'spacetime_auth_token';

let _connection: DbConnection | null = null;
let _identity: Identity | null = null;
let _lastError: string | null = null;
const _statusListeners = new Set<() => void>();

function notifyStatusChange(): void {
  _statusListeners.forEach((cb) => cb());
}

export interface ConnectionStatus {
  connected: boolean;
  identity: Identity | null;
  uri: string;
  moduleName: string;
  error: string | null;
}

/**
 * Subscribe to connection-status changes. The callback fires on connect,
 * disconnect, and connect-error events. Returns an unsubscribe function.
 */
export function subscribeStatus(cb: () => void): () => void {
  _statusListeners.add(cb);
  return () => {
    _statusListeners.delete(cb);
  };
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
      _lastError = null;
      // Persist the token so subsequent runs reuse the same identity.
      if (token) localStorage.setItem(TOKEN_KEY, token);
      // eslint-disable-next-line no-console
      console.log('[SpacetimeDB] connected as', identity.toHexString());
      notifyStatusChange();
    })
    .onDisconnect((_ctx: ErrorContext, error?: Error) => {
      _identity = null;
      if (error) _lastError = error.message;
      // eslint-disable-next-line no-console
      console.log('[SpacetimeDB] disconnected', error?.message ?? '');
      notifyStatusChange();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      _lastError = error.message;
      // eslint-disable-next-line no-console
      console.error('[SpacetimeDB] connect error:', error.message);
      notifyStatusChange();
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
    error: _lastError,
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
