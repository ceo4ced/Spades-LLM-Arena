//! Legality of plays and bids per Spades rules + house rules.
//!
//! This module owns three pure functions:
//!   - `effective_suit(card, variant)` — what suit a card plays as, accounting
//!     for variant-specific elevations (the 2♦ in JJDD, jokers always).
//!   - `legal_plays(...)` — the set of cards a player can legally play.
//!     [pending]
//!   - `legal_bids(...)` — the set of bids a player can legally make.
//!     [pending]
//!
//! Each function takes only what it needs; none mutate; none touch I/O.

use crate::bid::Bid;
use crate::card::{Card, Rank, Suit};
use crate::card_set::CardSet;
use crate::house_rules::{HouseRules, SpadesLeadPolicy};
use crate::variant::Variant;

/// The suit a card plays as during the current hand.
///
/// For most cards, this is just the natural printed suit. Two exceptions:
///   - **Jokers always play as Spades.** They have no natural suit
///     (`card.suit()` returns `None`), but in trick-taking they're trumps.
///   - **The 2♦ plays as Spades in JJDD only.** In Standard and JJA, the 2♦
///     plays as Diamonds (its natural suit). In JJDD, the 2♦ is the elevated
///     trump that ranks just below the Little Joker — see `strength.rs`.
pub fn effective_suit(card: Card, variant: Variant) -> Suit {
    if card.is_joker() {
        return Suit::Spades;
    }

    let natural = card.suit().expect("non-joker cards always have a natural suit");

    if variant == Variant::JJDD
        && matches!(card.rank(), Some(Rank::Two))
        && natural == Suit::Diamonds
    {
        return Suit::Spades;
    }

    natural
}

/// The set of cards a player can legally play given the current trick state.
///
/// Parameters:
/// - `hand`: the player's remaining cards
/// - `led_suit`: `None` if this player is leading; `Some(suit)` if following.
///   This is the *effective* suit of the led card (use `effective_suit` to compute).
/// - `is_first_trick_of_hand`: forces the universal opening rule (lowest club leads)
/// - `spades_broken`: whether a spade has already been played in this hand
/// - `variant`: the Spades variant in play
/// - `house_rules`: house-specific overrides (e.g., `SpadesLeadPolicy::AlwaysAllowed`)
///
/// Returns a `CardSet` that is always a subset of `hand`. An empty result means
/// the player has no legal plays — typically because their hand is empty.
pub fn legal_plays(
    hand: CardSet,
    led_suit: Option<Suit>,
    is_first_trick_of_hand: bool,
    spades_broken: bool,
    variant: Variant,
    house_rules: HouseRules,
) -> CardSet {
    if hand.is_empty() {
        return CardSet::empty();
    }

    match led_suit {
        // ─── Leading the trick ──────────────────────────
        None => {
            // Universal opening rule: first trick of every hand is led with
            // the lowest club. This applies regardless of SpadesLeadPolicy.
            if is_first_trick_of_hand {
                let opening = variant.opening_card();
                if hand.contains(opening) {
                    return CardSet::single(opening);
                }
                // Engine bug: a player without the opening card shouldn't be
                // selected as the first-trick leader. Return the full hand
                // defensively so the function is total.
                return hand;
            }

            // Non-first trick. Spade-leading depends on policy + game state.
            let lead_spades_allowed = match house_rules.spades_lead_policy {
                SpadesLeadPolicy::AlwaysAllowed => true,
                SpadesLeadPolicy::MustBeBroken => spades_broken,
            };

            if lead_spades_allowed {
                return hand;
            }

            // Cannot lead spades. "Spades" here means *effective* spades —
            // includes jokers and (in JJDD) the 2♦.
            let effective_spades_in_hand = cards_with_effective_suit(hand, Suit::Spades, variant);
            let non_spades = hand.difference(effective_spades_in_hand);
            if non_spades.is_empty() {
                // Only-spades exception — must lead a spade.
                return hand;
            }
            non_spades
        }

        // ─── Following ──────────────────────────────────
        Some(led) => {
            let must_follow = cards_with_effective_suit(hand, led, variant);
            if !must_follow.is_empty() {
                return must_follow;
            }
            // Out of led suit — can play anything (including spades to cut).
            hand
        }
    }
}

