export type Suit = 'S' | 'H' | 'D' | 'C' | 'J'; // J for Joker (though usually treated as Spades)
export type Rank = 'Big' | 'Little' | 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface GameConfig {
  variant: 'standard' | 'jokers';
  targetScore: number;
  openrouter_api_key?: string;
  players: {
    seat: number;
    type: 'human' | 'bot';
    model: 'random' | 'heuristic' | 'gemini-flash' | 'gemini-pro' | 'openrouter';
    openrouter_model?: string;
    name: string;
  }[];
}

export interface PlayerState {
  seat: number;
  hand: Card[];
  bid: number | null;
  tricksWon: number;
  type: 'human' | 'bot';
  name: string;
}

export interface TeamState {
  score: number;
  bags: number;
}

export interface TrickPlay {
  seat: number;
  card: Card;
}

export interface Trick {
  number: number;
  plays: TrickPlay[];
  winner: number | null;
  ledSuit: Suit | null;
}

export interface GameState {
  phase: 'bidding' | 'playing' | 'game_over';
  dealer: number;
  currentTurn: number;
  players: PlayerState[];
  teams: {
    team1: TeamState; // seats 0 and 2
    team2: TeamState; // seats 1 and 3
  };
  currentTrick: Trick;
  trickHistory: Trick[];
  spadesBroken: boolean;
  targetScore: number;
  handNumber: number;
}

export interface Observation {
  phase: 'bidding' | 'playing';
  hand: string[];
  seat: number;
  partner_seat: number;
  dealer: number;
  score: {
    team1: { points: number; bags: number };
    team2: { points: number; bags: number };
  };
  bidding_context?: {
    bids_so_far: { seat: number; bid: number }[];
    your_turn_to_bid: boolean;
  };
  playing_context?: {
    team_bids: { team1: number; team2: number };
    individual_bids: { seat: number; bid: number }[];
    tricks_won: { team1: number; team2: number };
    individual_tricks_won: number[];
    current_trick: { seat: number; card: string }[];
    trick_history: {
      trick_number: number;
      plays: { seat: number; card: string }[];
      winner: number;
      led_suit: string;
    }[];
    spades_broken: boolean;
    your_turn_to_play: boolean;
    legal_plays: string[];
  };
}

export interface BidAction {
  action: 'bid';
  value: number;
  reasoning: string;
}

export interface PlayAction {
  action: 'play';
  card: string;
  reasoning: string;
}
