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
  players: {
    seat: number;
    type: 'human' | 'bot';
    model:
      | 'random'
      | 'heuristic'
      | 'gemini-flash'
      | 'gemini-pro'
      | 'openrouter'
      | 'anthropic'
      | 'openai';
    openrouter_model?: string;
    anthropic_model?: string;
    openai_model?: string;
    name: string;
  }[];
  /** Optional. Defaults to STRICT_CHEATING_POLICY when omitted. */
  cheatingPolicy?: CheatingPolicy;
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

// ─── Cheating policy ────────────────────────────────────────────────────
//
// Mirrors the per-game `cheating policy` block in the SpacetimeDB schema
// (spacetime/module/src/lib.rs:77-95). The engine only enforces fields that
// affect bid/play resolution. Higher-level fields (chat_policy,
// prompt_cheating_mode, prompt_for_detection, announce_detected_cheats,
// agent_detection_quorum) belong to chat/agent layers and are pass-through
// here.
//
// See Research/NOTES.md for the SARC mapping: this is the engine's
// Pre-Action Gate + Action-Time Monitor; consequences are the Escalation
// Router; cheatEvents are the Post-Action Auditor trace.

export type SpadesLeadPolicy = 'MustBeBroken' | 'AlwaysAllowed';

export type CheatConsequenceKind = 'LogOnly' | 'HandPenalty' | 'GameForfeit';

export interface CheatConsequence {
  kind: CheatConsequenceKind;
  /** Points deducted from the offending team's hand score when kind === 'HandPenalty'. */
  value: number;
}

export interface CheatingPolicy {
  /** Accept off-suit plays when the player could have followed suit. */
  allowRenege: boolean;
  spadesLeadPolicy: SpadesLeadPolicy;
  /** Minimum total team bid. 0 disables the floor. */
  minimumTeamBid: number;
  consequence: CheatConsequence;
}

/** Strict no-cheating defaults — matches the spacetime-results default block. */
export const STRICT_CHEATING_POLICY: CheatingPolicy = {
  allowRenege: false,
  spadesLeadPolicy: 'MustBeBroken',
  minimumTeamBid: 0,
  consequence: { kind: 'LogOnly', value: 0 },
};

export type EngineCheatKind =
  | 'Renege'
  | 'IllegalLead'
  | 'BidBelowMinimum';

export interface CheatEvent {
  handNumber: number;
  /** 1-based trick number within the hand. Bids use 0. */
  trickNumber: number;
  seat: number;
  kind: EngineCheatKind;
  /** The attempted card id (plays) or bid value (bids). */
  attempted: { card?: string; bid?: number };
  consequence: CheatConsequenceKind;
  /** Points actually deducted (HandPenalty) or 0. */
  penaltyApplied: number;
  /** True iff this cheat ended the game (GameForfeit). */
  endedGame: boolean;
}