/// Subset of `hand` whose effective suit equals `suit`, accounting for
/// variant-specific reinterpretations:
///   - In joker variants, jokers count as Spades.
///   - In JJDD, the 2♦ counts as a Spade (and does NOT count as a Diamond).
fn cards_with_effective_suit(hand: CardSet, suit: Suit, variant: Variant) -> CardSet {
    let mut result = hand.cards_of_suit(suit);

    if matches!(suit, Suit::Spades) {
        if variant.uses_jokers() {
            if hand.contains(Card::LITTLE_JOKER) {
                result = result.insert(Card::LITTLE_JOKER);
            }
            if hand.contains(Card::BIG_JOKER) {
                result = result.insert(Card::BIG_JOKER);
            }
        }
        if variant.has_high_twos() {
            let two_d = Card::new(Rank::Two, Suit::Diamonds);
            if hand.contains(two_d) {
                result = result.insert(two_d);
            }
        }
    } else if matches!(suit, Suit::Diamonds) && variant.has_high_twos() {
        // The 2♦ is an effective Spade in JJDD — remove it from "follows diamonds."
        let two_d = Card::new(Rank::Two, Suit::Diamonds);
        result = result.remove(two_d);
    }

    result
}

/// The set of bids a player can legally make at this point in the bidding phase.
///
/// Returned in canonical order:
///   - `Regular(1)`, ..., `Regular(13)`, `Nil`, `BlindNil` — always
///   - `Blind(6)`, ..., `Blind(13)` — only in JJA / JJDD
///
/// Parameters:
/// - `seat`: who's bidding now (0..=3)
/// - `prior_bids`: bids made so far, indexed by seat. `None` for not-yet-bid seats.
///   The bidder's own slot may be `None`; their partner's slot is what matters here.
/// - `variant`: gates whether `Blind(N)` regular bids are available.
/// - `house_rules`: provides `minimum_team_bid` constraint.
///
/// The minimum-team-bid constraint applies only when the bidder's partner has
/// *already* bid. The bidder's allowed bids are filtered to those that, combined
/// with the partner's committed tricks, sum to at least `house_rules.minimum_team_bid`.
///
/// `Nil` and `BlindNil` contribute zero tricks for the constraint computation, so
/// they're typically excluded once the team must reach a non-trivial minimum.
/// `Regular(N)` and `Blind(N)` contribute their full N value.
pub fn legal_bids(
    seat: u8,
    prior_bids: [Option<Bid>; 4],
    variant: Variant,
    house_rules: HouseRules,
) -> Vec<Bid> {
    let base_set = full_bid_set(variant);

    let partner_seat = ((seat + 2) % 4) as usize;
    let required_min = match prior_bids[partner_seat] {
        None => 0,
        Some(b) => house_rules
            .minimum_team_bid
            .saturating_sub(b.tricks_committed()),
    };

    if required_min == 0 {
        return base_set;
    }

    base_set
        .into_iter()
        .filter(|b| b.tricks_committed() >= required_min)
        .collect()
}

