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

const SUIT_SYMBOLS: Record<string, string> = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };
const SUIT_COLORS: Record<string, string> = { 'S': 'text-white', 'H': 'text-red-400', 'D': 'text-red-400', 'C': 'text-white' };

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
    window.addEventListener('focus', readSettings);
    return () => window.removeEventListener('focus', readSettings);
  }, []);

  const getPlayer = (seat: number) => gameState.players[seat];

  // Helper to sort a hand for display
  // Team 1 (seats 0,2) = descending rank (A,K,Q…), Team 2 (seats 1,3) = ascending (2,3,4…)
  const sortHand = (hand: CardType[], seat: number) =>
    [...hand].sort((a, b) => {
      const suitOrder: Record<string, number> = { 'S': 0, 'H': 1, 'C': 2, 'D': 3 };
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      const rankValues: Record<string, number> = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
        '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
      };
      const isTeam1 = seat === 0 || seat === 2;
      return isTeam1
        ? rankValues[b.rank] - rankValues[a.rank]
        : rankValues[a.rank] - rankValues[b.rank];
    });

  // Render cards as compact text: "K♥, Q♠, 4♣"
  const renderCardText = (hand: CardType[], seat: number) => {
    const sorted = sortHand(hand, seat);
    return (
      <div className="mt-1 text-sm leading-relaxed flex flex-wrap gap-x-1.5 gap-y-0.5 justify-center">
        {sorted.map((card, i) => (
          <span key={card.id}>
            <span className={SUIT_COLORS[card.suit]}>
              {card.rank}{SUIT_SYMBOLS[card.suit]}
            </span>
            {i < sorted.length - 1 && <span className="text-white/40">, </span>}
          </span>
        ))}
      </div>
    );
  };

  // Compact player info box with text-based cards inside
  const renderPlayerInfo = (seat: number) => {
    const player = getPlayer(seat);
    const isTurn = gameState.currentTurn === seat;
    const shouldShowCards = showCards[seat];

    return (
      <div className={`flex flex-col items-center p-3 rounded-lg ${isTurn ? 'bg-yellow-100/20 ring-2 ring-yellow-400' : 'bg-black/40'} text-white backdrop-blur-sm max-w-[280px] min-w-0`}>
        <div className="font-bold text-base truncate w-full text-center">
          {player.name}
        </div>
        <div className="text-sm">
          Bid: {player.bid !== null ? player.bid : '-'} | Won: {player.tricksWon}
        </div>
        {/* Cards as text or just a count */}
        {shouldShowCards ? (
          renderCardText(player.hand, seat)
        ) : (
          <div className="mt-1 text-sm text-white/50">
            🃏 {player.hand.length} cards
          </div>
        )}
      </div>
    );
  };

  const renderBiddingControls = () => {
    if (gameState.phase !== 'bidding' || !isHumanTurn) return null;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
        <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-5">
          <h2 className="text-3xl font-bold">Your Bid</h2>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setBidValue(Math.max(0, bidValue - 1))}
              className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 font-bold text-2xl"
            >-</button>
            <span className="text-5xl font-mono font-bold w-20 text-center">{bidValue}</span>
            <button
              onClick={() => setBidValue(Math.min(13, bidValue + 1))}
              className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 font-bold text-2xl"
            >+</button>
          </div>
          <button
            onClick={() => onBid(bidValue)}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700 shadow-lg"
          >
            Place Bid
          </button>
          <div className="text-base text-gray-500">
            (0 is Nil - 100 points bonus/penalty)
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full bg-green-900 overflow-hidden flex flex-col">
      {/* Row 1: Scoreboard */}
      <div className="flex-none px-6 py-3 flex justify-between items-start z-20 gap-2 w-full min-w-0">
        <div className="bg-black/50 p-3 rounded text-white backdrop-blur-sm text-sm min-w-0 overflow-hidden">
          <div className="font-bold text-blue-300 truncate">Team 1 ({getPlayer(0).name} + {getPlayer(2).name})</div>
          <div>Score: {gameState.teams.team1.score}</div>
          <div>Bags: {gameState.teams.team1.bags}</div>
        </div>

        <div className="text-center text-white/50 text-sm font-mono bg-black/30 px-3 py-1.5 rounded mt-1 shrink-0">
          Target: {gameState.targetScore}
        </div>

        <div className="bg-black/50 p-3 rounded text-white backdrop-blur-sm text-sm min-w-0 overflow-hidden text-right">
          <div className="font-bold text-red-300 truncate">Team 2 ({getPlayer(1).name} + {getPlayer(3).name})</div>
          <div>Score: {gameState.teams.team2.score}</div>
          <div>Bags: {gameState.teams.team2.bags}</div>
        </div>
      </div>

      {/* Paused Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="bg-white/10 border border-white/20 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full backdrop-blur-lg">
            <h2 className="text-5xl font-bold text-white tracking-widest uppercase mb-2">Paused</h2>
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
      <div className="flex-1 min-h-0 min-w-0 flex items-stretch relative w-full px-4 pb-8">
        {/* Left Player (Seat 1) */}
        <div className="w-[15%] shrink-0 min-w-0 overflow-hidden flex items-center justify-center px-1">
          {renderPlayerInfo(1)}
        </div>

        {/* Center Column: North player + trick area + South player */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-between py-2">
          {/* North Player (Seat 2) */}
          <div className="flex-none">
            {renderPlayerInfo(2)}
          </div>

          {/* Trick Area — centered vertically in remaining space */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative w-80 h-64 flex items-center justify-center">
              <div className="absolute inset-0 bg-green-800/30 rounded-full blur-xl"></div>

              {/* Played cards fanned out with corner overlap */}
              {gameState.currentTrick.plays.map((play, i) => {
                // Final resting positions in the trick pile
                const seatPositions: Record<number, { x: number; y: number; rotate: number }> = {
                  0: { x: 0, y: 45, rotate: 0 },
                  1: { x: -50, y: 0, rotate: -8 },
                  2: { x: 0, y: -45, rotate: 0 },
                  3: { x: 50, y: 0, rotate: 8 },
                };

                // Start positions: farther out toward each player's box
                const startDistance: Record<number, { x: number; y: number }> = {
                  0: { x: 0, y: 220 },     // South — starts below near player box
                  1: { x: -280, y: 0 },    // West — starts left near player box
                  2: { x: 0, y: -220 },    // North — starts above near player box
                  3: { x: 280, y: 0 },     // East — starts right near player box
                };

                const pos = seatPositions[play.seat] || { x: 0, y: 0, rotate: 0 };
                const start = startDistance[play.seat] || { x: 0, y: 0 };

                return (
                  <motion.div
                    key={`${play.seat}-${play.card.id}`}
                    initial={{ opacity: 0, scale: 0.15, x: start.x, y: start.y }}
                    animate={{ opacity: 1, scale: 1.1, x: pos.x, y: pos.y, rotate: pos.rotate }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18, mass: 0.8 }}
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '50%',
                      marginLeft: '-40px',
                      marginTop: '-56px',
                      zIndex: 10 + i,
                    }}
                  >
                    <Card card={play.card} />
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded whitespace-nowrap">
                      {getPlayer(play.seat).name}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* South Player (Seat 0) */}
          <div className="flex-none pb-6">
            {renderPlayerInfo(0)}
          </div>
        </div>

        {/* Right Player (Seat 3) */}
        <div className="w-[15%] shrink-0 min-w-0 overflow-hidden flex items-center justify-center px-1">
          {renderPlayerInfo(3)}
        </div>
      </div>

      {/* Bidding Modal */}
      {renderBiddingControls()}
    </div>
  );
};
