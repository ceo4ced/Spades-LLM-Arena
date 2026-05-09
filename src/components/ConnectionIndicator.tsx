import React, { useEffect, useState } from 'react';
import { getConnection } from '../spacetime-client';
import { useSpacetimeStatus } from '../hooks/useSpacetime';

/**
 * Small floating badge that shows SpacetimeDB connection state. Mounted at
 * the App root so it's visible from every screen.
 *
 * Calls getConnection() on mount so the indicator reflects connection state
 * even on screens that don't otherwise touch SpacetimeDB (splash, setup,
 * mid-game). Without this, the badge would stay "connecting…" until the
 * user navigated to the Dashboard or finished a game.
 */
export const ConnectionIndicator: React.FC = () => {
  const status = useSpacetimeStatus();
  const [expanded, setExpanded] = useState(false);

  // Eagerly open the connection so the badge is meaningful site-wide.
  useEffect(() => {
    try {
      getConnection();
    } catch (e) {
      // Connection-builder failures already log internally; ignore here.
      void e;
    }
  }, []);

  const dotColor = status.error
    ? 'bg-red-500'
    : status.connected
    ? 'bg-green-500'
    : 'bg-yellow-400 animate-pulse';

  const label = status.error
    ? 'SpacetimeDB error'
    : status.connected
    ? 'Connected'
    : 'Connecting…';

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="fixed top-2 right-2 z-50 flex items-center gap-2 px-2 py-1 rounded-md bg-black/60 border border-white/10 backdrop-blur-sm text-[10px] text-gray-300 hover:bg-black/80 transition-colors"
      title="SpacetimeDB connection"
      aria-label={`SpacetimeDB ${label}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
      <span className="font-mono">{label}</span>
      {expanded && (
        <span className="ml-1 pl-2 border-l border-white/10 font-mono text-gray-400 max-w-[420px] truncate">
          {status.moduleName} @ {status.uri}
          {status.identity && ` · ${status.identity.toHexString().slice(0, 12)}…`}
          {status.error && ` · ${status.error}`}
        </span>
      )}
    </button>
  );
};
