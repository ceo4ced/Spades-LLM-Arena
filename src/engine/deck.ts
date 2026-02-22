import { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export function createDeck(variant: 'standard' | 'jokers' = 'standard'): Card[] {
  const deck: Card[] = [];
  
  if (variant === 'standard') {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, id: `${rank}${suit}` });
      }
    }
  } else if (variant === 'jokers') {
    // Jokers variant: Remove 2C and 2D, add Big Joker and Little Joker
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        if ((suit === 'C' || suit === 'D') && rank === '2') continue;
        deck.push({ suit, rank, id: `${rank}${suit}` });
      }
    }
    // Add Jokers
    // We'll treat them as having suit 'J' for internal logic, but they act as Spades
    deck.push({ suit: 'J', rank: 'Big', id: 'BigJoker' });
    deck.push({ suit: 'J', rank: 'Little', id: 'LittleJoker' });
  }
  
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getCardValue(rank: Rank, suit: Suit): number {
  if (suit === 'J') {
    return rank === 'Big' ? 16 : 15; // Big Joker > Little Joker > Ace (14)
  }
  
  const values: Record<string, number> = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  return values[rank] || 0;
}

export function parseCard(id: string): Card | null {
  if (id === 'BigJoker') return { suit: 'J', rank: 'Big', id };
  if (id === 'LittleJoker') return { suit: 'J', rank: 'Little', id };

  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  if (SUITS.includes(suit) && RANKS.includes(rank)) {
    return { suit, rank, id };
  }
  return null;
}
