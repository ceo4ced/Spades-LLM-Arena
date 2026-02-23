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

    return logs.reduce<ChatMessage[]>((acc, log, i) => {
      // Parse "Bot N bids X" or "Bot N plays XX"
      const bidMatch = log.match(/^(Bot \d+) bids (\d+)/);
      const playMatch = log.match(/^(Bot \d+) plays (\w+)/);

      if (bidMatch) {
        const botName = bidMatch[1];
        const seatNum = parseInt(botName.replace('Bot ', ''));
        const team = (seatNum === 0 || seatNum === 2) ? 1 : 2;
        acc.push({
          id: i,
          sender: gameState.players[seatNum]?.name || botName,
          seat: seatNum,
          team: team as 1 | 2,
          text: `I'll bid ${bidMatch[2]}. 🤔`,
          type: 'chat' as const,
          timestamp: Date.now(),
        });
        return acc;
      }

      if (playMatch) {
        // Card plays only go in the game log, not the chat
        return acc;
      }

      // Trick-by-trick results stay in game log only, not chat
      if (log.startsWith('── Trick') || log.includes(' won with ')) {
        return acc;
      }

      // Round summary header: "--- Hand N Results ---"
      const handMatch = log.match(/^--- Hand (\d+) Results ---$/);
      if (handMatch) {
        // Collect the next lines that belong to this summary block
        const summaryLines: string[] = [];
        for (let j = i + 1; j < logs.length; j++) {
          if (logs[j].startsWith('---') || logs[j].startsWith('---------')) break;
          summaryLines.push(logs[j]);
        }
        acc.push({
          id: i,
          sender: `Hand ${handMatch[1]} Results`,
          seat: -1,
          team: 1 as const,
          text: summaryLines.join('\n'),
          type: 'round_summary' as const,
          timestamp: Date.now(),
        });
        return acc;
      }

      // Skip lines that are part of a round summary block (already included above)
      if (log.startsWith('Team 1:') || log.startsWith('Team 2:') || log.startsWith('Totals') || log.startsWith('------')) {
        return acc;
      }

      // Everything else is a game action
      acc.push({
        id: i,
        sender: 'System',
        seat: -1,
        team: 1 as const,
        text: log,
        type: 'action' as const,
        timestamp: Date.now(),
      });
      return acc;
    }, []);
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
