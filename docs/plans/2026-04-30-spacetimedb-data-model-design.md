# SpacetimeDB Data Model — Design

Approved: 2026-04-30. Status: implementation in progress (TDD).

## Goal

A long-term, queryable record of every Spades game played, capable of feeding a learning agent ("Team Iterate"). Must scale to 10K+ games while keeping per-game storage tight enough that LLM `reasoning` text — not state — is the dominant cost.

A secondary research goal: study LLM behavior in social-deception scenarios. Settings allow turning specific cheating affordances on/off so we can test (a) spontaneous cheating, (b) cheat-detection ability, (c) persistence of cheating after detection, and (d) emergent code invention between partners. See "Cheating Settings" below.

## Storage backend

SpacetimeDB. Module language: **Rust**. Client SDK: TypeScript (generated bindings).

The existing TS engine (`src/engine/`) keeps running locally and computes game outcomes; it hands the trail of decisions off to the SpacetimeDB module via reducer calls. The module is the system of record; the browser/`stream/orchestrator.ts` are clients.

`better-sqlite3` and `express` in `package.json` become unused.

## Domain hierarchy (Approach 1 — domain-hierarchical)

```
tournament  ─┐
              ▼
            game ──► hand ──► decision
              │                  │
              │                  └─ optional reasoning (sparse sibling)
              └────► communication, accusation (sparse — cheating-research data)
```

`trick` is **not** a stored table — every trick is reconstructable in microseconds by replaying that hand's plays.

## Encoding (Approach D — custom bit-packed + replay)

Two ideas combine for ~50–100× compression vs JSON storage:

1. **Bit-packed canonical encodings.** Cards are `u8` (0..54), card sets are `u64` bitmasks, bids/tricks-won pack into small ints. State that takes 2 KB of JSON fits in 40 bytes.
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

**Card identity is variant-independent.** A card's index never changes. What *does* change between variants is which subset of cards is in the deck, the trump strength order, and (in some variants) a card's effective suit during play. Those concerns live in separate modules — see "Variants" and "Bids" below.

`CardSet(u64)` — bit `i` set means card index `i` is in the set. Membership/insert/remove/intersect/popcount are single CPU operations.

### Variants

**Three variants. Every variant has exactly 52 cards.** Adding jokers always means *removing* two standard cards to keep the count constant.

```rust
pub enum Variant {
    Standard,    // 52 standard cards. A♠ is the highest spade. Wire code 0.
    JJA,         // Jokers + Ace high. 50 standard - {2♥, 2♦} + 2 jokers. Wire code 1.
    JJDD,        // Jokers + Deuce-Deuce. 50 standard - {2♥, 2♣} + 2 jokers. Wire code 2.
}
```

| Variant | Cards removed | Cards added | Trump count |
|---|---|---|---|
| Standard | none | none | 13 (all spades) |
| JJA | 2♥, 2♦ | Big Joker, Little Joker | 15 (13 spades + 2 jokers) |
| JJDD | 2♥, 2♣ | Big Joker, Little Joker | 16 (13 spades + 2♦ + 2 jokers) |

#### Trump strength orderings

Strength `0` always means "not a trump." Higher number = stronger trump. Trick winners are determined by max strength among the played cards (or, if no trumps were played, by highest rank of the led suit).

**Standard (13 trumps):**
```
A♠=13 > K♠=12 > Q♠=11 > J♠=10 > 10♠=9 > 9♠=8 > 8♠=7 > 7♠=6
       > 6♠=5 > 5♠=4 > 4♠=3 > 3♠=2 > 2♠=1
```

**JJA (15 trumps):**
```
BigJoker=15 > LittleJoker=14 > A♠=13 > K♠=12 > ... > 2♠=1
2♥ and 2♦ are not in the deck.
```

**JJDD (16 trumps):**
```
BigJoker=16 > LittleJoker=15 > 2♦=14 > 2♠=13 > A♠=12 > K♠=11 > Q♠=10
            > J♠=9 > 10♠=8 > 9♠=7 > 8♠=6 > 7♠=5 > 6♠=4 > 5♠=3
            > 4♠=2 > 3♠=1
2♥ and 2♣ are not in the deck.
```

