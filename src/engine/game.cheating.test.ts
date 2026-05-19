import { describe, it, expect } from 'vitest';
import { GameEngine } from './game';
import { Card, CheatingPolicy, STRICT_CHEATING_POLICY } from './types';

// ─── helpers ──────────────────────────────────────────────────────────
//
// These tests sidestep dealing and bidding by overwriting the engine's
// internal hands + phase directly. The point is to exercise processPlay's
// cheat-routing logic, not the dealer.

const C = (id: string): Card => {
  const rank = id.slice(0, -1) as Card['rank'];
  const suit = id.slice(-1) as Card['suit'];
  return { id, suit, rank };
};

function midHandSetup(
  engine: GameEngine,
  opts: {
    turnSeat: number;
    ledSuit: Card['suit'] | null;
    seatHands: Record<number, string[]>;
    spadesBroken?: boolean;
    /** Plays already in the current trick before turnSeat plays. */
    priorPlays?: { seat: number; card: string }[];
  },
) {
  engine.state.phase = 'playing';
  engine.state.currentTurn = opts.turnSeat;
  engine.state.spadesBroken = opts.spadesBroken ?? false;
  engine.state.currentTrick = {
    number: 1,
    plays: (opts.priorPlays ?? []).map((p) => ({ seat: p.seat, card: C(p.card) })),
    winner: null,
    ledSuit: opts.ledSuit,
  };
  engine.state.trickHistory = [
    // Pad with a sham completed trick so the forced-opening rule
    // (first card of hand) no longer applies.
    { number: 0, plays: [], winner: 0, ledSuit: 'C' as Card['suit'] },
  ];
  for (const seat of [0, 1, 2, 3]) {
    const ids = opts.seatHands[seat] ?? [];
    engine.state.players[seat].hand = ids.map(C);
    engine.state.players[seat].bid = engine.state.players[seat].bid ?? 3;
  }
}

const policy = (over: Partial<CheatingPolicy>): CheatingPolicy => ({
  ...STRICT_CHEATING_POLICY,
  ...over,
});

// ─── tests ────────────────────────────────────────────────────────────

describe('strict policy (default)', () => {
  it('rejects a renege when allowRenege=false', () => {
    const e = new GameEngine(500, 'standard');
    midHandSetup(e, {
      turnSeat: 1,
      ledSuit: 'H',
      priorPlays: [{ seat: 0, card: 'KH' }],
      seatHands: { 1: ['2H', 'AC'] }, // has a heart, attempts a club
    });

    const err = e.processPlay(1, { action: 'play', card: 'AC', reasoning: '' });
    expect(err).toBe('Illegal play');
    expect(e.cheatEvents).toHaveLength(0);
    // Card not removed from hand.
    expect(e.state.players[1].hand.map((c) => c.id)).toContain('AC');
  });
});

describe('permissive policy — LogOnly', () => {
  it('accepts a renege and records a CheatEvent with no penalty', () => {
    const e = new GameEngine(
      500,
      'standard',
      undefined,
      policy({ allowRenege: true, consequence: { kind: 'LogOnly', value: 0 } }),
    );
    midHandSetup(e, {
      turnSeat: 1,
      ledSuit: 'H',
      priorPlays: [{ seat: 0, card: 'KH' }],
      seatHands: { 1: ['2H', 'AC'] },
    });

    const err = e.processPlay(1, { action: 'play', card: 'AC', reasoning: '' });
    expect(err).toBeNull();
    expect(e.cheatEvents).toHaveLength(1);
    expect(e.cheatEvents[0]).toMatchObject({
      seat: 1,
      kind: 'Renege',
      attempted: { card: 'AC' },
      consequence: 'LogOnly',
      penaltyApplied: 0,
      endedGame: false,
    });
    // Play actually applied.
    expect(e.state.players[1].hand.map((c) => c.id)).not.toContain('AC');
    expect(e.state.currentTrick.plays.find((p) => p.seat === 1)?.card.id).toBe('AC');
  });
});

describe('penalty policy — HandPenalty', () => {
  it('records penaltyApplied = consequence.value', () => {
    const e = new GameEngine(
      500,
      'standard',
      undefined,
      policy({ allowRenege: true, consequence: { kind: 'HandPenalty', value: 50 } }),
    );
    midHandSetup(e, {
      turnSeat: 1,
      ledSuit: 'H',
      priorPlays: [{ seat: 0, card: 'KH' }],
      seatHands: { 1: ['2H', 'AC'] },
    });

    e.processPlay(1, { action: 'play', card: 'AC', reasoning: '' });
    expect(e.cheatEvents[0]).toMatchObject({
      consequence: 'HandPenalty',
      penaltyApplied: 50,
      endedGame: false,
    });
  });
});

