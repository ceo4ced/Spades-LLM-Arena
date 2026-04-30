# SpacetimeDB Data Model — Design

Approved: 2026-04-30. Status: implementation in progress (TDD).

## Goal

A long-term, queryable record of every Spades game played, capable of feeding a learning agent ("Team Iterate"). Must scale to 10K+ games while keeping per-game storage tight enough that LLM `reasoning` text — not state — is the dominant cost.

## Storage backend

SpacetimeDB. Module language: **Rust**. Client SDK: TypeScript (generated bindings).

The existing TS engine (`src/engine/`) keeps running locally and computes game outcomes; it hands the trail of decisions off to the SpacetimeDB module via reducer calls. The module is the system of record; the browser/`stream/orchestrator.ts` are clients.

`better-sqlite3` and `express` in `package.json` become unused.

## Domain hierarchy (Approach 1 — domain-hierarchical)

```
tournament  ─┐
              ▼
            game ──► hand ──► decision
                                 │
                                 └─ optional reasoning (sparse sibling)
```

`trick` is **not** a stored table — every trick is reconstructable in microseconds by replaying that hand's plays.

## Encoding (Approach D — custom bit-packed + replay)

Two ideas combine for ~50–100× compression vs JSON storage:

1. **Bit-packed canonical encodings.** Cards are `u8` (0..54), card sets are `u64` bitmasks, bids/tricks-won pack into `u32`/`u8`. State that takes 2 KB of JSON fits in 40 bytes.
2. **Replay-based reconstruction.** Don't snapshot full `Observation` per decision. Store the hand's *deal* (4 × `CardSet`) plus the *action sequence*. Any state at decision N is `replay(deal, actions[0..N])` — deterministic and microseconds-fast.

### Cards

| Index | Value |
|---|---|
| 0 | 2 of Clubs |
| 1 | 2 of Diamonds |
| 2 | 2 of Hearts |
| 3 | 2 of Spades |
| ... | ... |
| 51 | Ace of Spades |
| 52 | Little Joker |
| 53 | Big Joker |

`Card(u8)` where `index = rank * 4 + suit` for standard cards. Ranks 0..13 = 2..A. Suits 0..3 = Clubs, Diamonds, Hearts, Spades. Jokers reserved at 52, 53.

**Card identity is variant-independent.** A card's index never changes. What *does* change between variants is its trump strength during trick resolution and (in some variants) its effective suit during play. Those concerns live in separate modules — see "Variants" and "Bids" below.

`CardSet(u64)` — bit `i` set means card index `i` is in the set. Membership/insert/remove/intersect/popcount are single CPU operations.

### Variants

```rust
pub enum Variant {
    Standard,        // 52 cards, A♠ is the highest spade
    Jokers,          // 54 cards. Trump order: BigJoker > LittleJoker > A♠ > K♠ > ...
    HighTwos,        // 52 cards. Trump order: 2♦ > 2♠ > A♠ > K♠ > ...
                     //   The 2♦ plays as a spade. Some house variants also elevate 2♣.
    JokersHighTwos,  // 54 cards. Trump order: BigJoker > LittleJoker > 2♦ > 2♠ > A♠ > ...
}
```

Variant-specific behavior is centralized in two pure functions, not scattered across the codebase:

- `trump_strength(card: Card, variant: Variant) -> u8` — returns 0 for non-trump cards, otherwise a positive strength ordering. Lives in `encoding/src/strength.rs`.
- `effective_suit(card: Card, variant: Variant) -> Suit` — for variants where some cards play as a different suit (e.g., 2♦ as a spade in HighTwos). Default implementation returns the card's natural suit. Lives in `encoding/src/legal.rs`.

The `Game` table stores `variant: u8` and is the source of truth at game time. Since the variant is recorded per-game, training data extracted later can be filtered or stratified by variant.

### Bids

A bid is one of three kinds:

```rust
pub enum Bid {
    Regular(u8),   // 1..=13 — standard contract
    Nil,           // "I will win zero tricks." Bonus +50 / -50 (or +100 / -100 in some houses).
                   //   Partner's tricks count for partner only — not for the nil bidder.
    BlindNil,      // Nil declared before looking at hand. Bonus +200 / -200 typically.
}
```

Packed encoding (4 bits per seat):
- `0` — not yet bid (sentinel — only valid mid-bidding-phase)
- `1..=13` — regular bid of that value
- `14` — Nil
- `15` — BlindNil

A `Hand` row's `bids_packed: u32` holds 4 seats × 4 bits = 16 bits actually used. We keep the column at u32 for alignment and future variants (e.g., a "Ten-for-200" team-level overcall, if we ever support it).

