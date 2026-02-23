import { Agent } from './base';
import { Observation, BidAction, PlayAction } from '../engine/types';
import { getCardValue, parseCard } from '../engine/deck';

export class HeuristicAgent implements Agent {
  name: string;

  constructor(name: string = 'HeuristicBot') {
    this.name = name;
  }

  async bid(observation: Observation): Promise<BidAction> {
    const hand = observation.hand.map(id => parseCard(id)!);
    let expectedTricks = 0;

    const suits = { S: 0, H: 0, D: 0, C: 0 };
    hand.forEach(c => suits[c.suit]++);

    for (const card of hand) {
      if (card.rank === 'A' || card.rank === 'K') {
        expectedTricks += 1;
      } else if (card.rank === 'Q' && suits[card.suit] >= 2) {
        expectedTricks += 0.5;
      }
    }

    // Spades length bonus
    if (suits.S > 4) {
      expectedTricks += (suits.S - 4);
    }

    let bid = Math.round(expectedTricks);
    if (bid < 1) bid = 1; // Or Nil if hand evaluation <= 0 and no spades above 8, but we'll simplify to min 1 or 0 if very weak.

    if (expectedTricks <= 0 && !hand.some(c => c.suit === 'S' && getCardValue(c.rank, c.suit) > 8)) {
      bid = 0;
    }

    return {
      action: 'bid',
      value: bid,
      reasoning: `Heuristic evaluation: ${expectedTricks} expected tricks.`,
    };
  }

  async play(observation: Observation): Promise<PlayAction> {
    const legalPlaysIds = observation.playing_context?.legal_plays || [];
    if (legalPlaysIds.length === 0) {
      throw new Error('No legal plays available');
    }
    const legalPlays = legalPlaysIds.map(id => parseCard(id)!);

    const currentTrick = observation.playing_context?.current_trick || [];

    let chosenCard = legalPlays[0];

    if (currentTrick.length === 0) {
      // Leading
      const nonSpades = legalPlays.filter(c => c.suit !== 'S' && c.suit !== 'J');
      if (nonSpades.length > 0) {
        // Find longest non-trump suit
        const suits = { H: 0, D: 0, C: 0 };
        nonSpades.forEach(c => suits[c.suit as 'H' | 'D' | 'C']++);
        let maxSuit = 'H';
        if (suits.D > suits[maxSuit as 'H' | 'D' | 'C']) maxSuit = 'D';
        if (suits.C > suits[maxSuit as 'H' | 'D' | 'C']) maxSuit = 'C';

        const cardsInMaxSuit = nonSpades.filter(c => c.suit === maxSuit);
        // Play highest
        chosenCard = cardsInMaxSuit.reduce((prev, curr) => getCardValue(curr.rank, curr.suit) > getCardValue(prev.rank, prev.suit) ? curr : prev);
      } else {
        // Only spades or jokers
        chosenCard = legalPlays.reduce((prev, curr) => getCardValue(curr.rank, curr.suit) > getCardValue(prev.rank, prev.suit) ? curr : prev);
      }
    } else {
      // Following
      let ledSuit = currentTrick[0].card.slice(-1);
      if (currentTrick[0].card === 'BigJoker' || currentTrick[0].card === 'LittleJoker') {
        ledSuit = 'S';
      }

      const followingSuit = legalPlays.filter(c => (c.suit === ledSuit) || (ledSuit === 'S' && c.suit === 'J'));

      if (followingSuit.length > 0) {
        // Can follow suit
        // Simplified: play lowest card in suit
        chosenCard = followingSuit.reduce((prev, curr) => getCardValue(curr.rank, curr.suit) < getCardValue(prev.rank, prev.suit) ? curr : prev);
      } else {
        // Void
        const spades = legalPlays.filter(c => c.suit === 'S' || c.suit === 'J');
        if (spades.length > 0) {
          // Trump with lowest spade
          chosenCard = spades.reduce((prev, curr) => getCardValue(curr.rank, curr.suit) < getCardValue(prev.rank, prev.suit) ? curr : prev);
        } else {
          // Discard lowest card
          chosenCard = legalPlays.reduce((prev, curr) => getCardValue(curr.rank, curr.suit) < getCardValue(prev.rank, prev.suit) ? curr : prev);
        }
      }
    }

    return {
      action: 'play',
      card: chosenCard.id,
      reasoning: 'Heuristic play logic applied.',
    };
  }

  reset(): void {
    // No state to reset
  }
}