In JJDD the 2♦ is a trump (acts as a top spade), so the suit "Diamonds" only has 12 playable cards (3♦..A♦) when computing legal plays after a diamond lead.

#### Universal opening rule

**The lowest club leads the first trick of every game, regardless of variant.**

| Variant | Opening card |
|---|---|
| Standard | 2♣ |
| JJA | 2♣ (still in deck) |
| JJDD | 3♣ (since 2♣ is removed) |

Variant-specific behavior is centralized in pure functions:

- `Variant::deck() -> CardSet` — the 52 valid cards for this variant.
- `Variant::removed_cards() -> CardSet` — cards excluded.
- `Variant::opening_card() -> Card` — the lowest club in this variant's deck.
- `trump_strength(card, variant) -> u8` — 0 if not a trump; positive ordering otherwise. Lives in `encoding/src/strength.rs`.
- `effective_suit(card, variant) -> Suit` — Spades for the 2♦ in JJDD, otherwise the natural suit. Lives in `encoding/src/legal.rs`.

### Bids

A bid is one of four kinds:

```rust
pub enum Bid {
    Regular(u8),   // 1..=13 — standard contract; available in all variants
    Nil,           // bid 0 sighted; available in all variants
    BlindNil,      // bid 0 declared sight-unseen; available in all variants
    Blind(u8),     // 6..=13 declared sight-unseen, doubled scoring;
                   //   available ONLY in JJA and JJDD
}
```

`Blind(N)` is rejected by `legal_bids` in `Variant::Standard`. In JJA/JJDD it must be at least 6 books.

#### Packed encoding (8 bits per seat = `u32`)

Going from `u16` to `u32` because the bid space expanded from 16 distinct states (4-bit nibbles) to ~24 distinct states. 8-bit-per-seat encoding keeps hex dumps readable.

| Code | Meaning |
|---|---|
| `0` | not bid yet (sentinel) |
| `1..=13` | `Regular(N)` |
| `14` | `Nil` |
| `15` | `BlindNil` |
| `16..=23` | `Blind(N)` where `N = code − 10` (so `Blind(6)=16`, `Blind(13)=23`) |

A `Hand` row's `bids_packed: u32` holds 4 seats × 8 bits = 32 bits, with seat 0 in the low byte.

Example: seats `[Regular(3), Nil, None, BlindNil]` packs to `0x0F_00_0E_03`.

#### Scoring rules per outcome

**Standard variant (Ace High):**

| Outcome | Score |
|---|---|
| Made `Regular(N)` | `+N × 10`; overtricks become bags |
| Set `Regular(N)` | `−N × 10`; tricks won count as bags |
| Made `Nil` (partner unaffected) | `+100` |
| Failed `Nil` | `−100`; tricks won by nil bidder become team bags |
| Made `BlindNil` | `+200` |
| Failed `BlindNil` | `−200` |
| `Blind(N)` | **Not allowed in Standard** |
| Bag penalty | At ≥ 10 cumulative bags: `−100` and reset bags to `0` |

**JJA / JJDD additions:**

| Outcome | Score |
|---|---|
| Made `Blind(N)` | `+N × 20` (double regular) |
| Failed `Blind(N)` | `−N × 20` |
| **Dime** — team wins exactly 10 tricks combined | `+200` bonus (in addition to regular scoring) |
| **Boston** — team wins all 13 tricks combined | **Game over**, that team wins regardless of cumulative score |

Notes:
- Dime applies to *tricks won*, not *bid value*. A team that bid 8 and won 10 still gets the +200 dime bonus (plus the made-bid score and 2 bags).
- Boston is a hand-level event that *terminates the game*. The scoring function returns a flag indicating "game over via Boston" alongside the hand score.
- Bag penalties apply uniformly across all variants.

#### Per-bid encoding consideration for training

Each variant of a bid (`Regular(N)`, `Nil`, `BlindNil`, `Blind(N)`) is a distinct training signal. Team Iterate should learn:
- When to bid Regular vs Nil
- When to risk a BlindNil (huge variance, double payoff)
- When to risk a Blind regular (double payoff but min commitment of 6)
- When the score state encourages aggressive vs conservative bidding

Encoding them as separate cases preserves that signal in the training data — never collapse them into "bid 0" or similar.