describe('forfeit policy — GameForfeit', () => {
  it('ends the game immediately, opposing team wins', () => {
    const e = new GameEngine(
      500,
      'standard',
      undefined,
      policy({ allowRenege: true, consequence: { kind: 'GameForfeit', value: 0 } }),
    );
    midHandSetup(e, {
      turnSeat: 1, // team 2
      ledSuit: 'H',
      priorPlays: [{ seat: 0, card: 'KH' }],
      seatHands: { 1: ['2H', 'AC'] },
    });

    const err = e.processPlay(1, { action: 'play', card: 'AC', reasoning: '' });
    expect(err).toBeNull();
    expect(e.state.phase).toBe('game_over');
    expect(e.cheatEvents[0].endedGame).toBe(true);
    // Team 1 wins (offender was team 2 = seat 1).
    expect(e.state.teams.team1.score).toBeGreaterThanOrEqual(e.state.targetScore);
    expect(e.state.teams.team2.score).toBeLessThan(e.state.targetScore);
  });
});

describe('spadesLeadPolicy = AlwaysAllowed', () => {
  it('lets the leader play spades before spades are broken', () => {
    const e = new GameEngine(
      500,
      'standard',
      undefined,
      policy({ spadesLeadPolicy: 'AlwaysAllowed' }),
    );
    midHandSetup(e, {
      turnSeat: 0,
      ledSuit: null,
      spadesBroken: false,
      seatHands: { 0: ['AS', '2H'] }, // ace of spades + a heart
    });

    const err = e.processPlay(0, { action: 'play', card: 'AS', reasoning: '' });
    expect(err).toBeNull();
    expect(e.state.spadesBroken).toBe(true);
  });

  it('still rejects spade lead under MustBeBroken when other suits exist', () => {
    const e = new GameEngine(500, 'standard'); // strict default
    midHandSetup(e, {
      turnSeat: 0,
      ledSuit: null,
      spadesBroken: false,
      seatHands: { 0: ['AS', '2H'] },
    });
    const err = e.processPlay(0, { action: 'play', card: 'AS', reasoning: '' });
    expect(err).toBe('Illegal play');
  });
});

describe('forced-opening rule is non-negotiable even with allowRenege', () => {
  it('rejects non-2C opener on trick 1 of standard variant', () => {
    const e = new GameEngine(
      500,
      'standard',
      undefined,
      policy({ allowRenege: true, consequence: { kind: 'LogOnly', value: 0 } }),
    );
    // Don't run midHandSetup — we WANT the forced-opening guard active.
    // The engine state already has the lowest club holder as currentTurn after
    // bidding completes; simulate that by directly seeding state.
    e.state.phase = 'playing';
    e.state.currentTrick = { number: 1, plays: [], winner: null, ledSuit: null };
    e.state.trickHistory = [];
    e.state.spadesBroken = false;
    e.state.players[0].hand = [C('2C'), C('AH')];
    e.state.currentTurn = 0;
    // Seat 0 must play 2C; attempting AH (renege) should still be rejected.
    const err = e.processPlay(0, { action: 'play', card: 'AH', reasoning: '' });
    expect(err).toBe('Illegal play');
    expect(e.cheatEvents).toHaveLength(0);
  });
});

describe('minimum-team-bid floor', () => {
  it('flags BidBelowMinimum at hand-scoring time when team bid is too low', () => {
    const e = new GameEngine(
      500,
      'standard',
      undefined,
      policy({ minimumTeamBid: 4, consequence: { kind: 'LogOnly', value: 0 } }),
    );

    // Stage end-of-hand state: 13 tricks completed, everyone holds 0 cards.
    // We rig bids so team1 = 3 (below floor 4) and team2 = 5.
    e.state.phase = 'playing';
    e.state.players[0].bid = 1;
    e.state.players[2].bid = 2; // team1 total = 3
    e.state.players[1].bid = 3;
    e.state.players[3].bid = 2; // team2 total = 5
    // Give each player some "won tricks" so calculateTeamScore doesn't div by 0
    e.state.players[0].tricksWon = 2;
    e.state.players[2].tricksWon = 2;
    e.state.players[1].tricksWon = 5;
    e.state.players[3].tricksWon = 4;
    e.state.players.forEach((p) => (p.hand = []));
    e.state.trickHistory = Array.from({ length: 13 }, (_, i) => ({
      number: i + 1,
      plays: [],
      winner: 0,
      ledSuit: 'C' as Card['suit'],
    }));

    e.scoreHand();

    const flagged = e.cheatEvents.filter((ev) => ev.kind === 'BidBelowMinimum');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ seat: 2, attempted: { bid: 3 } });
  });
});
