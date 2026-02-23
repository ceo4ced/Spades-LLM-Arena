import React, { useState, useEffect } from 'react';
import { GameState, Card as CardType } from '../engine/types';
import { Card } from './Card';
import { motion, AnimatePresence } from 'motion/react';

interface GameBoardProps {
  gameState: GameState;
  onBid: (value: number) => void;
  onPlay: (cardId: string) => void;
  isHumanTurn: boolean;
  logs: string[];
  isPaused: boolean;
  onTogglePause: () => void;
  onQuitGame: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ gameState, onBid, onPlay, isHumanTurn, logs, isPaused, onTogglePause, onQuitGame }) => {
  const [bidValue, setBidValue] = useState(1);

  const getPlayer = (seat: number) => gameState.players[seat];
  const userPlayer = getPlayer(0);

  // Helper to get relative position for UI (0 is bottom, 1 is left, 2 is top, 3 is right)
  // Actually, standard bridge/spades layout:
  // South (User) = Bottom
  // West = Left
  // North = Top
  // East = Right
  // Seat 0 is User.
  // Seat 1 is Left (West)
  // Seat 2 is Top (North)
  // Seat 3 is Right (East)

  const renderPlayerInfo = (seat: number, position: 'top' | 'bottom' | 'left' | 'right') => {
    const player = getPlayer(seat);
    const isTurn = gameState.currentTurn === seat;

    return (
      <div className={`flex flex-col items-center p-2 rounded-lg ${isTurn ? 'bg-yellow-100/20 ring-2 ring-yellow-400' : 'bg-black/40'} text-white backdrop-blur-sm`}>
        <div className="font-bold text-lg">
          {player.name}
        </div>
        <div className="text-sm">
          Bid: {player.bid !== null ? player.bid : '-'} | Won: {player.tricksWon}
        </div>
        {/* Show card back count for opponents */}
        {seat !== 0 && (
          <div className="mt-1 flex -space-x-2">
            {Array.from({ length: Math.min(player.hand.length, 5) }).map((_, i) => (
              <div key={i} className="w-4 h-6 bg-blue-800 rounded border border-white/50" />
            ))}
            {player.hand.length > 5 && <span className="text-xs ml-2">+{player.hand.length - 5}</span>}
          </div>
        )}
      </div>
    );
  };

  const renderTrick = () => {
    // If current trick is empty, show the last completed trick from history
    // This allows the user to see who won the trick before the next lead
    let playsToShow = gameState.currentTrick.plays;
    let isCompletedTrick = false;

    if (playsToShow.length === 0 && gameState.trickHistory.length > 0) {
      playsToShow = gameState.trickHistory[gameState.trickHistory.length - 1].plays;
      isCompletedTrick = true;
    }

    return (
      <div className="relative w-64 h-64 flex items-center justify-center">
        <AnimatePresence>
          {playsToShow.map((play, index) => {
            let positionClass = '';
            // Adjust rotation/position based on seat relative to user (Seat 0)
            // Seat 0 (User): Bottom
            // Seat 1 (Left): Left
            // Seat 2 (Partner): Top
            // Seat 3 (Right): Right

            switch (play.seat) {
              case 0: positionClass = 'translate-y-12'; break;
              case 1: positionClass = '-translate-x-12 -rotate-90'; break;
              case 2: positionClass = '-translate-y-12'; break;
              case 3: positionClass = 'translate-x-12 rotate-90'; break;
            }

            return (
              <motion.div
                key={`${play.seat}-${play.card.id}`}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className={`absolute ${positionClass} ${isCompletedTrick ? 'opacity-75 grayscale-50' : ''}`}
              >
                <Card card={play.card} />
              </motion.div>
            );
          })}
        </AnimatePresence>
        {playsToShow.length === 0 && (
          <div className="text-white/30 font-bold text-xl">
            {gameState.phase === 'bidding' ? 'Bidding...' : 'Waiting for lead...'}
          </div>
        )}
        {isCompletedTrick && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-black/60 text-white px-3 py-1 rounded-full text-sm font-bold backdrop-blur-md">
              Winner: {getPlayer(gameState.trickHistory[gameState.trickHistory.length - 1].winner!).name}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBiddingControls = () => {
    if (gameState.phase !== 'bidding' || !isHumanTurn) return null;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
        <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold">Your Bid</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setBidValue(Math.max(0, bidValue - 1))}
              className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 font-bold text-xl"
            >-</button>
            <span className="text-4xl font-mono font-bold w-16 text-center">{bidValue}</span>
            <button
              onClick={() => setBidValue(Math.min(13, bidValue + 1))}
              className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 font-bold text-xl"
            >+</button>
          </div>
          <button
            onClick={() => onBid(bidValue)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg"
          >
            Place Bid
          </button>
          <div className="text-sm text-gray-500">
            (0 is Nil - 100 points bonus/penalty)
          </div>
        </div>
      </div>
    );
  };

  const renderHand = () => {
    // Sort hand by suit (S, H, C, D) and rank
    const sortedHand = [...userPlayer.hand].sort((a, b) => {
      const suitOrder = { 'S': 0, 'H': 1, 'C': 2, 'D': 3 };
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      const rankValues: Record<string, number> = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
        '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
      };
      return rankValues[b.rank] - rankValues[a.rank];
    });

    return (
      <div className="flex justify-center -space-x-8 hover:space-x-1 transition-all duration-300 py-4 overflow-x-auto px-4">
        {sortedHand.map((card) => {
          // Check if playable
          // We need to know legal plays.
          // The engine calculates this, but we don't have it explicitly in GameState unless we add it or recalculate.
          // For now, let's just allow clicking and let the engine reject it (with visual feedback from logs).
          // Better: pass legal plays from hook?
          // The hook doesn't expose legal plays directly, but we can infer or just try.

          return (
            <Card
              key={card.id}
              card={card}
              playable={isHumanTurn && gameState.phase === 'playing'}
              onClick={() => isHumanTurn && gameState.phase === 'playing' && onPlay(card.id)}
              className="transform hover:-translate-y-4 transition-transform duration-200 shadow-xl"
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative w-full h-screen bg-green-900 overflow-hidden flex flex-col">
      {/* Header / Scoreboard */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none z-20">
        <div className="bg-black/50 p-2 rounded text-white backdrop-blur-sm">
          <div className="font-bold text-blue-300">Team 1 ({getPlayer(0).name} + {getPlayer(2).name})</div>
          <div>Score: {gameState.teams.team1.score}</div>
          <div>Bags: {gameState.teams.team1.bags}</div>
        </div>

        <div className="pointer-events-auto">
          <div className="mt-2 text-center text-white/50 text-xs font-mono bg-black/30 px-2 py-1 rounded">
            Target: {gameState.targetScore}
          </div>
        </div>

        <div className="bg-black/50 p-2 rounded text-white backdrop-blur-sm">
          <div className="font-bold text-red-300">Team 2 ({getPlayer(1).name} + {getPlayer(3).name})</div>
          <div>Score: {gameState.teams.team2.score}</div>
          <div>Bags: {gameState.teams.team2.bags}</div>
        </div>
      </div>

      {/* Paused Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="bg-white/10 border border-white/20 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full backdrop-blur-lg">
            <h2 className="text-4xl font-bold text-white tracking-widest uppercase mb-2">Paused</h2>
            <div className="flex flex-col gap-4 w-full">
              <button
                onClick={onTogglePause}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
              >
                Resume Match
              </button>
              <button
                onClick={onQuitGame}
                className="w-full py-3 px-6 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
              >
                Quit to Menu
              </button>
            </div>
            <div className="text-sm font-normal mt-2 text-center text-gray-400">Press ESC to Resume</div>
          </div>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col justify-center items-center relative">
        {/* Top Player (Partner) */}
        <div className="absolute top-16 flex flex-col items-center">
          {renderPlayerInfo(2, 'top')}
        </div>

        {/* Left Player */}
        <div className="absolute left-8 flex flex-col items-center">
          {renderPlayerInfo(1, 'left')}
        </div>

        {/* Right Player */}
        <div className="absolute right-8 flex flex-col items-center">
          {renderPlayerInfo(3, 'right')}
        </div>

        {/* Center Table (Played Cards) — pushed down to avoid overlapping North player */}
        <div className="relative w-96 h-80 mt-8 flex items-center justify-center">
          <div className="absolute inset-0 bg-green-800/30 rounded-full blur-xl"></div>

          {/* Render played cards stacked in play order, centered on table */}
          {gameState.currentTrick.plays.map((play, i) => {
            // Small offset per card so you can see the play order:
            // First card (lead) at bottom of stack, last card on top
            // Offset each card slightly from center based on their seat direction
            const seatOffsets: Record<number, { x: number; y: number; rotate: number }> = {
              0: { x: 0, y: 20, rotate: 0 },     // South: slightly below center
              1: { x: -25, y: 0, rotate: -6 },    // West: slightly left
              2: { x: 0, y: -20, rotate: 0 },     // North: slightly above center
              3: { x: 25, y: 0, rotate: 6 },      // East: slightly right
            };

            const offset = seatOffsets[play.seat] || { x: 0, y: 0, rotate: 0 };

            return (
              <motion.div
                key={`${play.seat}-${play.card.id}`}
                initial={{ opacity: 0, scale: 0.5, x: offset.x * 3, y: offset.y * 3 }}
                animate={{ opacity: 1, scale: 1.5, x: offset.x, y: offset.y, rotate: offset.rotate }}
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%)`,
                  zIndex: 10 + i, // Play order: first card lowest, last card on top
                }}
              >
                <Card card={play.card} />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                  {getPlayer(play.seat).name}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Player (User) - Rendering handled in footer */}
      </div>

      {/* Bottom Area: User Info + Hand */}
      <div className="mt-auto w-full bg-gradient-to-t from-black/80 to-transparent pb-4 pt-12">
        <div className="flex justify-center mb-2">
          {renderPlayerInfo(0, 'bottom')}
        </div>
        {renderHand()}
      </div>

      {/* Bidding Modal */}
      {renderBiddingControls()}

      {/* Logs Sidebar (Collapsible or small) */}
      <div className="absolute bottom-4 left-4 w-64 h-48 bg-black/70 rounded-lg overflow-hidden flex flex-col pointer-events-auto">
        <div className="bg-black/80 p-2 text-xs font-bold text-gray-300 uppercase tracking-wider">Game Log</div>
        <div className="flex-1 overflow-y-auto p-2 text-xs text-gray-300 font-mono space-y-1">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          <div id="log-end" />
        </div>
      </div>
    </div>
  );
};
