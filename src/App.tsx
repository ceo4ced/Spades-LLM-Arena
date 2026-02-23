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

  // Game board
  return (
    <div className="w-full h-screen bg-green-900 overflow-hidden">
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
  );
}
