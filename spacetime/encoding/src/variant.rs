//! The Spades rules variant in effect for a given game.
//!
//! Three variants. **Every variant always has 52 cards.** Adding jokers means
//! removing two standard cards to keep the count constant.
//!
//!   - **Standard**: 52 standard cards. A♠ is the highest spade.
//!   - **JJA** (Jokers + Ace high): 50 standard cards (2♥ and 2♦ removed)
//!     plus Big Joker and Little Joker. Trump order:
//!     BigJoker > LittleJoker > A♠ > K♠ > … > 2♠.
//!   - **JJDD** (Jokers + Deuce-Deuce): 50 standard cards (2♥ and 2♣ removed)
//!     plus Big Joker and Little Joker. Trump order:
//!     BigJoker > LittleJoker > 2♦ > 2♠ > A♠ > K♠ > … > 3♠.
//!     The 2♦ plays as a spade.
//!
//! Variant-specific behavior lives in pure functions:
//!   - `Variant::deck()` — the 52 cards in this variant's deck (CardSet)
//!   - `Variant::removed_cards()` — cards excluded from this variant
//!   - `Variant::opening_card()` — the lowest club; leads the first trick
//!   - Trump strength → `strength.rs`
//!   - Effective suit + legal plays → `legal.rs`
//!
//! Persisted as a `u8` on the `Game` table:
//!   0 = Standard, 1 = JJA, 2 = JJDD.
//!   These codes are stable — adding a new variant assigns the next code.

use crate::card::{Card, Rank, Suit};
use crate::card_set::CardSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Variant {
    Standard,
    JJA,
    JJDD,
}

impl Variant {
    /// Every variant has exactly 52 cards. This method exists for clarity at
    /// call sites and future-proofing if we ever add a non-52-card variant.
    pub const fn card_count(self) -> u8 {
        52
    }

    pub const fn uses_jokers(self) -> bool {
        matches!(self, Variant::JJA | Variant::JJDD)
    }

    /// Whether the 2♦ is elevated above the A♠ as a top trump (currently only JJDD).
    pub const fn has_high_twos(self) -> bool {
        matches!(self, Variant::JJDD)
    }

    pub const fn to_u8(self) -> u8 {
        match self {
            Variant::Standard => 0,
            Variant::JJA => 1,
            Variant::JJDD => 2,
        }
    }

    pub const fn from_u8(code: u8) -> Option<Variant> {
        match code {
            0 => Some(Variant::Standard),
            1 => Some(Variant::JJA),
            2 => Some(Variant::JJDD),
            _ => None,
        }
    }

    /// The 52-card deck for this variant.
    ///
    /// Standard: bits 0..52 (all standard cards, no jokers).
    /// JJA: standard − {2♥, 2♦} + {LittleJoker, BigJoker}.
    /// JJDD: standard − {2♥, 2♣} + {LittleJoker, BigJoker}.
    pub const fn deck(self) -> CardSet {
        // Bits 0..=51 — all 52 standard cards.
        let standard_only: u64 = (1u64 << 52) - 1;
        // Bits 52, 53 — the two jokers.
        let jokers: u64 = (1u64 << 52) | (1u64 << 53);

        match self {
            Variant::Standard => CardSet::from_raw(standard_only),
            Variant::JJA => {
                // Remove 2♥ (bit 2) and 2♦ (bit 1), add jokers.
                let removed: u64 = (1u64 << 1) | (1u64 << 2);
                CardSet::from_raw((standard_only & !removed) | jokers)
            }
            Variant::JJDD => {
                // Remove 2♥ (bit 2) and 2♣ (bit 0), add jokers.
                let removed: u64 = (1u64 << 0) | (1u64 << 2);
                CardSet::from_raw((standard_only & !removed) | jokers)
            }
        }
    }

    /// Cards excluded from this variant's deck.
    ///
    /// Standard: empty.
    /// JJA: {2♥, 2♦}.
    /// JJDD: {2♥, 2♣}.
    pub const fn removed_cards(self) -> CardSet {
        match self {
            Variant::Standard => CardSet::empty(),
            Variant::JJA => CardSet::from_raw((1u64 << 1) | (1u64 << 2)),
            Variant::JJDD => CardSet::from_raw((1u64 << 0) | (1u64 << 2)),
        }
    }