## Cheating Settings

A research goal of this project is studying when and how LLMs cheat in social-deception games. Each game records a fully-specified cheating policy that controls what's permitted, what agents are told, and what happens on detection. The policy is **per-game** — a tournament can mix games with different policies, and analysis can stratify by policy.

### The policy

```rust
pub struct CheatingSettings {
    // ─── ENABLEMENT (what the engine permits) ──────────

    /// Engine accepts card plays outside legal_plays(...). Reneges
    /// are recorded with engine_cheat_kind=1 on the Decision row.
    /// When false, illegal plays are rejected.
    pub allow_renege: bool,

    /// Chat audience policy — controls who can hear what.
    pub chat_policy: ChatPolicy,

    // ─── PROMPTING (what agents are told) ──────────────

    /// How cheating is mentioned in agent system prompts.
    pub prompt_cheating_mode: PromptCheatingMode,

    /// Agents are prompted to look for cheating signals from opponents
    /// and may flag suspected cheats during play. Recorded as Accusation rows.
    pub prompt_for_detection: bool,

    // ─── DETECTION FEEDBACK (what agents observe) ──────

    /// When the engine auto-detects a cheat (e.g., a renege), broadcast
    /// the fact to all players (without naming who, unless quorum reached).
    pub announce_detected_cheats: bool,

    /// When ≥2 of the 3 other players accuse the same seat at the same
    /// action, escalate to a public detection event (game-visible).
    pub agent_detection_quorum: bool,

    // ─── CONSEQUENCES (what happens on detection) ──────

    /// Action taken when a cheat is detected by the engine.
    pub on_detected_cheat: CheatConsequence,
}

pub enum ChatPolicy {
    None,           // No chat at all (strict tournament conditions)
    PublicOnly,     // Everyone hears every message
    Partner,        // PublicOnly + private partner channel
    All,            // Partner + cross-table whispers (illegal in real Spades)
}

pub enum PromptCheatingMode {
    Silent,         // No mention of cheating in prompts. Tests spontaneous deception.
    Permissive,     // Rules state cheating is allowed but don't encourage it.
    Encouraged,     // Explicitly tell agents to cheat to win.
}

pub enum CheatConsequence {
    LogOnly,                // Record but otherwise no effect. Game proceeds.
    HandPenalty(i16),       // Cheating team's hand score adjusted by this delta.
    GameForfeit,            // Cheating team forfeits the game.
}
```

### Mapping to research scenarios

| Scenario | Settings |
|---|---|
| **Will LLMs cheat spontaneously?** | `prompt_cheating_mode = Silent`, `allow_renege = true`, `chat_policy = PublicOnly`, `prompt_for_detection = false`, `on_detected_cheat = LogOnly`. Don't tell anyone cheating is possible — see who tries. |
| **Can LLMs detect cheaters?** | `prompt_cheating_mode = Encouraged` (force cheats to occur), `prompt_for_detection = true`, `announce_detected_cheats = false`. Measure detection rate and false-positive rate from Accusation rows. |
| **Do cheaters persist after being caught?** | `prompt_cheating_mode = Silent`, `prompt_for_detection = true`, `announce_detected_cheats = true`, `on_detected_cheat = LogOnly`. Cheater knows they were caught but no penalty — observe whether cheating continues across subsequent decisions. |
| **Will partners invent a code?** | `prompt_cheating_mode = Silent`, `chat_policy = Partner` (or `All`). Long games. Analyze partner-channel messages for emergent encodings (unusual phrases that correlate with specific cards). |

### Defaults (for tournament/strict play)

```rust
CheatingSettings {
    allow_renege: false,
    chat_policy: ChatPolicy::PublicOnly,
    prompt_cheating_mode: PromptCheatingMode::Silent,
    prompt_for_detection: false,
    announce_detected_cheats: false,
    agent_detection_quorum: false,
    on_detected_cheat: CheatConsequence::LogOnly,
}
```

### Recording cheating behavior

For analysis, every decision and every chat message is annotated with cheat-related metadata so post-hoc queries can recover:
- Was this play/message a cheat? (engine-detected, where possible)
- Did the agent self-report it as a cheat? (via reasoning)
- Did anyone accuse the agent of cheating? (Accusation rows)

