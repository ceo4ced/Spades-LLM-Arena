import React from 'react';
import { motion } from 'motion/react';
import { Card as CardType } from '../engine/types';

interface CardProps {
  card: CardType | string; // Can be object or ID string (e.g., "AS")
  onClick?: () => void;
  playable?: boolean;
  faceDown?: boolean;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, onClick, playable, faceDown, className = '' }) => {
  const cardId = typeof card === 'string' ? card : card.id;
  const suit = cardId.slice(-1);
  const rank = cardId.slice(0, -1);
  
  const isRed = suit === 'H' || suit === 'D';
  
  const suitIcon = {
    'S': '♠',
    'H': '♥',
    'D': '♦',
    'C': '♣',
  }[suit];

  if (faceDown) {
    return (
      <div 
        className={`w-16 h-24 bg-blue-800 rounded-lg border-2 border-white shadow-md flex items-center justify-center ${className}`}
      >
        <div className="w-12 h-20 border border-blue-600 rounded flex items-center justify-center">
          <span className="text-blue-400 text-2xl">♠</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={playable ? { y: -10 } : {}}
      onClick={playable ? onClick : undefined}
      className={`
        w-16 h-24 bg-white rounded-lg border border-gray-300 shadow-md flex flex-col justify-between p-1 select-none
        ${playable ? 'cursor-pointer hover:shadow-lg ring-2 ring-blue-400 ring-opacity-0 hover:ring-opacity-50' : ''}
        ${isRed ? 'text-red-600' : 'text-black'}
        ${className}
      `}
    >
      <div className="text-sm font-bold leading-none">{rank}</div>
      <div className="text-2xl self-center">{suitIcon}</div>
      <div className="text-sm font-bold leading-none self-end rotate-180">{rank}</div>
    </motion.div>
  );
};