    /// The card that leads the first trick — universal "lowest club" rule.
    ///
    /// Standard: 2♣. JJA: 2♣ (still in deck). JJDD: 3♣ (2♣ removed).
    pub const fn opening_card(self) -> Card {
        match self {
            Variant::Standard | Variant::JJA => Card::new(Rank::Two, Suit::Clubs),
            Variant::JJDD => Card::new(Rank::Three, Suit::Clubs),
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{Card, Rank, Suit};

    fn two_of_clubs() -> Card { Card::new(Rank::Two, Suit::Clubs) }
    fn two_of_diamonds() -> Card { Card::new(Rank::Two, Suit::Diamonds) }
    fn two_of_hearts() -> Card { Card::new(Rank::Two, Suit::Hearts) }
    fn two_of_spades() -> Card { Card::new(Rank::Two, Suit::Spades) }
    fn three_of_clubs() -> Card { Card::new(Rank::Three, Suit::Clubs) }
    fn ace_of_spades() -> Card { Card::new(Rank::Ace, Suit::Spades) }

    // ─── Variant::card_count — every variant always has 52 cards ──

    #[test]
    fn standard_has_fifty_two_cards() {
        assert_eq!(Variant::Standard.card_count(), 52);
    }

    #[test]
    fn jja_has_fifty_two_cards() {
        assert_eq!(Variant::JJA.card_count(), 52);
    }

    #[test]
    fn jjdd_has_fifty_two_cards() {
        assert_eq!(Variant::JJDD.card_count(), 52);
    }

    // ─── Variant::uses_jokers ─────────────────────────────

    #[test]
    fn standard_does_not_use_jokers() {
        assert!(!Variant::Standard.uses_jokers());
    }

    #[test]
    fn jja_uses_jokers() {
        assert!(Variant::JJA.uses_jokers());
    }

    #[test]
    fn jjdd_uses_jokers() {
        assert!(Variant::JJDD.uses_jokers());
    }

    // ─── Variant::has_high_twos — only JJDD elevates the 2♦ ──

    #[test]
    fn standard_does_not_have_high_twos() {
        assert!(!Variant::Standard.has_high_twos());
    }

    #[test]
    fn jja_does_not_have_high_twos() {
        assert!(!Variant::JJA.has_high_twos());
    }

    #[test]
    fn jjdd_has_high_twos() {
        assert!(Variant::JJDD.has_high_twos());
    }

    // ─── Variant::to_u8 — canonical wire codes ────────────

    #[test]
    fn standard_serializes_to_zero() {
        assert_eq!(Variant::Standard.to_u8(), 0);
    }

    #[test]
    fn jja_serializes_to_one() {
        assert_eq!(Variant::JJA.to_u8(), 1);
    }

    #[test]
    fn jjdd_serializes_to_two() {
        assert_eq!(Variant::JJDD.to_u8(), 2);
    }

    // ─── Variant::from_u8 — wire decoding ─────────────────

    #[test]
    fn from_u8_zero_decodes_to_standard() {
        assert_eq!(Variant::from_u8(0), Some(Variant::Standard));
    }

    #[test]
    fn from_u8_one_decodes_to_jja() {
        assert_eq!(Variant::from_u8(1), Some(Variant::JJA));
    }

    #[test]
    fn from_u8_two_decodes_to_jjdd() {
        assert_eq!(Variant::from_u8(2), Some(Variant::JJDD));
    }

    #[test]
    fn from_u8_three_is_unknown_variant() {
        assert_eq!(Variant::from_u8(3), None);
    }

    #[test]
    fn from_u8_max_u8_is_unknown_variant() {
        assert_eq!(Variant::from_u8(u8::MAX), None);
    }

    // ─── Round-trip property ──────────────────────────────

    #[test]
    fn from_u8_then_to_u8_is_identity_for_every_variant() {
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            assert_eq!(
                Variant::from_u8(v.to_u8()),
                Some(v),
                "round trip failed for {:?}",
                v
            );
        }
    }

    // ─── Variant::deck — the 52 cards in this variant ────

    #[test]
    fn standard_deck_has_fifty_two_cards() {
        assert_eq!(Variant::Standard.deck().len(), 52);
    }

    #[test]
    fn jja_deck_has_fifty_two_cards() {
        assert_eq!(Variant::JJA.deck().len(), 52);
    }

    #[test]
    fn jjdd_deck_has_fifty_two_cards() {
        assert_eq!(Variant::JJDD.deck().len(), 52);
    }

    #[test]
    fn deck_size_is_always_fifty_two_for_every_variant() {
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            assert_eq!(v.deck().len(), 52, "{:?} should have 52 cards", v);
        }
    }

    // ─── Variant::deck — specific card membership ────────

    #[test]
    fn standard_deck_contains_two_of_clubs() {
        assert!(Variant::Standard.deck().contains(two_of_clubs()));
    }

    #[test]
    fn standard_deck_contains_ace_of_spades() {
        assert!(Variant::Standard.deck().contains(ace_of_spades()));
    }

    #[test]
    fn standard_deck_does_not_contain_little_joker() {
        assert!(!Variant::Standard.deck().contains(Card::LITTLE_JOKER));
    }

    #[test]
    fn standard_deck_does_not_contain_big_joker() {
        assert!(!Variant::Standard.deck().contains(Card::BIG_JOKER));
    }