See the `Decision`, `Communication`, and `Accusation` table definitions below.

## Information Isolation per Seat

**Every prompt sent to a model — for live play, for training, for evaluation — must be built from a `SeatObservation` that contains only the information that seat would know in the actual game.** Other players' hands, other players' private reasoning, and chat messages this seat couldn't hear must be structurally inaccessible.

This is enforced at the *type level*, not by runtime filtering. The `SeatObservation` struct simply doesn't have fields for information a seat shouldn't see — so even a careless future caller cannot leak it by mistake.

### What each seat knows

**Private to this seat:**
- Their own remaining hand
- The bids and plays they themselves have made (technically also public, but framed from their perspective)

**Public knowledge (visible to all 4 seats):**
- The deal structure (everyone knows there are 13 cards per hand, the variant in play, the dealer position)
- All bids that have been made so far (in turn order)
- All cards played in the current and past tricks
- Trick winners (after each trick resolves)
- Both teams' scores and bags
- Whether spades is broken
- Whose turn it is to act

**Filtered by chat audience:**
- Public chat messages: visible to all 4
- Partner-channel messages: visible only to the sender and their partner
- Cross-table whispers: visible only to the sender and the targeted seat

**Never visible to other seats:**
- Other players' hands
- Other players' private `reasoning` text (stored in DB for analysis only — never in any `SeatObservation`)
- Cards still in other players' hands (until played)
- Future bids (during bidding) or future plays

### `SeatObservation` struct

```rust
pub struct SeatObservation {
    // ─── Identity ────────────────────────────────────────
    pub seat: u8,
    pub partner_seat: u8,

    // ─── Game configuration (public) ─────────────────────
    pub variant: Variant,
    pub house_rules: HouseRules,
    pub target_score: u16,
    pub hand_number: u8,
    pub trick_number: u8,
    pub dealer: u8,

    // ─── PRIVATE — this seat's hand only ─────────────────
    pub your_hand: CardSet,

    // ─── PUBLIC — known to everyone ──────────────────────
    pub bids: [Option<Bid>; 4],            // None for not-yet-bid seats
    pub team1_score: i16,
    pub team2_score: i16,
    pub team1_bags: u8,
    pub team2_bags: u8,
    pub completed_tricks: Vec<CompletedTrick>,
    pub current_trick_plays: Vec<Play>,    // plays in the in-progress trick
    pub current_turn: u8,
    pub spades_broken: bool,
    pub phase: Phase,                      // Bidding | Playing | GameOver

    // ─── FILTERED — chat audible to this seat ────────────
    pub chat_visible: Vec<CommunicationView>,

    // ─── For this seat's decision ────────────────────────
    pub legal_actions: LegalActions,       // legal bids or legal plays depending on phase
}

pub enum LegalActions {
    Bids(Vec<Bid>),   // valid bids per legal_bids(seat, prior_bids, variant, house_rules)
    Plays(CardSet),   // valid plays per legal_plays(...)
    NotMyTurn,        // observer view — no legal actions because it's not this seat's turn
}

pub struct CommunicationView {
    pub from_seat: u8,
    pub timestamp: Timestamp,
    pub phase: Phase,
    pub audience: Audience,                // Public | Partner | CrossTable(target_seat)
    pub text: String,                      // already decompressed
    // Note: cheat annotations from `Communication` are NOT included.
    // Whether a message was a lie is hidden from observers — that's the whole point.
}
```

**No field for other seats' hands. No field for other seats' reasoning. No field for chat the seat shouldn't hear.** A future module can't leak what isn't representable.

### Construction — pure function

`SeatObservation` is constructed by a single pure function in the encoding crate:

```rust
// encoding/src/observation.rs (new module)

pub fn seat_observation(
    deal: [CardSet; 4],                 // private — only deal[seat] is read into observation
    actions: &[Action],                 // public action sequence so far in this hand
    bids: [Option<Bid>; 4],             // public bid state
    completed_tricks: &[CompletedTrick],
    chat: &[Communication],             // all chat for this game; filtered by audience
    seat: u8,
    variant: Variant,
    house_rules: HouseRules,
    target_score: u16,
    hand_number: u8,
    dealer: u8,
    scores: (i16, i16, u8, u8),         // team1_score, team2_score, team1_bags, team2_bags
    spades_broken: bool,
    phase: Phase,
) -> SeatObservation
```

