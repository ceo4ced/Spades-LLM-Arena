//! Trump strength per variant.
//!
//! `trump_strength(card, variant) -> u8` returns:
//!   - `0` if the card is not a trump in this variant.
//!   - A positive integer otherwise, where higher = stronger trump.
//!
//! Used by trick-resolution logic: among the cards played in a trick, the
//! one with the highest non-zero strength wins. If all played cards have
//! strength 0 (no trumps), the winner is the highest-rank card of the led
//! suit — that's outside this module's scope.
//!
//! ## Orderings
//!
//! ### Standard (13 trumps)
//! ```text
//! A♠=13 > K♠=12 > Q♠=11 > J♠=10 > 10♠=9 > 9♠=8 > 8♠=7 > 7♠=6
//!        > 6♠=5 > 5♠=4 > 4♠=3 > 3♠=2 > 2♠=1
//! ```
//!
//! ### JJA (15 trumps)
//! ```text
//! BigJoker=15 > LittleJoker=14 > A♠=13 > K♠=12 > … > 2♠=1
//! 2♥ and 2♦ are not in the deck.
//! ```
//!
//! ### JJDD (16 trumps)
//! ```text
//! BigJoker=16 > LittleJoker=15 > 2♦=14 > 2♠=13 > A♠=12 > K♠=11 > Q♠=10
//!             > J♠=9 > 10♠=8 > 9♠=7 > 8♠=6 > 7♠=5 > 6♠=4 > 5♠=3
//!             > 4♠=2 > 3♠=1
//! 2♥ and 2♣ are not in the deck.
//! ```

use crate::card::{Card, Rank, Suit};
use crate::variant::Variant;

/// The trump strength of `card` under the given `variant`.
/// Returns `0` for non-trump cards. Higher = stronger.
pub fn trump_strength(card: Card, variant: Variant) -> u8 {
    match variant {
        Variant::Standard => standard_strength(card),
        Variant::JJA => jja_strength(card),
        Variant::JJDD => jjdd_strength(card),
    }
}

/// 13 trumps: 2♠=1 … A♠=13. Non-spades and jokers return 0.
fn standard_strength(card: Card) -> u8 {
    match (card.rank(), card.suit()) {
        // Rank::Two = 0 → strength 1; Rank::Ace = 12 → strength 13.
        (Some(r), Some(Suit::Spades)) => (r as u8) + 1,
        _ => 0,
    }
}

/// 15 trumps: spades 1..=13 (as in Standard) + LittleJoker=14, BigJoker=15.
fn jja_strength(card: Card) -> u8 {
    if card == Card::BIG_JOKER {
        return 15;
    }
    if card == Card::LITTLE_JOKER {
        return 14;
    }
    standard_strength(card)
}

