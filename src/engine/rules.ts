import { Card, Suit } from './types';
import { getCardValue } from './deck';

function isTrump(card: Card): boolean {
  return card.suit === 'S' || card.suit === 'J'; // Jokers are trumps
}

export function getLegalPlays(hand: Card[], ledSuit: Suit | null, spadesBroken: boolean): Card[] {
  // If no suit is led (first to play in the trick)
  if (!ledSuit) {
    // Cannot lead spades unless broken or only have spades
    // Jokers count as spades for leading purposes
    const hasOnlySpades = hand.every(c => isTrump(c));
    if (!spadesBroken && !hasOnlySpades) {
      return hand.filter(c => !isTrump(c));
    }
    return [...hand];
  }

  // Must follow suit if able
  // If led suit is Spades, Jokers count as Spades
  // If led suit is NOT Spades, Jokers are NOT that suit (they are trumps)
  
  let cardsOfLedSuit: Card[] = [];
  
  if (ledSuit === 'S') {
    // If Spades led, must follow with Spades OR Jokers
    cardsOfLedSuit = hand.filter(c => isTrump(c));
  } else {
    // If non-Spade led, must follow exact suit (Jokers are NOT part of H/D/C)
    cardsOfLedSuit = hand.filter(c => c.suit === ledSuit);
  }

  if (cardsOfLedSuit.length > 0) {
    return cardsOfLedSuit;
  }

  // Void in led suit, can play anything
  return [...hand];
}

export function determineTrickWinner(plays: { seat: number; card: Card }[], ledSuit: Suit): number {
  let winningPlay = plays[0];

  for (let i = 1; i < plays.length; i++) {
    const play = plays[i];
    const currentWinningCard = winningPlay.card;
    const newCard = play.card;

    const isNewTrump = isTrump(newCard);
    const isCurrentTrump = isTrump(currentWinningCard);

    if (isNewTrump && !isCurrentTrump) {
      // Trump beats non-trump
      winningPlay = play;
    } else if (isNewTrump && isCurrentTrump) {
      // Both trumps: compare values (Big > Little > A > ...)
      if (getCardValue(newCard.rank, newCard.suit) > getCardValue(currentWinningCard.rank, currentWinningCard.suit)) {
        winningPlay = play;
      }
    } else if (!isNewTrump && !isCurrentTrump) {
      // Neither is trump
      if (newCard.suit === currentWinningCard.suit) {
        // Same suit, higher rank wins
        if (getCardValue(newCard.rank, newCard.suit) > getCardValue(currentWinningCard.rank, currentWinningCard.suit)) {
          winningPlay = play;
        }
      } else if (newCard.suit === ledSuit) {
        // New card follows suit, current winner doesn't (shouldn't happen if logic is correct, but safe to handle)
        // Wait, if current winner isn't trump and isn't led suit, it shouldn't be winning unless it was the lead.
        // If new card is led suit and current winner is NOT led suit (and not trump), new card wins.
        if (currentWinningCard.suit !== ledSuit) {
           winningPlay = play;
        }
      }
    }
  }

  return winningPlay.seat;
}