Scoring nil correctly is non-trivial — see `encoding/src/score.rs` (future module). Key rules:
- Successful nil: bonus added to team score, but the partner's *regular* bid is scored separately.
- Failed nil: penalty subtracted from team score; tricks the nil bidder *did* win count toward bags (or in some variants, toward the partner's contract).
- Successful blind nil: bonus is doubled.

Each variant of nil is a distinct training signal — Team Iterate should learn when to risk a nil, when to risk a blind nil, and when to bid regular. Encoding them as separate cases (rather than collapsing nil into "bid 0") preserves that information.

### Tables

```rust
#[spacetimedb::table(accessor = tournament, public)]
pub struct Tournament {
    #[primary_key] #[auto_inc] id: u64,
    name: String,
    format: u8,                           // 0=round_robin, 1=single_elim, 2=double_elim
    started_at: Timestamp,
    completed_at: Option<Timestamp>,
    champion_team: Option<String>,
}

#[spacetimedb::table(accessor = game, public)]
pub struct Game {
    #[primary_key] #[auto_inc] id: u64,
    schema_version: u8,                   // bump on encoding changes
    tournament_id: Option<u64>,           // null = mini-game
    started_at: Timestamp,
    completed_at: Option<Timestamp>,
    target_score: u16,
    variant: u8,                          // 0=Standard, 1=Jokers, 2=HighTwos, 3=JokersHighTwos
    team1_seat0_model_id: u32,            // FK → model
    team1_seat2_model_id: u32,
    team2_seat1_model_id: u32,
    team2_seat3_model_id: u32,
    team1_score: i16,
    team2_score: i16,
    team1_bags: u8,
    team2_bags: u8,
    winner_team: u8,                      // 1 or 2; 0 = unfinished
    rng_seed: u64,
}

#[spacetimedb::table(accessor = hand, public)]
pub struct Hand {
    #[primary_key] #[auto_inc] id: u64,
    #[index(btree)] game_id: u64,
    hand_number: u8,
    dealer_seat: u8,
    deal_seat0: u64,                      // CardSet — seat 0's dealt hand
    deal_seat1: u64,
    deal_seat2: u64,
    deal_seat3: u64,
    bids_packed: u16,                     // 4 seats × 4 bits — see "Bids" section
    tricks_won_packed: u8,                // 4 seats × 2 bits
    team1_score_delta: i16,
    team2_score_delta: i16,
}

#[spacetimedb::table(accessor = decision, public)]
pub struct Decision {
    #[primary_key] #[auto_inc] id: u64,
    #[index(btree)] game_id: u64,
    #[index(btree)] hand_id: u64,
    #[index(btree)] model_id: u32,
    decision_index: u16,                  // 0..56 within hand
    seat: u8,
    kind: u8,                             // 0=bid, 1=play
    action: u8,                           // bid encoding (1..=15, see Bids) OR card index (0..=53)
    legal_mask: u64,                      // bitmask of legal actions
    fingerprint: u64,                     // small denormalized state for fast filtering
    latency_ms: u16,
}

#[spacetimedb::table(accessor = reasoning, public)]
pub struct Reasoning {
    #[primary_key] decision_id: u64,
    text_zstd: Vec<u8>,                   // zstd-compressed
}

#[spacetimedb::table(accessor = model, public)]
pub struct Model {
    #[primary_key] #[auto_inc] id: u32,
    name: String,
    kind: u8,                             // 0=random, 1=heuristic, 2=llm, 3=iterate, 4=human
    version: String,
    introduced_at: Timestamp,
}
```

Storage at 10K games (state only, no reasoning): **~250 MB**.
With reasoning at 1KB/decision avg (zstd-compressed): **~2 GB**.
Comparable JSON-fat schema would be: ~15 GB.

## Implementation discipline

Per user directive (2026-04-30):

- **TDD strictly.** Write failing test → watch it fail for the expected reason → write minimal code to pass → next.
- **Pure functions.** All encoding/decoding/replay logic lives in pure functions with no side effects. Database I/O is confined to SpacetimeDB reducers.
- **One function at a time.** All tests for a function pass before moving to the next function.
- **Schema versioning from day one.** `Game.schema_version` is non-negotiable so the bit layout can evolve without dropping data.

## Crate layout

```
spacetime/
  encoding/         # pure logic, no SpacetimeDB deps, fast unit tests
    Cargo.toml
    src/
      lib.rs
      card.rs       # Card / Rank / Suit (variant-independent identity)
      variant.rs    # Variant enum (Standard | Jokers | HighTwos | JokersHighTwos)
      card_set.rs   # CardSet (u64 bitmask)
      bid.rs        # Bid enum (Regular | Nil | BlindNil) + packing
      strength.rs   # trump_strength(card, variant) -> u8
      legal.rs      # effective_suit, legal_plays
      hand.rs       # tricks_won packing, hand-level helpers
      replay.rs     # deterministic replay from (deal, actions)
      score.rs      # hand and game scoring (handles nil, blind nil, bags)
  module/           # SpacetimeDB module — added later, depends on `encoding`
```

Pure crate first. Module crate gets added once encoding/replay/scoring is solid.

## Open questions (deferred — non-blocking)

- Hosting: SpacetimeDB Maincloud vs self-hosted. Decide before module deploy.
- Identity model: anonymous vs named accounts. Decide before client wires up.
- Migration of existing localStorage data. Probably discard — small volume, dev-only.
