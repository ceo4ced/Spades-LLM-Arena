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
}

export const GameBoard: React.FC<GameBoardProps> = ({ gameState, onBid, onPlay, isHumanTurn, logs, isPaused, onTogglePause }) => {
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
          {seat === 0 ? 'You' : `Bot ${seat}`}
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
               Winner: {gameState.trickHistory[gameState.trickHistory.length - 1].winner === 0 ? 'You' : `Bot ${gameState.trickHistory[gameState.trickHistory.length - 1].winner}`}
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
          <div className="font-bold text-blue-300">Team 1 (You + Bot 2)</div>
          <div>Score: {gameState.teams.team1.score}</div>
          <div>Bags: {gameState.teams.team1.bags}</div>
        </div>
        
        <div className="pointer-events-auto">
          <div className="mt-2 text-center text-white/50 text-xs font-mono bg-black/30 px-2 py-1 rounded">
            Target: {gameState.targetScore}
          </div>
        </div>

        <div className="bg-black/50 p-2 rounded text-white backdrop-blur-sm">
          <div className="font-bold text-red-300">Team 2 (Bot 1 + Bot 3)</div>
          <div>Score: {gameState.teams.team2.score}</div>
          <div>Bags: {gameState.teams.team2.bags}</div>
        </div>
      </div>

      {/* Paused Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="text-4xl font-bold text-white tracking-widest animate-pulse">
            GAME PAUSED
            <div className="text-sm font-normal mt-4 text-center text-gray-300">Press ESC to Resume</div>
          </div>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col justify-center items-center relative">
        {/* Top Player (Partner) */}
        <div className="absolute top-16 flex flex-col items-center">
          <PlayerAvatar player={getPlayer(2)} isCurrentTurn={gameState.currentTurn === 2} />
        </div>

        {/* Left Player */}
        <div className="absolute left-8 flex flex-col items-center">
          <PlayerAvatar player={getPlayer(1)} isCurrentTurn={gameState.currentTurn === 1} />
        </div>

        {/* Right Player */}
        <div className="absolute right-8 flex flex-col items-center">
          <PlayerAvatar player={getPlayer(3)} isCurrentTurn={gameState.currentTurn === 3} />
        </div>

        {/* Center Table (Played Cards) */}
        <div className="relative w-96 h-96 flex items-center justify-center">
          <div className="absolute inset-0 bg-green-800/30 rounded-full blur-xl"></div>
          
          {/* Render played cards in specific positions */}
          {gameState.currentTrick.plays.map((play, i) => {
            // Map seat to position relative to user (South)
            // User is 0. 
            // 0 -> Bottom
            // 1 -> Left
            // 2 -> Top
            // 3 -> Right
            const positions = [
              { bottom: 40, left: '50%', transform: 'translateX(-50%) scale(1.5)', zIndex: 10 }, // South (User)
              { left: 40, top: '50%', transform: 'translateY(-50%) rotate(90deg) scale(1.5)', zIndex: 10 }, // West
              { top: 40, left: '50%', transform: 'translateX(-50%) scale(1.5)', zIndex: 10 }, // North
              { right: 40, top: '50%', transform: 'translateY(-50%) rotate(-90deg) scale(1.5)', zIndex: 10 } // East
            ];
            
            return (
              <motion.div
                key={`${play.seat}-${play.card.id}`}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1.5 }}
                className="absolute"
                style={positions[play.seat]}
              >
                <CardView card={play.card} />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                  {getPlayer(play.seat).name}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Player (User) */}
        <div className="absolute bottom-8 flex flex-col items-center w-full max-w-4xl">
          <PlayerAvatar player={getPlayer(0)} isCurrentTurn={gameState.currentTurn === 0} />
        </div>
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
