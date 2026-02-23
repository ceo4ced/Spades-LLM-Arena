import { GameState, PlayerState, Card, Trick, Observation, BidAction, PlayAction } from './types';
import { createDeck, shuffle, parseCard } from './deck';
import { getLegalPlays, determineTrickWinner } from './rules';
import { calculateTeamScore } from './scoring';

export interface HandResult {
  team1: { bid: number; won: number; pointsEarned: number; bagsEarned: number; totalScore: number; totalBags: number };
  team2: { bid: number; won: number; pointsEarned: number; bagsEarned: number; totalScore: number; totalBags: number };
  handNumber: number;
}

export class GameEngine {
  state: GameState;
  variant: 'standard' | 'jokers';
  lastHandResult: HandResult | null = null;

  constructor(targetScore: number = 500, variant: 'standard' | 'jokers' = 'standard') {
    this.variant = variant;
    this.state = {
      phase: 'bidding',
      dealer: 0,
      currentTurn: 1,
      players: [
        { seat: 0, hand: [], bid: null, tricksWon: 0, type: 'human', name: 'Player 0' },
        { seat: 1, hand: [], bid: null, tricksWon: 0, type: 'bot', name: 'Player 1' },
        { seat: 2, hand: [], bid: null, tricksWon: 0, type: 'bot', name: 'Player 2' },
        { seat: 3, hand: [], bid: null, tricksWon: 0, type: 'bot', name: 'Player 3' },
      ],
      teams: {
        team1: { score: 0, bags: 0 },
        team2: { score: 0, bags: 0 },
      },
      currentTrick: { number: 1, plays: [], winner: null, ledSuit: null },
      trickHistory: [],
      spadesBroken: false,
      targetScore,
      handNumber: 1,
    };
    this.dealHand();
  }

  dealHand() {
    const deck = shuffle(createDeck(this.variant));
    const cardsPerPlayer = this.variant === 'jokers' ? 13 : 13;
    // Wait, 54 cards / 4 = 13.5. 
    // Standard Spades with Jokers: Remove 2C and 2D -> 52 cards.
    // My createDeck('jokers') already removes 2C and 2D. So it returns 52 cards.

    for (let i = 0; i < 4; i++) {
      this.state.players[i].hand = deck.slice(i * 13, (i + 1) * 13);
      this.state.players[i].bid = null;
      this.state.players[i].tricksWon = 0;
    }
    this.state.phase = 'bidding';
    this.state.currentTurn = (this.state.dealer + 1) % 4;
    this.state.currentTrick = { number: 1, plays: [], winner: null, ledSuit: null };
    this.state.trickHistory = [];
    this.state.spadesBroken = false;
  }

  getObservation(seat: number): Observation {
    const player = this.state.players[seat];
    const partnerSeat = (seat + 2) % 4;

    const obs: Observation = {
      phase: this.state.phase as 'bidding' | 'playing',
      hand: player.hand.map(c => c.id),
      seat,
      partner_seat: partnerSeat,
      dealer: this.state.dealer,
      score: {
        team1: { points: this.state.teams.team1.score, bags: this.state.teams.team1.bags },
        team2: { points: this.state.teams.team2.score, bags: this.state.teams.team2.bags },
      },
    };

    if (this.state.phase === 'bidding') {
      obs.bidding_context = {
        bids_so_far: this.state.players
          .filter(p => p.bid !== null)
          .map(p => ({ seat: p.seat, bid: p.bid! })),
        your_turn_to_bid: this.state.currentTurn === seat,
      };
    } else if (this.state.phase === 'playing') {
      const team1Bid = (this.state.players[0].bid || 0) + (this.state.players[2].bid || 0);
      const team2Bid = (this.state.players[1].bid || 0) + (this.state.players[3].bid || 0);
      const team1Won = this.state.players[0].tricksWon + this.state.players[2].tricksWon;
      const team2Won = this.state.players[1].tricksWon + this.state.players[3].tricksWon;

      const legalPlays = this.state.currentTurn === seat
        ? getLegalPlays(player.hand, this.state.currentTrick.ledSuit, this.state.spadesBroken).map(c => c.id)
        : [];

      obs.playing_context = {
        team_bids: { team1: team1Bid, team2: team2Bid },
        individual_bids: this.state.players.map(p => ({ seat: p.seat, bid: p.bid! })),
        tricks_won: { team1: team1Won, team2: team2Won },
        individual_tricks_won: this.state.players.map(p => p.tricksWon),
        current_trick: this.state.currentTrick.plays.map(p => ({ seat: p.seat, card: p.card.id })),
        trick_history: this.state.trickHistory.map(t => ({
          trick_number: t.number,
          plays: t.plays.map(p => ({ seat: p.seat, card: p.card.id })),
          winner: t.winner!,
          led_suit: t.ledSuit!,
        })),
        spades_broken: this.state.spadesBroken,
        your_turn_to_play: this.state.currentTurn === seat,
        legal_plays: legalPlays,
      };
    }

    return obs;
  }

