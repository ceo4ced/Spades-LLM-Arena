/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useGame } from './hooks/useGame';
import { GameBoard } from './components/GameBoard';
import { GameSetup } from './components/GameSetup';
import { SplashScreen } from './components/SplashScreen';
import { GameConfig } from './engine/types';

export default function App() {
  const { gameState, logs, isHumanTurn, isPaused, initGame, humanAction, togglePause, quitGame } = useGame();
  const [screen, setScreen] = useState<'splash' | 'setup' | 'game'>('splash');

  const handleQuit = () => {
    quitGame();
    setScreen('setup');
  };

  const handleStart = (config: GameConfig) => {
    initGame(config);
    setScreen('game');
  };

  // Splash screen
  if (screen === 'splash') {
    return <SplashScreen onComplete={() => setScreen('setup')} />;
  }

  // Setup / menu screen
  if (screen === 'setup') {
    return <GameSetup onStart={handleStart} />;
  }

  // Loading state
  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-900 text-white">
        <div className="text-2xl font-bold animate-pulse">Loading Spades Engine...</div>
      </div>
    );
  }

  // Game board — 80% left / 20% right chat panel
  return (
    <div className="flex w-full h-screen overflow-hidden">
      {/* Left: Game Board (80%) */}
      <div className="w-[80%] h-full shrink-0">
        <GameBoard
          gameState={gameState}
          onBid={(value) => humanAction({ action: 'bid', value, reasoning: 'User bid' })}
          onPlay={(cardId) => humanAction({ action: 'play', card: cardId, reasoning: 'User play' })}
          isHumanTurn={isHumanTurn}
          logs={logs}
          isPaused={isPaused}
          onTogglePause={togglePause}
          onQuitGame={handleQuit}
        />
      </div>

      {/* Right: Chat / Log Panel (20%) */}
      <div className="w-[20%] h-full bg-gray-900 border-l border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex-none px-3 py-2 bg-gray-800 border-b border-gray-700">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Game Log</h2>
        </div>

        {/* Log Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="text-xs text-gray-300 font-mono py-0.5 border-b border-gray-800">
              {log}
            </div>
          ))}
          <div id="log-end" />
        </div>

        {/* Footer (placeholder for future chat input) */}
        <div className="flex-none px-3 py-2 bg-gray-800 border-t border-gray-700">
          <div className="text-[10px] text-gray-500 text-center">Live Game Feed</div>
        </div>
      </div>
    </div>
  );
}