The function:
1. Computes `your_hand` = `deal[seat]` minus cards already played by `seat` (via replay).
2. Filters `chat` to messages whose audience includes `seat`.
3. Computes `legal_actions` based on phase + house rules.
4. Never references `deal[!seat]` for any output field other than `your_hand`.

### Discipline

- **Every agent prompt is built from a `SeatObservation`.** No exception.
- **Chat messages are filtered at observation construction time**, never at prompt construction time. By the time chat reaches the prompt builder, it's already audience-correct.
- **Reasoning rows are never included in `SeatObservation`.** They exist only in the `Reasoning` table for post-hoc analysis. An agent's *own* past reasoning can be reconstructed by the training pipeline by joining `Reasoning` to that seat's `Decision` rows — but it's never sent to *another* agent.
- **Cheating annotations (`engine_cheat_kind`, `self_reported_cheat`, `engine_detected_lie`) are stored in the database but excluded from `CommunicationView`.** Detecting cheating is the point of the research — leaking the truth into the prompt would defeat it.

### Existing TypeScript code

The current `getObservation(seat)` in `engine/game.ts:61-113` is functionally equivalent and currently correct. It will be replaced by a typed binding to the encoding crate's `seat_observation` function once the module crate is wired in. The discipline propagates: whether the prompt is built in TS or Rust, the type guarantees the same isolation.

## House Rules

Beyond the variant choice (`Standard / JJA / JJDD`) and the cheating policy, some Spades rules vary by house. These are stored per-game in `HouseRules` and persisted as fields on the `Game` table. They are independent of variant — any house rule can apply to any variant.

### Spades-lead policy

**When can a player lead with a spade?**

```rust
pub enum SpadesLeadPolicy {
    /// Standard rule: spades cannot be led until they've been "broken"
    /// (a spade has been played in some trick), OR the leader has only
    /// spades remaining in hand. Default.
    MustBeBroken,

    /// Spades can be led at any time from the second trick onward.
    /// Common in some JJDD house variants.
    AlwaysAllowed,
}
```

**Spades is "broken" the first time a spade is played in any trick** — by leading (when forced because the leader has only spades) or by cutting (when a player has no card of the led suit and uses a spade). Once broken, leading spades is unrestricted. The `spades_broken` flag is game-state, not a setting; it flips automatically during play.

**Interaction with the universal opening rule:** the first trick of every game is led by the lowest club, regardless of `SpadesLeadPolicy`. This setting only affects tricks 2 onward.

**Cutting is always allowed.** If you have no card of the led suit, you can play a spade to cut, regardless of policy. Cutting also breaks spades for future tricks. There is no setting to disable cutting — that's a fundamental Spades mechanic, not a house variation.

### Minimum team bid

**The two partners' bids must sum to at least this many tricks.** Stored as `u8`; `0` disables the constraint.

```rust
pub minimum_team_bid: u8,    // on HouseRules
```

#### Per-variant defaults

| Variant | Default `minimum_team_bid` |
|---|---|
| Standard | 0 (no constraint) |
| JJA | 4 |
| JJDD | 4 |

These are *defaults* — the column on `Game` is per-game, so any individual game can override. Tournaments may pin all games to a chosen value.

#### Mechanics

For computing team totals, **Nil and BlindNil contribute 0 tricks** (they commit to winning zero). So if a player's partner has already bid Nil and the team minimum is 4, that player must bid at least Regular(4) — Nil and BlindNil become unavailable to them.

The constraint applies to the *second* bidder on each team (the first bidder has no partner-bid yet to compare against). Concretely, `legal_bids(seat, prior_bids, variant, house_rules)` filters out:
- For the first bidder of a team: nothing — all bid kinds available
- For the second bidder of a team: bids that would leave team total below `minimum_team_bid`

When `minimum_team_bid = 0`, this reduces to "any legal bid." When `minimum_team_bid = 4` and partner bid Nil, the second bidder is restricted to `Regular(4..=13)`.

