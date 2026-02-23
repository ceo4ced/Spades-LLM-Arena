import React from 'react';
import { motion } from 'motion/react';
import { Card as CardType } from '../engine/types';

interface CardProps {
  card: CardType | string; // Can be object or ID string (e.g., "AS")
  onClick?: () => void;
  playable?: boolean;
  faceDown?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, onClick, playable, faceDown, size = 'md', className = '' }) => {
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

  const sizeClasses = size === 'sm'
    ? { card: 'w-12 h-16', rank: 'text-xs', suit: 'text-lg', faceInner: 'w-9 h-12', faceSuit: 'text-base' }
    : { card: 'w-20 h-28', rank: 'text-base', suit: 'text-3xl', faceInner: 'w-14 h-22', faceSuit: 'text-3xl' };

  if (faceDown) {
    return (
      <div
        className={`${sizeClasses.card} bg-blue-800 rounded-lg border-2 border-white shadow-md flex items-center justify-center ${className}`}
      >
        <div className={`${sizeClasses.faceInner} border border-blue-600 rounded flex items-center justify-center`}>
          <span className={`text-blue-400 ${sizeClasses.faceSuit}`}>♠</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={playable ? { y: -10 } : {}}
      onClick={playable ? onClick : undefined}
      className={`
        ${sizeClasses.card} bg-white rounded-lg border border-gray-300 shadow-md flex flex-col justify-between p-1 select-none
        ${playable ? 'cursor-pointer hover:shadow-lg ring-2 ring-blue-400 ring-opacity-0 hover:ring-opacity-50' : ''}
        ${isRed ? 'text-red-600' : 'text-black'}
        ${className}
      `}
    >
      <div className={`${sizeClasses.rank} font-bold leading-none`}>{rank}</div>
      <div className={`${sizeClasses.suit} self-center`}>{suitIcon}</div>
      <div className={`${sizeClasses.rank} font-bold leading-none self-end rotate-180`}>{rank}</div>
    </motion.div>
  );
};