/// The full base set of legal bids for this variant.
///
/// `Regular(1..=13)`, then `Nil`, then `BlindNil` — for all variants.
/// `Blind(6..=13)` appended for JJA / JJDD only.
fn full_bid_set(variant: Variant) -> Vec<Bid> {
    let mut result = Vec::with_capacity(23);
    for n in 1..=13u8 {
        result.push(Bid::Regular(n));
    }
    result.push(Bid::Nil);
    result.push(Bid::BlindNil);

    if matches!(variant, Variant::JJA | Variant::JJDD) {
        for n in 6..=13u8 {
            result.push(Bid::Blind(n));
        }
    }

    result
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card_set::CardSet;
    use crate::house_rules::{HouseRules, SpadesLeadPolicy};

    fn card(rank: Rank, suit: Suit) -> Card {
        Card::new(rank, suit)
    }

    fn hand_of(cards: &[Card]) -> CardSet {
        cards.iter().fold(CardSet::empty(), |cs, &c| cs.insert(c))
    }

    fn must_be_broken(min_team_bid: u8) -> HouseRules {
        HouseRules {
            spades_lead_policy: SpadesLeadPolicy::MustBeBroken,
            minimum_team_bid: min_team_bid,
        }
    }

    fn always_allowed(min_team_bid: u8) -> HouseRules {
        HouseRules {
            spades_lead_policy: SpadesLeadPolicy::AlwaysAllowed,
            minimum_team_bid: min_team_bid,
        }
    }

    // ─── Standard variant — always natural suit ──────────

    #[test]
    fn standard_two_of_clubs_is_clubs() {
        assert_eq!(effective_suit(card(Rank::Two, Suit::Clubs), Variant::Standard), Suit::Clubs);
    }

    #[test]
    fn standard_seven_of_diamonds_is_diamonds() {
        assert_eq!(effective_suit(card(Rank::Seven, Suit::Diamonds), Variant::Standard), Suit::Diamonds);
    }

    #[test]
    fn standard_two_of_diamonds_is_diamonds() {
        // Standard does not elevate the 2♦ — it plays as a regular diamond.
        assert_eq!(effective_suit(card(Rank::Two, Suit::Diamonds), Variant::Standard), Suit::Diamonds);
    }

    #[test]
    fn standard_king_of_hearts_is_hearts() {
        assert_eq!(effective_suit(card(Rank::King, Suit::Hearts), Variant::Standard), Suit::Hearts);
    }

    #[test]
    fn standard_ace_of_spades_is_spades() {
        assert_eq!(effective_suit(card(Rank::Ace, Suit::Spades), Variant::Standard), Suit::Spades);
    }

    // ─── JJA variant — natural suit; jokers as spades ────

    #[test]
    fn jja_two_of_clubs_is_clubs() {
        assert_eq!(effective_suit(card(Rank::Two, Suit::Clubs), Variant::JJA), Suit::Clubs);
    }

    #[test]
    fn jja_two_of_diamonds_is_diamonds_defensively() {
        // 2♦ is removed from the JJA deck; if the function is called on it
        // (e.g., from legacy data), it should still return its natural suit.
        assert_eq!(effective_suit(card(Rank::Two, Suit::Diamonds), Variant::JJA), Suit::Diamonds);
    }

    #[test]
    fn jja_little_joker_plays_as_spades() {
        assert_eq!(effective_suit(Card::LITTLE_JOKER, Variant::JJA), Suit::Spades);
    }

    #[test]
    fn jja_big_joker_plays_as_spades() {
        assert_eq!(effective_suit(Card::BIG_JOKER, Variant::JJA), Suit::Spades);
    }

    // ─── JJDD variant — 2♦ elevated to Spades; jokers as spades ──

    #[test]
    fn jjdd_two_of_diamonds_plays_as_spades() {
        // The signature elevation: 2♦ becomes a spade in JJDD.
        assert_eq!(effective_suit(card(Rank::Two, Suit::Diamonds), Variant::JJDD), Suit::Spades);
    }

    #[test]
    fn jjdd_three_of_diamonds_is_still_diamonds() {
        // Only the 2♦ is elevated in JJDD; other diamonds keep their natural suit.
        assert_eq!(effective_suit(card(Rank::Three, Suit::Diamonds), Variant::JJDD), Suit::Diamonds);
    }

    #[test]
    fn jjdd_ace_of_diamonds_is_still_diamonds() {
        assert_eq!(effective_suit(card(Rank::Ace, Suit::Diamonds), Variant::JJDD), Suit::Diamonds);
    }

    #[test]
    fn jjdd_two_of_spades_is_spades() {
        // Already a spade — no special handling, just the natural suit.
        assert_eq!(effective_suit(card(Rank::Two, Suit::Spades), Variant::JJDD), Suit::Spades);
    }

    #[test]
    fn jjdd_little_joker_plays_as_spades() {
        assert_eq!(effective_suit(Card::LITTLE_JOKER, Variant::JJDD), Suit::Spades);
    }

    #[test]
    fn jjdd_big_joker_plays_as_spades() {
        assert_eq!(effective_suit(Card::BIG_JOKER, Variant::JJDD), Suit::Spades);
    }

    // ─── Defensive: jokers in Standard ───────────────────

    #[test]
    fn standard_little_joker_plays_as_spades_defensively() {
        // Jokers aren't in the Standard deck, but the function still must
        // return a definitive answer for them.
        assert_eq!(effective_suit(Card::LITTLE_JOKER, Variant::Standard), Suit::Spades);
    }

    #[test]
    fn standard_big_joker_plays_as_spades_defensively() {
        assert_eq!(effective_suit(Card::BIG_JOKER, Variant::Standard), Suit::Spades);
    }

    // ─── Cross-variant invariants ────────────────────────

    #[test]
    fn natural_spades_are_always_spades_in_every_variant() {
        let spade_ranks = [Rank::Two, Rank::Five, Rank::Jack, Rank::Ace];
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            for &r in &spade_ranks {
                assert_eq!(
                    effective_suit(card(r, Suit::Spades), v),
                    Suit::Spades,
                    "{:?} of Spades should play as Spades in {:?}",
                    r, v
                );
            }
        }
    }

    #[test]
    fn jokers_play_as_spades_in_every_variant() {
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            assert_eq!(effective_suit(Card::LITTLE_JOKER, v), Suit::Spades);
            assert_eq!(effective_suit(Card::BIG_JOKER, v), Suit::Spades);
        }
    }

    // ─── legal_plays — Group 1: Leading first trick of hand ──

    #[test]
    fn first_trick_with_two_of_clubs_must_play_only_two_of_clubs_in_standard() {
        let hand = hand_of(&[
            card(Rank::Two, Suit::Clubs),
            card(Rank::Five, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, None, true, false, Variant::Standard, must_be_broken(0));
        assert_eq!(result, CardSet::single(card(Rank::Two, Suit::Clubs)));
    }

    #[test]
    fn first_trick_with_two_of_clubs_must_play_only_two_of_clubs_in_jja() {
        let hand = hand_of(&[
            card(Rank::Two, Suit::Clubs),
            card(Rank::Five, Suit::Hearts),
            Card::BIG_JOKER,
        ]);
        let result = legal_plays(hand, None, true, false, Variant::JJA, must_be_broken(4));
        assert_eq!(result, CardSet::single(card(Rank::Two, Suit::Clubs)));
    }

    #[test]
    fn first_trick_with_three_of_clubs_must_play_only_three_of_clubs_in_jjdd() {
        // JJDD removes 2♣, so the opening card is 3♣.
        let hand = hand_of(&[
            card(Rank::Three, Suit::Clubs),
            card(Rank::Five, Suit::Hearts),
            Card::BIG_JOKER,
        ]);
        let result = legal_plays(hand, None, true, false, Variant::JJDD, must_be_broken(4));
        assert_eq!(result, CardSet::single(card(Rank::Three, Suit::Clubs)));
    }

    #[test]
    fn first_trick_without_opening_card_returns_full_hand_defensively() {
        // The engine should never let a player without the opening card lead
        // the first trick — but if it happens, the function shouldn't crash.
        let hand = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, None, true, false, Variant::Standard, must_be_broken(0));
        assert_eq!(result, hand);
    }

    #[test]
    fn first_trick_rule_overrides_always_allowed_policy() {
        // Even with AlwaysAllowed, the universal opening rule still applies.
        let hand = hand_of(&[
            card(Rank::Two, Suit::Clubs),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, None, true, false, Variant::Standard, always_allowed(0));
        assert_eq!(result, CardSet::single(card(Rank::Two, Suit::Clubs)));
    }

    // ─── legal_plays — Group 2: Leading non-first trick, spades broken ──

    #[test]
    fn leading_after_spades_broken_returns_full_hand() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
            card(Rank::Three, Suit::Clubs),
        ]);
        let result = legal_plays(hand, None, false, true, Variant::Standard, must_be_broken(0));
        assert_eq!(result, hand);
    }

    #[test]
    fn leading_with_always_allowed_policy_returns_full_hand_even_when_unbroken() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, None, false, false, Variant::JJDD, always_allowed(0));
        assert_eq!(result, hand);
    }

    // ─── legal_plays — Group 3: Leading non-first trick, spades not broken ──

    #[test]
    fn leading_when_spades_not_broken_excludes_natural_spades_in_standard() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Three, Suit::Clubs),
            card(Rank::Ace, Suit::Spades),
            card(Rank::King, Suit::Spades),
        ]);
        let result = legal_plays(hand, None, false, false, Variant::Standard, must_be_broken(0));
        let expected = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Three, Suit::Clubs),
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn leading_when_spades_not_broken_in_jja_excludes_jokers() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Three, Suit::Clubs),
            Card::BIG_JOKER,
            Card::LITTLE_JOKER,
        ]);
        let result = legal_plays(hand, None, false, false, Variant::JJA, must_be_broken(4));
        let expected = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Three, Suit::Clubs),
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn leading_when_spades_not_broken_in_jjdd_excludes_two_of_diamonds() {
        // 2♦ is an effective spade in JJDD, so it can't lead either.
        let hand = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Three, Suit::Clubs),
            card(Rank::Two, Suit::Diamonds),
        ]);
        let result = legal_plays(hand, None, false, false, Variant::JJDD, must_be_broken(4));
        let expected = hand_of(&[
            card(Rank::Five, Suit::Hearts),
            card(Rank::Three, Suit::Clubs),
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn leading_when_spades_not_broken_with_only_natural_spades_returns_hand() {
        let hand = hand_of(&[
            card(Rank::Two, Suit::Spades),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, None, false, false, Variant::Standard, must_be_broken(0));
        assert_eq!(result, hand);
    }

    #[test]
    fn leading_when_spades_not_broken_in_jja_with_only_jokers_returns_hand() {
        // Jokers are effective spades — if hand has only jokers, you must lead one.
        let hand = hand_of(&[Card::BIG_JOKER, Card::LITTLE_JOKER]);
        let result = legal_plays(hand, None, false, false, Variant::JJA, must_be_broken(4));
        assert_eq!(result, hand);
    }

    #[test]
    fn leading_when_spades_not_broken_in_jjdd_with_only_two_of_diamonds_returns_hand() {
        let hand = hand_of(&[card(Rank::Two, Suit::Diamonds)]);
        let result = legal_plays(hand, None, false, false, Variant::JJDD, must_be_broken(4));
        assert_eq!(result, hand);
    }

    // ─── legal_plays — Group 4: Following — has cards of led suit ──

    #[test]
    fn following_diamonds_returns_only_diamonds_in_hand_standard() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Diamonds),
            card(Rank::Three, Suit::Diamonds),
            card(Rank::King, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, Some(Suit::Diamonds), false, true, Variant::Standard, must_be_broken(0));
        let expected = hand_of(&[
            card(Rank::Five, Suit::Diamonds),
            card(Rank::Three, Suit::Diamonds),
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn following_clubs_returns_only_clubs_regardless_of_variant() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Clubs),
            card(Rank::King, Suit::Hearts),
            Card::BIG_JOKER,
        ]);
        let result = legal_plays(hand, Some(Suit::Clubs), false, true, Variant::JJA, must_be_broken(4));
        assert_eq!(result, CardSet::single(card(Rank::Five, Suit::Clubs)));
    }

    #[test]
    fn following_spades_in_standard_returns_only_natural_spades() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Spades),
            card(Rank::King, Suit::Spades),
            card(Rank::Ace, Suit::Hearts),
        ]);
        let result = legal_plays(hand, Some(Suit::Spades), false, true, Variant::Standard, must_be_broken(0));
        let expected = hand_of(&[
            card(Rank::Five, Suit::Spades),
            card(Rank::King, Suit::Spades),
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn following_spades_in_jja_includes_jokers() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Spades),
            Card::BIG_JOKER,
            Card::LITTLE_JOKER,
            card(Rank::Ace, Suit::Hearts),
        ]);
        let result = legal_plays(hand, Some(Suit::Spades), false, true, Variant::JJA, must_be_broken(4));
        let expected = hand_of(&[
            card(Rank::Five, Suit::Spades),
            Card::BIG_JOKER,
            Card::LITTLE_JOKER,
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn following_spades_in_jjdd_includes_jokers_and_two_of_diamonds() {
        let hand = hand_of(&[
            card(Rank::King, Suit::Spades),
            card(Rank::Two, Suit::Diamonds),
            Card::BIG_JOKER,
            card(Rank::Ace, Suit::Hearts),
        ]);
        let result = legal_plays(hand, Some(Suit::Spades), false, true, Variant::JJDD, must_be_broken(4));
        let expected = hand_of(&[
            card(Rank::King, Suit::Spades),
            card(Rank::Two, Suit::Diamonds),
            Card::BIG_JOKER,
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn following_diamonds_in_jjdd_excludes_two_of_diamonds() {
        // 2♦ is an effective spade — does not satisfy "follow diamonds."
        let hand = hand_of(&[
            card(Rank::Two, Suit::Diamonds),
            card(Rank::Five, Suit::Diamonds),
            card(Rank::King, Suit::Spades),
        ]);
        let result = legal_plays(hand, Some(Suit::Diamonds), false, true, Variant::JJDD, must_be_broken(4));
        assert_eq!(result, CardSet::single(card(Rank::Five, Suit::Diamonds)));
    }

    // ─── legal_plays — Group 5: Following — no cards of led suit (cutting) ──

    #[test]
    fn following_diamonds_with_no_diamonds_returns_full_hand() {
        let hand = hand_of(&[
            card(Rank::King, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
            card(Rank::Three, Suit::Clubs),
        ]);
        let result = legal_plays(hand, Some(Suit::Diamonds), false, true, Variant::Standard, must_be_broken(0));
        assert_eq!(result, hand);
    }

    #[test]
    fn following_hearts_with_only_clubs_and_spades_returns_full_hand() {
        let hand = hand_of(&[
            card(Rank::Three, Suit::Clubs),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, Some(Suit::Hearts), false, false, Variant::Standard, must_be_broken(0));
        assert_eq!(result, hand);
    }

    // ─── legal_plays — Group 6: JJDD-specific 2♦ behavior ──

    #[test]
    fn jjdd_following_diamonds_with_only_two_of_diamonds_returns_full_hand() {
        // 2♦ doesn't follow diamonds, so this player has effectively no diamonds.
        let hand = hand_of(&[
            card(Rank::Two, Suit::Diamonds),
            card(Rank::King, Suit::Spades),
            card(Rank::Three, Suit::Clubs),
        ]);
        let result = legal_plays(hand, Some(Suit::Diamonds), false, true, Variant::JJDD, must_be_broken(4));
        assert_eq!(result, hand);
    }

    // ─── legal_plays — Group 7: Joker-specific behavior ──

    #[test]
    fn jja_following_spades_with_only_jokers_returns_jokers() {
        let hand = hand_of(&[
            Card::LITTLE_JOKER,
            Card::BIG_JOKER,
            card(Rank::Five, Suit::Hearts),
        ]);
        let result = legal_plays(hand, Some(Suit::Spades), false, true, Variant::JJA, must_be_broken(4));
        let expected = hand_of(&[Card::LITTLE_JOKER, Card::BIG_JOKER]);
        assert_eq!(result, expected);
    }

    #[test]
    fn following_hearts_with_jokers_in_hand_returns_full_hand() {
        // Jokers don't follow hearts; player has no hearts; can play anything.
        let hand = hand_of(&[
            Card::BIG_JOKER,
            card(Rank::Three, Suit::Clubs),
        ]);
        let result = legal_plays(hand, Some(Suit::Hearts), false, true, Variant::JJA, must_be_broken(4));
        assert_eq!(result, hand);
    }

    // ─── legal_plays — Group 8: Edge cases ──

    #[test]
    fn empty_hand_leading_returns_empty_set() {
        let hand = CardSet::empty();
        let result = legal_plays(hand, None, false, true, Variant::Standard, must_be_broken(0));
        assert!(result.is_empty());
    }

    #[test]
    fn empty_hand_following_returns_empty_set() {
        let hand = CardSet::empty();
        let result = legal_plays(hand, Some(Suit::Diamonds), false, true, Variant::Standard, must_be_broken(0));
        assert!(result.is_empty());
    }

    #[test]
    fn following_when_only_holding_one_card_of_led_suit_returns_singleton() {
        let hand = hand_of(&[
            card(Rank::Five, Suit::Diamonds),
            card(Rank::King, Suit::Hearts),
            card(Rank::Ace, Suit::Spades),
        ]);
        let result = legal_plays(hand, Some(Suit::Diamonds), false, true, Variant::Standard, must_be_broken(0));
        assert_eq!(result, CardSet::single(card(Rank::Five, Suit::Diamonds)));
    }

    // ─── legal_bids — Group 1: No constraint ──

    use crate::bid::Bid;

    #[test]
    fn legal_bids_with_zero_minimum_returns_full_set_of_fifteen_bids() {
        let result = legal_bids(0, [None, None, None, None], Variant::Standard, must_be_broken(0));
        assert_eq!(result.len(), 15);
        for n in 1..=13u8 {
            assert!(result.contains(&Bid::Regular(n)), "missing Regular({})", n);
        }
        assert!(result.contains(&Bid::Nil));
        assert!(result.contains(&Bid::BlindNil));
    }

    #[test]
    fn legal_bids_returns_bids_in_canonical_order() {
        let result = legal_bids(0, [None, None, None, None], Variant::Standard, must_be_broken(0));
        let mut expected: Vec<Bid> = (1..=13u8).map(Bid::Regular).collect();
        expected.push(Bid::Nil);
        expected.push(Bid::BlindNil);
        assert_eq!(result, expected);
    }

    // ─── legal_bids — Group 2: First-bidder-of-team has no constraint ──

    #[test]
    fn first_bidder_of_team_has_no_constraint_even_with_minimum_four() {
        // Seat 0 bids first; partner (seat 2) hasn't bid yet.
        // JJA → 23 bids total (15 base + 8 Blind options).
        let result = legal_bids(0, [None, None, None, None], Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 23);
    }

    // ─── legal_bids — Group 3: Partner alone has met the minimum ──

    #[test]
    fn partner_bid_thirteen_means_no_constraint_remaining() {
        let prior = [None, None, Some(Bid::Regular(13)), None];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        // JJA → full set of 23 (15 base + 8 Blind).
        assert_eq!(result.len(), 23);
        assert!(result.contains(&Bid::Nil));
    }

    #[test]
    fn partner_bid_four_meets_minimum_exactly_no_filter() {
        let prior = [None, None, Some(Bid::Regular(4)), None];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 23);
    }

    // ─── legal_bids — Group 4: Partner short of minimum ──

    #[test]
    fn partner_bid_three_with_minimum_four_requires_at_least_one_trick() {
        // 4 - 3 = 1. Nil/BlindNil contribute 0 → excluded.
        // In JJA: Regular(1..=13) = 13 + Blind(6..=13) = 8 → 21 bids.
        let prior = [None, None, Some(Bid::Regular(3)), None];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 21);
        assert!(!result.contains(&Bid::Nil));
        assert!(!result.contains(&Bid::BlindNil));
        assert!(result.contains(&Bid::Regular(1)));
        assert!(result.contains(&Bid::Regular(13)));
        assert!(result.contains(&Bid::Blind(6)));
    }

    #[test]
    fn partner_bid_one_with_minimum_four_requires_at_least_three_tricks() {
        // In JJA: Regular(3..=13) = 11 + Blind(6..=13) = 8 → 19 bids.
        let prior = [None, None, Some(Bid::Regular(1)), None];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 19);
        assert!(!result.contains(&Bid::Regular(2)));
        assert!(result.contains(&Bid::Regular(3)));
        assert!(result.contains(&Bid::Blind(6)));
    }

    #[test]
    fn partner_bid_nil_with_minimum_four_requires_at_least_four_tricks() {
        // In JJA: Regular(4..=13) = 10 + Blind(6..=13) = 8 → 18 bids.
        let prior = [None, None, Some(Bid::Nil), None];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 18);
        assert!(!result.contains(&Bid::Regular(3)));
        assert!(result.contains(&Bid::Regular(4)));
        assert!(!result.contains(&Bid::Nil));
        assert!(!result.contains(&Bid::BlindNil));
        assert!(result.contains(&Bid::Blind(6)));
    }

    #[test]
    fn partner_bid_blind_nil_treated_same_as_nil_for_minimum() {
        // In JJDD: Regular(4..=13) = 10 + Blind(6..=13) = 8 → 18 bids.
        let prior = [None, None, Some(Bid::BlindNil), None];
        let result = legal_bids(0, prior, Variant::JJDD, must_be_broken(4));
        assert_eq!(result.len(), 18);
        assert!(!result.contains(&Bid::Nil));
    }

    // ─── legal_bids — Group 5: Double-nil rule ──

    #[test]
    fn double_nil_forbidden_when_minimum_is_positive() {
        let prior = [None, None, Some(Bid::Nil), None];
        let result = legal_bids(0, prior, Variant::JJDD, must_be_broken(4));
        assert!(!result.contains(&Bid::Nil));
        assert!(!result.contains(&Bid::BlindNil));
    }

    #[test]
    fn double_nil_allowed_when_minimum_is_zero() {
        let prior = [None, None, Some(Bid::Nil), None];
        let result = legal_bids(0, prior, Variant::Standard, must_be_broken(0));
        assert!(result.contains(&Bid::Nil));
        assert!(result.contains(&Bid::BlindNil));
    }

    // ─── legal_bids — Group 6: Partner-seat lookup ──

    #[test]
    fn seat_zero_uses_seat_two_as_partner_not_opponents() {
        // Opponents bid; partner has not — no constraint regardless of opponents.
        let prior = [None, Some(Bid::Regular(5)), None, Some(Bid::Regular(3))];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 23);
    }

    #[test]
    fn seat_two_uses_seat_zero_as_partner() {
        // Partner (seat 0) bid Nil → required_min = 4
        // JJA: Regular(4..=13) = 10 + Blind(6..=13) = 8 → 18.
        let prior = [Some(Bid::Nil), None, None, Some(Bid::Regular(5))];
        let result = legal_bids(2, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 18);
    }

    #[test]
    fn seat_one_uses_seat_three_as_partner() {
        // Partner (seat 3) bid 2 → required_min = 4 - 2 = 2
        // JJA: Regular(2..=13) = 12 + Blind(6..=13) = 8 → 20.
        let prior = [None, None, None, Some(Bid::Regular(2))];
        let result = legal_bids(1, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 20);
        assert!(!result.contains(&Bid::Nil));
        assert!(!result.contains(&Bid::Regular(1)));
        assert!(result.contains(&Bid::Regular(2)));
        assert!(result.contains(&Bid::Blind(6)));
    }

    #[test]
    fn seat_three_uses_seat_one_as_partner() {
        // Partner bid 7 → exceeds min of 4 → no constraint
        let prior = [None, Some(Bid::Regular(7)), None, None];
        let result = legal_bids(3, prior, Variant::JJA, must_be_broken(4));
        assert_eq!(result.len(), 23);
    }

    // ─── legal_bids — Group 7: Edge case ──

    #[test]
    fn impossible_minimum_yields_empty_set() {
        // Partner Nil + min=100 → required_min=100. Max bid is 13. No legal bids.
        let house = HouseRules {
            spades_lead_policy: SpadesLeadPolicy::MustBeBroken,
            minimum_team_bid: 100,
        };
        let prior = [None, None, Some(Bid::Nil), None];
        let result = legal_bids(0, prior, Variant::JJA, house);
        assert!(result.is_empty());
    }

    // ─── legal_bids — Blind variant gating ──

    #[test]
    fn standard_variant_does_not_offer_blind_regular_bids() {
        let result = legal_bids(0, [None, None, None, None], Variant::Standard, must_be_broken(0));
        assert_eq!(result.len(), 15); // Regular(1..=13) + Nil + BlindNil — no Blind.
        for n in 6..=13u8 {
            assert!(!result.contains(&Bid::Blind(n)), "Blind({}) should not be available in Standard", n);
        }
    }

    #[test]
    fn jja_variant_offers_blind_regular_bids_six_through_thirteen() {
        let result = legal_bids(0, [None, None, None, None], Variant::JJA, must_be_broken(0));
        assert_eq!(result.len(), 23);
        for n in 6..=13u8 {
            assert!(result.contains(&Bid::Blind(n)), "Blind({}) should be available in JJA", n);
        }
        // No Blind below 6.
        for n in 1..=5u8 {
            assert!(!result.contains(&Bid::Blind(n)), "Blind({}) should never appear", n);
        }
    }

    #[test]
    fn jjdd_variant_offers_blind_regular_bids_six_through_thirteen() {
        let result = legal_bids(0, [None, None, None, None], Variant::JJDD, must_be_broken(0));
        assert_eq!(result.len(), 23);
        for n in 6..=13u8 {
            assert!(result.contains(&Bid::Blind(n)));
        }
    }

    #[test]
    fn legal_bids_canonical_order_in_jja_appends_blind_after_blind_nil() {
        let result = legal_bids(0, [None, None, None, None], Variant::JJA, must_be_broken(0));
        let mut expected: Vec<Bid> = (1..=13u8).map(Bid::Regular).collect();
        expected.push(Bid::Nil);
        expected.push(Bid::BlindNil);
        for n in 6..=13u8 {
            expected.push(Bid::Blind(n));
        }
        assert_eq!(result, expected);
    }

    #[test]
    fn blind_six_satisfies_minimum_of_four_team_bid() {
        // Partner bid Nil → required_min = 4. Blind(6) commits 6 ≥ 4 → included.
        let prior = [None, None, Some(Bid::Nil), None];
        let result = legal_bids(0, prior, Variant::JJA, must_be_broken(4));
        assert!(result.contains(&Bid::Blind(6)));
    }
}
