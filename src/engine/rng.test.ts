import { describe, it, expect } from 'vitest';
import { GameEngine } from './game';
import { seededRng, generateRandomSeed } from './rng';

describe('seededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRng(42n);
    const b = seededRng(42n);
    const seqA = Array.from({ length: 16 }, () => a());
    const seqB = Array.from({ length: 16 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = seededRng(1n);
    const b = seededRng(2n);
    const seqA = Array.from({ length: 16 }, () => a());
    const seqB = Array.from({ length: 16 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('emits values in [0, 1)', () => {
    const r = seededRng(123n);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('treats seed 0n as non-degenerate', () => {
    const r = seededRng(0n);
    const seq = Array.from({ length: 4 }, () => r());
    // All entries finite, in range, and not all equal.
    expect(seq.every((v) => Number.isFinite(v) && v >= 0 && v < 1)).toBe(true);
    expect(new Set(seq).size).toBeGreaterThan(1);
  });
});

describe('generateRandomSeed', () => {
  it('returns a u64-range bigint', () => {
    const s = generateRandomSeed();
    expect(typeof s).toBe('bigint');
    expect(s).toBeGreaterThanOrEqual(0n);
    expect(s).toBeLessThan(1n << 64n);
  });

  it('returns different values on consecutive calls (overwhelmingly likely)', () => {
    const seeds = new Set<bigint>();
    for (let i = 0; i < 32; i++) seeds.add(generateRandomSeed());
    expect(seeds.size).toBe(32);
  });
});

describe('GameEngine reproducibility', () => {
  it('produces identical deals for the same seed', () => {
    const a = new GameEngine(500, 'standard', undefined, undefined, 0xCAFEBABEn);
    const b = new GameEngine(500, 'standard', undefined, undefined, 0xCAFEBABEn);

    expect(a.state.dealer).toBe(b.state.dealer);
    for (let seat = 0; seat < 4; seat++) {
      expect(a.state.players[seat].hand.map((c) => c.id))
        .toEqual(b.state.players[seat].hand.map((c) => c.id));
    }
  });

  it('produces different deals for different seeds', () => {
    const a = new GameEngine(500, 'standard', undefined, undefined, 1n);
    const b = new GameEngine(500, 'standard', undefined, undefined, 2n);
    const handsEqual = [0, 1, 2, 3].every((seat) =>
      a.state.players[seat].hand.map((c) => c.id).join() ===
      b.state.players[seat].hand.map((c) => c.id).join(),
    );
    expect(handsEqual).toBe(false);
  });

  it('records a real seed when none is passed', () => {
    const e = new GameEngine();
    expect(e.rngSeed).toBeGreaterThan(0n);
    expect(e.rngSeed).toBeLessThan(1n << 64n);
  });

  it('reproduces second-hand deals across deals (full sequence determinism)', () => {
    // Re-deal manually to confirm the RNG advances deterministically across
    // hand boundaries, not just for the initial deal.
    const a = new GameEngine(500, 'standard', undefined, undefined, 7n);
    const b = new GameEngine(500, 'standard', undefined, undefined, 7n);
    a.dealHand();
    b.dealHand();
    for (let seat = 0; seat < 4; seat++) {
      expect(a.state.players[seat].hand.map((c) => c.id))
        .toEqual(b.state.players[seat].hand.map((c) => c.id));
    }
  });
});
