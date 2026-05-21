/**
 * Seeded 64-bit PRNG used by the engine for reproducible deals and dealer
 * selection. Splitmix64 — single 64-bit state, good statistical quality,
 * trivial to implement with BigInt.
 *
 * The seed is persisted in the SpacetimeDB `Game.rng_seed` column, so any
 * recorded game can be replayed by re-running the engine with the same seed.
 * Same seed + same variant + same dealer-policy + same agent decisions →
 * byte-identical game.
 *
 * The agents themselves are not seeded by this RNG (LLM agents are
 * non-deterministic anyway, and RandomAgent uses `Math.random`). Engine-side
 * reproducibility is the goal: deck shuffles and initial-dealer selection.
 */

const MASK_64 = 0xFFFFFFFFFFFFFFFFn;
const SPLITMIX_INC = 0x9E3779B97F4A7C15n;
const SPLITMIX_M1 = 0xBF58476D1CE4E5B9n;
const SPLITMIX_M2 = 0x94D049BB133111EBn;
const TWO_53 = 1n << 53n;

/**
 * Build a `Math.random`-compatible function ([0, 1)) backed by splitmix64
 * with the given 64-bit seed. Seed `0n` is replaced with `1n` to avoid
 * degenerate behavior in implementations that fix-point on zero (splitmix64
 * does not, but defensive).
 */
export function seededRng(seed: bigint): () => number {
  let state = (seed & MASK_64) || 1n;
  return () => {
    state = (state + SPLITMIX_INC) & MASK_64;
    let z = state;
    z = ((z ^ (z >> 30n)) * SPLITMIX_M1) & MASK_64;
    z = ((z ^ (z >> 27n)) * SPLITMIX_M2) & MASK_64;
    z = z ^ (z >> 31n);
    // Top 53 bits → uniform [0, 1).
    return Number(z >> 11n) / Number(TWO_53);
  };
}

/**
 * Cryptographically random 64-bit seed for new games. Falls back to
 * `Math.random` if Web Crypto isn't available (should never trigger in
 * modern browsers or Node ≥ 19).
 */
export function generateRandomSeed(): bigint {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new BigUint64Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  const hi = BigInt(Math.floor(Math.random() * 0x100000000));
  const lo = BigInt(Math.floor(Math.random() * 0x100000000));
  return ((hi << 32n) | lo) & MASK_64;
}