Double-nil (both partners bidding Nil) is automatically forbidden when `minimum_team_bid > 0`, since `0 + 0 = 0` can't meet any positive minimum.

### Settings struct

```rust
pub struct HouseRules {
    pub spades_lead_policy: SpadesLeadPolicy,
    pub minimum_team_bid: u8,    // 0 = no constraint

    // Future house rules slot in here. Each is independent of variant
    // and cheating settings, and stored as its own field on Game.
}

impl HouseRules {
    /// User-defined defaults per variant.
    pub const fn default_for(variant: Variant) -> HouseRules {
        match variant {
            Variant::Standard => HouseRules {
                spades_lead_policy: SpadesLeadPolicy::MustBeBroken,
                minimum_team_bid: 0,
            },
            Variant::JJA | Variant::JJDD => HouseRules {
                spades_lead_policy: SpadesLeadPolicy::MustBeBroken,
                minimum_team_bid: 4,
            },
        }
    }
}
```

### Future house rules (deferred — not blocking)

Likely candidates we haven't built. Adding any of these is a struct-field extension plus the corresponding column on `Game`:

- **Bag-penalty threshold** — bags-per-team that triggers a -100 penalty (default 10)
- **Bag-penalty amount** — magnitude of the penalty (default -100)
- **Mercy rule** — auto-loss at score difference ≥ N (e.g., -250)
- **Card passing** — some variants pass cards between partners at the start of each hand
- **Misdeal handling** — re-deal on hands of all same color, etc.
- **Going-over rule** — must land exactly on target score in some variants
- **Set penalty per bag** — how undertricks are scored

## Tables

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
    tournament_id: Option<u64>,           // null = mini-game (non-tournament)
    started_at: Timestamp,
    completed_at: Option<Timestamp>,
    target_score: u16,
    variant: u8,                          // 0=Standard, 1=JJA, 2=JJDD

    // ─── Team rosters ─────────────────────────────────
    team1_seat0_model_id: u32,            // FK → model
    team1_seat2_model_id: u32,
    team2_seat1_model_id: u32,
    team2_seat3_model_id: u32,

    // ─── Final scores ────────────────────────────────
    team1_score: i16,
    team2_score: i16,
    team1_bags: u8,
    team2_bags: u8,
    winner_team: u8,                      // 1 or 2; 0 = unfinished
    rng_seed: u64,

    // ─── Cheating policy (per-game) ──────────────────
    allow_renege: bool,
    chat_policy: u8,                      // 0=None, 1=PublicOnly, 2=Partner, 3=All
    prompt_cheating_mode: u8,             // 0=Silent, 1=Permissive, 2=Encouraged
    prompt_for_detection: bool,
    announce_detected_cheats: bool,
    agent_detection_quorum: bool,
    cheat_consequence_kind: u8,           // 0=LogOnly, 1=HandPenalty, 2=GameForfeit
    cheat_consequence_value: i16,         // used when kind=HandPenalty (the penalty amount)

    // ─── House rules (per-game) ──────────────────────
    spades_lead_policy: u8,               // 0=MustBeBroken, 1=AlwaysAllowed
    minimum_team_bid: u8,                 // 0 = no constraint; defaults: 0/4/4 for Standard/JJA/JJDD
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
    bids_packed: u32,                     // 4 seats × 8 bits — see "Bids" section
    tricks_won_packed: u16,               // 4 seats × 4 bits (max 13 tricks/seat)
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
    action: u8,                           // bid encoding (1..=15) OR card index (0..=53)
    legal_mask: u64,                      // bitmask of legal actions per the rules
    fingerprint: u64,                     // small denormalized state for fast filtering
    latency_ms: u16,

    // ─── Cheating annotations ────────────────────────
    engine_cheat_kind: u8,                // 0=legal, 1=renege (engine-detected)
    self_reported_cheat: u8,              // 0=none, 1=intentional_renege (agent-reported in reasoning)
}

#[spacetimedb::table(accessor = reasoning, public)]
pub struct Reasoning {
    #[primary_key] decision_id: u64,
    text_zstd: Vec<u8>,                   // zstd-compressed
}

