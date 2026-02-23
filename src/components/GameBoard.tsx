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
  const [showCards, setShowCards] = useState([true, false, false, false]);

  // Read show-cards settings from localStorage
  useEffect(() => {
    const readSettings = () => {
      setShowCards([
        localStorage.getItem('spades_show_cards_0') !== 'false',
        localStorage.getItem('spades_show_cards_1') === 'true',
        localStorage.getItem('spades_show_cards_2') === 'true',
        localStorage.getItem('spades_show_cards_3') === 'true',
      ]);
    };
    readSettings();
    // Re-read when window gets focus (after settings modal)
    window.addEventListener('focus', readSettings);
    return () => window.removeEventListener('focus', readSettings);
  }, []);

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
    const shouldShowCards = showCards[seat];

    // Sort hand for display
    const sortedHand = [...player.hand].sort((a, b) => {
      const suitOrder: Record<string, number> = { 'S': 0, 'H': 1, 'C': 2, 'D': 3 };
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      const rankValues: Record<string, number> = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
        '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
      };
      return rankValues[b.rank] - rankValues[a.rank];
    });

    return (
      <div className={`flex flex-col items-center p-2 rounded-lg ${isTurn ? 'bg-yellow-100/20 ring-2 ring-yellow-400' : 'bg-black/40'} text-white backdrop-blur-sm w-full min-w-0 overflow-hidden`}>
        <div className="font-bold text-sm truncate w-full text-center">
          {player.name}
        </div>
        <div className="text-xs">
          Bid: {player.bid !== null ? player.bid : '-'} | Won: {player.tricksWon}
        </div>
        {/* Show cards face-up or face-down based on settings */}
        {shouldShowCards && seat !== 0 ? (
          <div className="mt-1 flex -space-x-6 w-full overflow-hidden">
            {sortedHand.map((card) => (
              <div key={card.id} className="shrink-0">
                <Card card={card} />
              </div>
            ))}
          </div>
        ) : seat !== 0 ? (
          <div className="mt-1 flex -space-x-2">
            {Array.from({ length: Math.min(player.hand.length, 5) }).map((_, i) => (
              <div key={i} className="w-3 h-5 bg-blue-800 rounded border border-white/50" />
            ))}
            {player.hand.length > 5 && <span className="text-xs ml-1">+{player.hand.length - 5}</span>}
          </div>
        ) : null}
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
    if (!showCards[0]) return null;

    // Sort hand by suit (S, H, C, D) and rank
    const sortedHand = [...userPlayer.hand].sort((a, b) => {
      const suitOrder: Record<string, number> = { 'S': 0, 'H': 1, 'C': 2, 'D': 3 };
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      const rankValues: Record<string, number> = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
        '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
      };
      return rankValues[b.rank] - rankValues[a.rank];
    });

    return (
      <div className="flex justify-center -space-x-6 py-1 overflow-x-auto px-4">
        {sortedHand.map((card) => (
          <Card
            key={card.id}
            card={card}
            playable={isHumanTurn && gameState.phase === 'playing'}
            onClick={() => isHumanTurn && gameState.phase === 'playing' && onPlay(card.id)}
            className="transform hover:-translate-y-3 transition-transform duration-200 shadow-lg"
          />
        ))}
      </div>
    );
  };

  return (
    <div className="relative w-full h-screen bg-green-900 overflow-hidden flex flex-col" style={{ paddingRight: '50px' }}>
      {/* Row 1: Scoreboard */}
      <div className="flex-none px-6 py-3 flex justify-between items-start z-20 gap-2 w-full min-w-0">
        <div className="bg-black/50 p-2 rounded text-white backdrop-blur-sm text-xs min-w-0 overflow-hidden">
          <div className="font-bold text-blue-300 truncate">Team 1 ({getPlayer(0).name} + {getPlayer(2).name})</div>
          <div>Score: {gameState.teams.team1.score}</div>
          <div>Bags: {gameState.teams.team1.bags}</div>
        </div>

        <div className="text-center text-white/50 text-xs font-mono bg-black/30 px-2 py-1 rounded mt-1 shrink-0">
          Target: {gameState.targetScore}
        </div>

        <div className="bg-black/50 p-2 rounded text-white backdrop-blur-sm text-xs min-w-0 overflow-hidden text-right">
          <div className="font-bold text-red-300 truncate">Team 2 ({getPlayer(1).name} + {getPlayer(3).name})</div>
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

      {/* Row 2: Game Table — fills remaining vertical space */}
      <div className="flex-1 min-h-0 min-w-0 flex items-stretch relative w-full px-4">
        {/* Left Player */}
        <div className="w-[20%] shrink-0 min-w-0 overflow-hidden flex items-center justify-center px-1">
          {renderPlayerInfo(1, 'left')}
        </div>

        {/* Center Column: North player + trick area */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-between py-2">
          {/* North Player */}
          <div className="flex-none">
            {renderPlayerInfo(2, 'top')}
          </div>

          {/* Trick Area — centered vertically in remaining space */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative w-72 h-56 flex items-center justify-center">
              <div className="absolute inset-0 bg-green-800/30 rounded-full blur-xl"></div>

              {/* Played cards fanned out with corner overlap */}
              {gameState.currentTrick.plays.map((play, i) => {
                const seatPositions: Record<number, { x: number; y: number; rotate: number }> = {
                  0: { x: 0, y: 45, rotate: 0 },
                  1: { x: -50, y: 0, rotate: -8 },
                  2: { x: 0, y: -45, rotate: 0 },
                  3: { x: 50, y: 0, rotate: 8 },
                };

                const pos = seatPositions[play.seat] || { x: 0, y: 0, rotate: 0 };

                return (
                  <motion.div
                    key={`${play.seat}-${play.card.id}`}
                    initial={{ opacity: 0, scale: 0.3, x: pos.x * 3, y: pos.y * 3 }}
                    animate={{ opacity: 1, scale: 1.1, x: pos.x, y: pos.y, rotate: pos.rotate }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '50%',
                      marginLeft: '-28px',
                      marginTop: '-40px',
                      zIndex: 10 + i,
                    }}
                  >
                    <Card card={play.card} />
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                      {getPlayer(play.seat).name}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* South Player Info (above hand) */}
          <div className="flex-none">
            {renderPlayerInfo(0, 'bottom')}
          </div>
        </div>

        {/* Right Player */}
        <div className="w-[20%] shrink-0 min-w-0 overflow-hidden flex items-center justify-center px-1">
          {renderPlayerInfo(3, 'right')}
        </div>

        {/* Game Log — bottom-right overlay */}
        <div className="absolute bottom-0 right-4 w-48 h-32 bg-black/70 rounded-tl-lg overflow-hidden flex flex-col z-10">
          <div className="bg-black/80 px-2 py-1 text-[10px] font-bold text-gray-300 uppercase tracking-wider">Game Log</div>
          <div className="flex-1 overflow-y-auto px-2 py-1 text-[10px] text-gray-300 font-mono space-y-0.5">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            <div id="log-end" />
          </div>
        </div>
      </div>

      {/* Row 3: Hand — fixed at bottom */}
      <div className="flex-none w-full bg-gradient-to-t from-black/60 to-transparent pb-2 pt-1">
        {renderHand()}
      </div>

      {/* Bidding Modal */}
      {renderBiddingControls()}
    </div>
  );
};