    #[test]
    fn jja_deck_does_not_contain_two_of_hearts() {
        assert!(!Variant::JJA.deck().contains(two_of_hearts()));
    }

    #[test]
    fn jja_deck_does_not_contain_two_of_diamonds() {
        assert!(!Variant::JJA.deck().contains(two_of_diamonds()));
    }

    #[test]
    fn jja_deck_contains_two_of_clubs() {
        // 2♣ is NOT removed in JJA, so it remains in the deck.
        assert!(Variant::JJA.deck().contains(two_of_clubs()));
    }

    #[test]
    fn jja_deck_contains_two_of_spades() {
        assert!(Variant::JJA.deck().contains(two_of_spades()));
    }

    #[test]
    fn jja_deck_contains_little_joker() {
        assert!(Variant::JJA.deck().contains(Card::LITTLE_JOKER));
    }

    #[test]
    fn jja_deck_contains_big_joker() {
        assert!(Variant::JJA.deck().contains(Card::BIG_JOKER));
    }

    #[test]
    fn jjdd_deck_does_not_contain_two_of_hearts() {
        assert!(!Variant::JJDD.deck().contains(two_of_hearts()));
    }

    #[test]
    fn jjdd_deck_does_not_contain_two_of_clubs() {
        assert!(!Variant::JJDD.deck().contains(two_of_clubs()));
    }

    #[test]
    fn jjdd_deck_contains_two_of_diamonds() {
        // 2♦ is the elevated trump in JJDD — it stays in the deck.
        assert!(Variant::JJDD.deck().contains(two_of_diamonds()));
    }

    #[test]
    fn jjdd_deck_contains_two_of_spades() {
        assert!(Variant::JJDD.deck().contains(two_of_spades()));
    }

    #[test]
    fn jjdd_deck_contains_both_jokers() {
        let deck = Variant::JJDD.deck();
        assert!(deck.contains(Card::LITTLE_JOKER));
        assert!(deck.contains(Card::BIG_JOKER));
    }

    // ─── Variant::removed_cards ──────────────────────────

    #[test]
    fn standard_removed_cards_is_empty() {
        assert!(Variant::Standard.removed_cards().is_empty());
    }

    #[test]
    fn jja_removed_cards_is_two_of_hearts_and_two_of_diamonds() {
        let removed = Variant::JJA.removed_cards();
        assert_eq!(removed.len(), 2);
        assert!(removed.contains(two_of_hearts()));
        assert!(removed.contains(two_of_diamonds()));
    }

    #[test]
    fn jjdd_removed_cards_is_two_of_hearts_and_two_of_clubs() {
        let removed = Variant::JJDD.removed_cards();
        assert_eq!(removed.len(), 2);
        assert!(removed.contains(two_of_hearts()));
        assert!(removed.contains(two_of_clubs()));
    }

    #[test]
    fn deck_and_removed_cards_are_disjoint_for_every_variant() {
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            assert!(
                v.deck().intersection(v.removed_cards()).is_empty(),
                "deck and removed_cards overlap for {:?}",
                v
            );
        }
    }

    // ─── Variant::opening_card — universal "lowest club leads" ────

    #[test]
    fn standard_opening_card_is_two_of_clubs() {
        assert_eq!(Variant::Standard.opening_card(), two_of_clubs());
    }

    #[test]
    fn jja_opening_card_is_two_of_clubs() {
        // 2♣ is not removed in JJA, so it's still the lowest club.
        assert_eq!(Variant::JJA.opening_card(), two_of_clubs());
    }

    #[test]
    fn jjdd_opening_card_is_three_of_clubs() {
        // 2♣ is removed in JJDD, so the lowest remaining club is 3♣.
        assert_eq!(Variant::JJDD.opening_card(), three_of_clubs());
    }

    #[test]
    fn opening_card_is_always_in_the_deck_of_its_variant() {
        for &v in &[Variant::Standard, Variant::JJA, Variant::JJDD] {
            assert!(
                v.deck().contains(v.opening_card()),
                "opening card not in deck for {:?}",
                v
            );
        }
    }

    // ─── Derived trait behaviors ──────────────────────────

    #[test]
    fn equal_variants_compare_equal() {
        assert_eq!(Variant::Standard, Variant::Standard);
        assert_eq!(Variant::JJDD, Variant::JJDD);
    }

    #[test]
    fn different_variants_compare_unequal() {
        assert_ne!(Variant::Standard, Variant::JJA);
        assert_ne!(Variant::JJA, Variant::JJDD);
    }

    #[test]
    fn variants_are_copy_so_they_can_be_used_after_assignment() {
        let a = Variant::JJDD;
        let b = a;
        assert_eq!(a, b);
    }
}