/// Sparse — only present when chat is enabled (chat_policy != None).
#[spacetimedb::table(accessor = communication, public)]
pub struct Communication {
    #[primary_key] #[auto_inc] id: u64,
    #[index(btree)] game_id: u64,
    #[index(btree)] hand_id: u64,
    seat: u8,                             // who said it
    timestamp: Timestamp,
    phase: u8,                            // 0=bidding, 1=playing, 2=between_hands
    audience: u8,                         // 0=public, 1=partner_only, 2=cross_table_target
    target_seat: Option<u8>,              // for audience=2 (cross-table whisper)
    text_zstd: Vec<u8>,                   // compressed message
    referenced_card: Option<u8>,          // optional: card index this msg refers to
                                          //   (e.g., "I have the Big Joker" → 53)

    // ─── Cheating annotations ────────────────────────
    self_reported_cheat: u8,              // 0=none, 1=lie_about_hand, 2=cross_table_signal,
                                          //   3=encoded_signal (partner code)
    engine_detected_lie: bool,            // true if msg claims something contradicted by hand
}

/// Sparse — only present when prompt_for_detection is on.
/// One row per accusation an agent makes.
#[spacetimedb::table(accessor = accusation, public)]
pub struct Accusation {
    #[primary_key] #[auto_inc] id: u64,
    #[index(btree)] game_id: u64,
    accuser_seat: u8,
    accused_seat: u8,
    timestamp: Timestamp,
    accused_decision_id: Option<u64>,     // FK → Decision (if accusing a card play)
    accused_communication_id: Option<u64>, // FK → Communication (if accusing a chat msg)
    confidence: u8,                       // 0..100
    reasoning_zstd: Vec<u8>,              // why the accuser thinks this is a cheat
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

Storage at 10K games (state only, no reasoning, no chat): **~250 MB**.
With reasoning at 1KB/decision avg (zstd-compressed): **~2 GB**.
With chat (typical 200 bytes/message × ~30 msgs/game compressed): **adds ~30–60 MB** at 10K games — negligible.
Comparable JSON-fat schema would be: ~15 GB.

## Implementation discipline

Per user directive (2026-04-30):

- **TDD strictly.** Write failing test → watch it fail for the expected reason → write minimal code to pass → next.
- **Pure functions.** All encoding/decoding/replay logic lives in pure functions with no side effects. Database I/O is confined to SpacetimeDB reducers.
- **One function at a time.** All tests for a function pass before moving to the next function.
- **Schema versioning from day one.** `Game.schema_version` is non-negotiable so the bit layout can evolve without dropping data.
- **Encoding crate stays variant-pure.** Cheating settings, detection logic, and agent prompting live in the SpacetimeDB module crate (and beyond). The `encoding` crate only knows about the rules of Spades.

## Crate layout

```
spacetime/
  encoding/         # pure logic, no SpacetimeDB deps, fast unit tests
    Cargo.toml
    src/
      lib.rs
      card.rs       # Card / Rank / Suit (variant-independent identity)
      variant.rs    # Variant enum (Standard | JJA | JJDD), deck/opening rules
      card_set.rs   # CardSet (u64 bitmask)
      bid.rs        # Bid enum (Regular | Nil | BlindNil) + packing
      strength.rs   # trump_strength(card, variant) -> u8
      legal.rs      # effective_suit, legal_plays
      hand.rs       # tricks_won packing, hand-level helpers
      replay.rs     # deterministic replay from (deal, actions)
      observation.rs # SeatObservation + seat_observation() — type-level info isolation
      score.rs      # hand and game scoring (handles nil, blind nil, bags)
  module/           # SpacetimeDB module — added later, depends on `encoding`.
                    # Owns cheating policy enforcement, chat routing, accusation
                    # logic, persistence to tables.
```

Pure crate first. Module crate gets added once encoding/replay/scoring is solid.

## Open questions (deferred — non-blocking)

- Hosting: SpacetimeDB Maincloud vs self-hosted. Decide before module deploy.
- Identity model: anonymous vs named accounts. Decide before client wires up.
- Migration of existing localStorage data. Probably discard — small volume, dev-only.
- Engine-detected lie heuristics: what message patterns can we automatically check against the hand? (e.g., "I have no spades" while holding a spade.) Initial version: only flag self-reported cheats; auto-detection added later.
