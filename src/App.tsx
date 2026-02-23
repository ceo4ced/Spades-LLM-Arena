/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useGame } from './hooks/useGame';
import { GameBoard } from './components/GameBoard';
import { GameSetup } from './components/GameSetup';
import { SplashScreen } from './components/SplashScreen';
import { ChatPanel, ChatMessage } from './components/ChatPanel';
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

  // Convert game logs into chat messages
  const chatMessages = useMemo<ChatMessage[]>(() => {
    if (!gameState) return [];

    return logs.map((log, i) => {
      // Parse "Bot N bids X" or "Bot N plays XX"
      const bidMatch = log.match(/^(Bot \d+) bids (\d+)/);
      const playMatch = log.match(/^(Bot \d+) plays (\w+)/);

      if (bidMatch) {
        const botName = bidMatch[1];
        const seatNum = parseInt(botName.replace('Bot ', '')) - 1;
        const team = (seatNum === 0 || seatNum === 2) ? 1 : 2;
        return {
          id: i,
          sender: gameState.players[seatNum]?.name || botName,
          seat: seatNum,
          team: team as 1 | 2,
          text: `I'll bid ${bidMatch[2]}. 🤔`,
          type: 'chat' as const,
          timestamp: Date.now(),
        };
      }

      if (playMatch) {
        // Card plays are game actions, not chat (viewers see them on the board)
        return {
          id: i,
          sender: 'System',
          seat: -1,
          team: 1 as const,
          text: log,
          type: 'action' as const,
          timestamp: Date.now(),
        };
      }

      // Everything else is a game action
      return {
        id: i,
        sender: 'System',
        seat: -1,
        team: 1 as const,
        text: log,
        type: 'action' as const,
        timestamp: Date.now(),
      };
    });
  }, [logs, gameState]);

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

      {/* Right: Chat Panel (20%) */}
      <div className="w-[20%] h-full shrink-0">
        <ChatPanel messages={chatMessages} logs={logs} />
      </div>
    </div>
  );
}