/// 16 trumps: BigJoker=16, LittleJoker=15, 2♦=14, 2♠=13,
/// A♠=12 down to 3♠=1 (note: spades 3..=A use rank index directly,
/// because Rank::Three = 1 and Rank::Ace = 12).
fn jjdd_strength(card: Card) -> u8 {
    if card == Card::BIG_JOKER {
        return 16;
    }
    if card == Card::LITTLE_JOKER {
        return 15;
    }
    match (card.rank(), card.suit()) {
        (Some(Rank::Two), Some(Suit::Diamonds)) => 14,
        (Some(Rank::Two), Some(Suit::Spades)) => 13,
        // 3♠..A♠ — Rank::Three=1, ..., Rank::Ace=12
        (Some(r), Some(Suit::Spades)) => r as u8,
        _ => 0,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{Card, Rank, Suit};
    use crate::variant::Variant;

    fn card(rank: Rank, suit: Suit) -> Card { Card::new(rank, suit) }

    // ─── Standard variant ─────────────────────────────────

    #[test]
    fn standard_two_of_clubs_is_not_trump() {
        assert_eq!(trump_strength(card(Rank::Two, Suit::Clubs), Variant::Standard), 0);
    }

    #[test]
    fn standard_seven_of_diamonds_is_not_trump() {
        assert_eq!(trump_strength(card(Rank::Seven, Suit::Diamonds), Variant::Standard), 0);
    }

    #[test]
    fn standard_king_of_hearts_is_not_trump() {
        assert_eq!(trump_strength(card(Rank::King, Suit::Hearts), Variant::Standard), 0);
    }

    #[test]
    fn standard_two_of_spades_has_strength_one() {
        assert_eq!(trump_strength(card(Rank::Two, Suit::Spades), Variant::Standard), 1);
    }

    #[test]
    fn standard_three_of_spades_has_strength_two() {
        assert_eq!(trump_strength(card(Rank::Three, Suit::Spades), Variant::Standard), 2);
    }

    #[test]
    fn standard_king_of_spades_has_strength_twelve() {
        assert_eq!(trump_strength(card(Rank::King, Suit::Spades), Variant::Standard), 12);
    }

    #[test]
    fn standard_ace_of_spades_has_strength_thirteen() {
        assert_eq!(trump_strength(card(Rank::Ace, Suit::Spades), Variant::Standard), 13);
    }

    #[test]
    fn standard_little_joker_is_not_trump() {
        // Jokers aren't in the Standard deck, but the function still has to be defined for them.
        assert_eq!(trump_strength(Card::LITTLE_JOKER, Variant::Standard), 0);
    }

    #[test]
    fn standard_big_joker_is_not_trump() {
        assert_eq!(trump_strength(Card::BIG_JOKER, Variant::Standard), 0);
    }

    #[test]
    fn standard_higher_spade_always_beats_lower_spade() {
        // Walk all 13 spades by ascending rank — strength must increase by 1 each step.
        let ranks = [
            Rank::Two, Rank::Three, Rank::Four, Rank::Five, Rank::Six, Rank::Seven,
            Rank::Eight, Rank::Nine, Rank::Ten, Rank::Jack, Rank::Queen, Rank::King, Rank::Ace,
        ];
        let mut prev = 0u8;
        for &r in &ranks {
            let s = trump_strength(card(r, Suit::Spades), Variant::Standard);
            assert!(s > prev, "spade {:?} should be stronger than the previous", r);
            prev = s;
        }
    }

    // ─── JJA variant ──────────────────────────────────────

    #[test]
    fn jja_two_of_clubs_is_not_trump() {
        assert_eq!(trump_strength(card(Rank::Two, Suit::Clubs), Variant::JJA), 0);
    }

    #[test]
    fn jja_two_of_spades_has_strength_one() {
        assert_eq!(trump_strength(card(Rank::Two, Suit::Spades), Variant::JJA), 1);
    }

    #[test]
    fn jja_ace_of_spades_has_strength_thirteen() {
        assert_eq!(trump_strength(card(Rank::Ace, Suit::Spades), Variant::JJA), 13);
    }

    #[test]
    fn jja_little_joker_has_strength_fourteen() {
        assert_eq!(trump_strength(Card::LITTLE_JOKER, Variant::JJA), 14);
    }

    #[test]
    fn jja_big_joker_has_strength_fifteen() {
        assert_eq!(trump_strength(Card::BIG_JOKER, Variant::JJA), 15);
    }

    #[test]
    fn jja_big_joker_beats_little_joker() {
        let bj = trump_strength(Card::BIG_JOKER, Variant::JJA);
        let lj = trump_strength(Card::LITTLE_JOKER, Variant::JJA);
        assert!(bj > lj);
    }

    #[test]
    fn jja_little_joker_beats_ace_of_spades() {
        let lj = trump_strength(Card::LITTLE_JOKER, Variant::JJA);
        let aces = trump_strength(card(Rank::Ace, Suit::Spades), Variant::JJA);
        assert!(lj > aces);
    }

    #[test]
    fn jja_two_of_diamonds_is_not_trump() {
        // 2♦ is not in the JJA deck and not a trump.
        assert_eq!(trump_strength(card(Rank::Two, Suit::Diamonds), Variant::JJA), 0);
    }

    // ─── JJDD variant ─────────────────────────────────────

    #[test]
    fn jjdd_two_of_hearts_is_not_trump() {
        // Removed from deck, but still must return 0.
        assert_eq!(trump_strength(card(Rank::Two, Suit::Hearts), Variant::JJDD), 0);
    }

    #[test]
    fn jjdd_three_of_diamonds_is_not_trump() {
        // Only 2♦ is elevated; other diamonds remain non-trump.
        assert_eq!(trump_strength(card(Rank::Three, Suit::Diamonds), Variant::JJDD), 0);
    }

    #[test]
    fn jjdd_three_of_spades_has_strength_one() {
        // 3♠ is the lowest spade in JJDD because 2♠ is elevated.
        assert_eq!(trump_strength(card(Rank::Three, Suit::Spades), Variant::JJDD), 1);
    }

    #[test]
    fn jjdd_four_of_spades_has_strength_two() {
        assert_eq!(trump_strength(card(Rank::Four, Suit::Spades), Variant::JJDD), 2);
    }

    #[test]
    fn jjdd_king_of_spades_has_strength_eleven() {
        assert_eq!(trump_strength(card(Rank::King, Suit::Spades), Variant::JJDD), 11);
    }

    #[test]
    fn jjdd_ace_of_spades_has_strength_twelve() {
        assert_eq!(trump_strength(card(Rank::Ace, Suit::Spades), Variant::JJDD), 12);
    }

    #[test]
    fn jjdd_two_of_spades_has_strength_thirteen() {
        // Elevated above A♠.
        assert_eq!(trump_strength(card(Rank::Two, Suit::Spades), Variant::JJDD), 13);
    }

    #[test]
    fn jjdd_two_of_diamonds_has_strength_fourteen() {
        // The signature elevation: 2♦ above 2♠.
        assert_eq!(trump_strength(card(Rank::Two, Suit::Diamonds), Variant::JJDD), 14);
    }

    #[test]
    fn jjdd_little_joker_has_strength_fifteen() {
        assert_eq!(trump_strength(Card::LITTLE_JOKER, Variant::JJDD), 15);
    }

    #[test]
    fn jjdd_big_joker_has_strength_sixteen() {
        assert_eq!(trump_strength(Card::BIG_JOKER, Variant::JJDD), 16);
    }

    #[test]
    fn jjdd_big_joker_beats_everything() {
        let bj = trump_strength(Card::BIG_JOKER, Variant::JJDD);
        for &(r, s) in &[
            (Rank::Two, Suit::Spades),
            (Rank::Two, Suit::Diamonds),
            (Rank::Ace, Suit::Spades),
            (Rank::King, Suit::Spades),
        ] {
            assert!(bj > trump_strength(card(r, s), Variant::JJDD));
        }
        assert!(bj > trump_strength(Card::LITTLE_JOKER, Variant::JJDD));
    }

    #[test]
    fn jjdd_two_of_diamonds_beats_two_of_spades() {
        let two_d = trump_strength(card(Rank::Two, Suit::Diamonds), Variant::JJDD);
        let two_s = trump_strength(card(Rank::Two, Suit::Spades), Variant::JJDD);
        assert!(two_d > two_s);
    }

    #[test]
    fn jjdd_two_of_spades_beats_ace_of_spades() {
        let two_s = trump_strength(card(Rank::Two, Suit::Spades), Variant::JJDD);
        let aces = trump_strength(card(Rank::Ace, Suit::Spades), Variant::JJDD);
        assert!(two_s > aces);
    }

    #[test]
    fn jjdd_full_ordering_chain_descends_correctly() {
        // The complete top-to-bottom trump chain in JJDD.
        let chain = [
            Card::BIG_JOKER,                          // 16
            Card::LITTLE_JOKER,                       // 15
            card(Rank::Two, Suit::Diamonds),          // 14
            card(Rank::Two, Suit::Spades),            // 13
            card(Rank::Ace, Suit::Spades),            // 12
            card(Rank::King, Suit::Spades),           // 11
            card(Rank::Queen, Suit::Spades),          // 10
            card(Rank::Jack, Suit::Spades),           // 9
            card(Rank::Ten, Suit::Spades),            // 8
            card(Rank::Nine, Suit::Spades),           // 7
            card(Rank::Eight, Suit::Spades),          // 6
            card(Rank::Seven, Suit::Spades),          // 5
            card(Rank::Six, Suit::Spades),            // 4
            card(Rank::Five, Suit::Spades),           // 3
            card(Rank::Four, Suit::Spades),           // 2
            card(Rank::Three, Suit::Spades),          // 1
        ];
        let mut prev = u8::MAX;
        for &c in &chain {
            let s = trump_strength(c, Variant::JJDD);
            assert!(s > 0, "card {:?} should be a trump in JJDD", c);
            assert!(s < prev, "card {:?} should be weaker than the previous", c);
            prev = s;
        }
    }

    // ─── Cross-variant invariants ─────────────────────────

    #[test]
    fn non_spade_non_two_diamond_is_never_a_trump_in_any_variant() {
        // Any club, heart, or non-2 diamond should be 0 in every variant.
        let non_trump_samples = [
            card(Rank::Three, Suit::Clubs),
            card(Rank::Ace, Suit::Clubs),
            card(Rank::Seven, Suit::Hearts),
            card(Rank::Ace, Suit::Hearts),
            card(Rank::Three, Suit::Diamonds),
            card(Rank::Ace, Suit::Diamonds),
        ];
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            for &c in &non_trump_samples {
                assert_eq!(
                    trump_strength(c, v),
                    0,
                    "card {:?} should not be a trump in {:?}",
                    c, v
                );
            }
        }
    }

    #[test]
    fn ace_of_spades_is_a_trump_in_every_variant() {
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            assert!(
                trump_strength(card(Rank::Ace, Suit::Spades), v) > 0,
                "A♠ should be a trump in {:?}",
                v
            );
        }
    }
}