  processBid(seat: number, action: BidAction): string | null {
    if (this.state.phase !== 'bidding') return 'Not in bidding phase';
    if (this.state.currentTurn !== seat) return 'Not your turn';
    if (action.value < 0 || action.value > 13) return 'Invalid bid value';

    this.state.players[seat].bid = action.value;

    if (this.state.players.every(p => p.bid !== null)) {
      this.state.phase = 'playing';
      this.state.currentTurn = (this.state.dealer + 1) % 4;
    } else {
      this.state.currentTurn = (this.state.currentTurn + 1) % 4;
    }
    return null;
  }

  processPlay(seat: number, action: PlayAction): string | null {
    if (this.state.phase !== 'playing') return 'Not in playing phase';
    if (this.state.currentTurn !== seat) return 'Not your turn';

    const player = this.state.players[seat];
    const card = parseCard(action.card);
    if (!card) return 'Invalid card format';

    const hasCard = player.hand.some(c => c.id === card.id);
    if (!hasCard) return 'You do not have this card';

    const legalPlays = getLegalPlays(player.hand, this.state.currentTrick.ledSuit, this.state.spadesBroken);
    const isLegal = legalPlays.some(c => c.id === card.id);
    if (!isLegal) return 'Illegal play';

    // Apply play
    player.hand = player.hand.filter(c => c.id !== card.id);
    this.state.currentTrick.plays.push({ seat, card });

    if (!this.state.currentTrick.ledSuit) {
      this.state.currentTrick.ledSuit = card.suit === 'J' ? 'S' : card.suit;
    }
    if (card.suit === 'S') {
      this.state.spadesBroken = true;
    }

    // Advance turn temporarily (will be fixed in resolveTrick if trick is full)
    if (!this.isTrickComplete()) {
      this.state.currentTurn = (this.state.currentTurn + 1) % 4;
    }

    return null;
  }

  isTrickComplete(): boolean {
    return this.state.currentTrick.plays.length === 4;
  }

  resolveTrick() {
    if (!this.isTrickComplete()) return;

    const winner = determineTrickWinner(this.state.currentTrick.plays, this.state.currentTrick.ledSuit!);
    this.state.currentTrick.winner = winner;
    this.state.players[winner].tricksWon++;
    this.state.trickHistory.push({ ...this.state.currentTrick });

    if (this.state.trickHistory.length === 13) {
      // End of hand
      this.scoreHand();
    } else {
      // Next trick
      this.state.currentTrick = { number: this.state.trickHistory.length + 1, plays: [], winner: null, ledSuit: null };
      this.state.currentTurn = winner;
    }
  }

  scoreHand() {
    const prevT1 = { ...this.state.teams.team1 };
    const prevT2 = { ...this.state.teams.team2 };

    const t1Bid = (this.state.players[0].bid || 0) + (this.state.players[2].bid || 0);
    const t2Bid = (this.state.players[1].bid || 0) + (this.state.players[3].bid || 0);
    const t1Won = this.state.players[0].tricksWon + this.state.players[2].tricksWon;
    const t2Won = this.state.players[1].tricksWon + this.state.players[3].tricksWon;

    const t1 = calculateTeamScore(this.state.players[0], this.state.players[2], this.state.teams.team1);
    const t2 = calculateTeamScore(this.state.players[1], this.state.players[3], this.state.teams.team2);
    this.state.teams.team1 = t1;
    this.state.teams.team2 = t2;

    this.lastHandResult = {
      handNumber: this.state.handNumber,
      team1: {
        bid: t1Bid, won: t1Won,
        pointsEarned: t1.score - prevT1.score,
        bagsEarned: t1.bags - prevT1.bags + (prevT1.bags > t1.bags ? 10 : 0), // account for bag penalty reset
        totalScore: t1.score, totalBags: t1.bags,
      },
      team2: {
        bid: t2Bid, won: t2Won,
        pointsEarned: t2.score - prevT2.score,
        bagsEarned: t2.bags - prevT2.bags + (prevT2.bags > t2.bags ? 10 : 0),
        totalScore: t2.score, totalBags: t2.bags,
      },
    };

    if (t1.score >= this.state.targetScore || t2.score >= this.state.targetScore) {
      this.state.phase = 'game_over';
    } else {
      this.state.dealer = (this.state.dealer + 1) % 4;
      this.state.handNumber++;
      this.dealHand();
    }
  }
}
