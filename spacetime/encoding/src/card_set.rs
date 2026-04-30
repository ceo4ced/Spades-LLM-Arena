//! Pure bitmask-backed set of cards.
//!
//! A `CardSet` is a `u64` where bit `i` set means card index `i` is in the
//! set. Membership/insert/remove/intersect/union/popcount are all single CPU
//! operations.
//!
//! All operations are pure: `insert` and `remove` consume `self` by value
//! (CardSet is `Copy`) and return a new `CardSet`. No mutation in place.
//!
//! Only bits 0..54 are meaningful — anything above index 53 (the Big Joker)
//! is not a valid card. `from_raw` masks off any high bits to enforce that
//! invariant at the system boundary; every other operation preserves it
//! because the operands are already canonical.
//!
//! Storage form: a `Hand`'s deal is four `CardSet` values, one per seat,
//! together representing 52 (or 54) cards.

use crate::card::{Card, Suit};

/// Mask of bits that are valid card-index bits.
/// Bits 0..=53 are 1 (the 54 possible cards), bits 54..=63 are 0.
const VALID_CARDS_MASK: u64 = (1u64 << 54) - 1;

/// Per-suit masks, indexed by `Suit as usize`.
///
/// Each mask has bits set at the 13 indices of cards with that natural suit.
/// Card indices follow `rank * 4 + suit`, so suit `s` occupies positions
/// `s, s+4, s+8, ..., s+48`. Jokers (indices 52, 53) are not in any suit
/// mask — they have no natural suit.
const SUIT_MASKS: [u64; 4] = [
    0x0001_1111_1111_1111, // Clubs    — bits 0, 4, 8, ..., 48
    0x0002_2222_2222_2222, // Diamonds — bits 1, 5, 9, ..., 49
    0x0004_4444_4444_4444, // Hearts   — bits 2, 6, 10, ..., 50
    0x0008_8888_8888_8888, // Spades   — bits 3, 7, 11, ..., 51
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CardSet(u64);

impl CardSet {
    pub const fn empty() -> CardSet {
        CardSet(0)
    }

    pub const fn single(card: Card) -> CardSet {
        CardSet(1u64 << card.to_index())
    }

    /// Construct from a raw u64. Bits above index 53 are masked off so
    /// corrupt or out-of-range data can't leak into operations like `len()`.
    pub const fn from_raw(bits: u64) -> CardSet {
        CardSet(bits & VALID_CARDS_MASK)
    }

    pub const fn to_raw(self) -> u64 {
        self.0
    }

    pub const fn len(self) -> u32 {
        self.0.count_ones()
    }

    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub const fn contains(self, card: Card) -> bool {
        (self.0 & (1u64 << card.to_index())) != 0
    }

    pub const fn insert(self, card: Card) -> CardSet {
        CardSet(self.0 | (1u64 << card.to_index()))
    }

    pub const fn remove(self, card: Card) -> CardSet {
        CardSet(self.0 & !(1u64 << card.to_index()))
    }

    pub const fn union(self, other: CardSet) -> CardSet {
        CardSet(self.0 | other.0)
    }

    pub const fn intersection(self, other: CardSet) -> CardSet {
        CardSet(self.0 & other.0)
    }

    pub const fn difference(self, other: CardSet) -> CardSet {
        CardSet(self.0 & !other.0)
    }

    /// Iterate over cards in ascending index order (lowest first).
    pub fn iter(self) -> CardSetIter {
        CardSetIter { remaining: self.0 }
    }

    /// Subset of cards in this set whose **natural** suit equals `suit`.
    ///
    /// Jokers are never included — they have no natural suit. Variant-specific
    /// reinterpretation (e.g., 2♦ playing as a spade in the HighTwos variant)
    /// is handled in `legal.rs` via `effective_suit`, not here.
    pub const fn cards_of_suit(self, suit: Suit) -> CardSet {
        CardSet(self.0 & SUIT_MASKS[suit as usize])
    }

    /// Whether this set contains any card of `suit`'s natural suit.
    /// Equivalent to `!self.cards_of_suit(suit).is_empty()` but skips
    /// constructing the intermediate `CardSet`.
    pub const fn has_any_of_suit(self, suit: Suit) -> bool {
        (self.0 & SUIT_MASKS[suit as usize]) != 0
    }
}

/// Iterator that yields each card in a `CardSet` in ascending index order.
///
/// Uses two bit tricks per `next()`:
///   - `trailing_zeros()` finds the index of the lowest set bit (one CPU op).
///   - `n & (n - 1)` clears that bit (one CPU op).
pub struct CardSetIter {
    remaining: u64,
}

impl Iterator for CardSetIter {
    type Item = Card;

    fn next(&mut self) -> Option<Card> {
        if self.remaining == 0 {
            return None;
        }
        let lowest_index = self.remaining.trailing_zeros() as u8;
        self.remaining &= self.remaining - 1;
        Card::from_index(lowest_index)
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

// ─── Tests (RED before any implementation) ───────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{Rank, Suit};

    // Helper for tests: a few well-known cards.
    fn two_of_clubs() -> Card { Card::new(Rank::Two, Suit::Clubs) }
    fn ace_of_spades() -> Card { Card::new(Rank::Ace, Suit::Spades) }
    fn queen_of_hearts() -> Card { Card::new(Rank::Queen, Suit::Hearts) }
    fn seven_of_diamonds() -> Card { Card::new(Rank::Seven, Suit::Diamonds) }

    // ─── Construction ─────────────────────────────────────

    #[test]
    fn empty_set_has_zero_length() {
        assert_eq!(CardSet::empty().len(), 0);
    }

    #[test]
    fn empty_set_reports_is_empty() {
        assert!(CardSet::empty().is_empty());
    }

    #[test]
    fn empty_set_does_not_contain_any_card() {
        let empty = CardSet::empty();
        for i in 0u8..54 {
            let c = Card::from_index(i).unwrap();
            assert!(!empty.contains(c), "empty set should not contain card {}", i);
        }
    }

    #[test]
    fn single_card_set_has_length_one() {
        assert_eq!(CardSet::single(ace_of_spades()).len(), 1);
    }

    #[test]
    fn single_card_set_is_not_empty() {
        assert!(!CardSet::single(ace_of_spades()).is_empty());
    }

    #[test]
    fn single_card_set_contains_that_card() {
        let cs = CardSet::single(ace_of_spades());
        assert!(cs.contains(ace_of_spades()));
    }

    #[test]
    fn single_card_set_does_not_contain_other_cards() {
        let cs = CardSet::single(ace_of_spades());
        assert!(!cs.contains(two_of_clubs()));
        assert!(!cs.contains(queen_of_hearts()));
    }

    // ─── Raw round-trip (for serialization) ───────────────

    #[test]
    fn from_raw_zero_is_empty() {
        assert_eq!(CardSet::from_raw(0).len(), 0);
        assert!(CardSet::from_raw(0).is_empty());
    }

    #[test]
    fn to_raw_of_empty_is_zero() {
        assert_eq!(CardSet::empty().to_raw(), 0);
    }

    #[test]
    fn raw_round_trip_preserves_set_for_assorted_bit_patterns() {
        let patterns: [u64; 6] = [
            0,
            1,
            0xFFFF_FFFF_FFFF_FFFF & ((1u64 << 54) - 1),  // all 54 valid cards set
            0x0003_FFFF_FFFF_FFFF,                        // first 50 cards
            0b1010_1010_1010_1010,                        // alternating low bits
            (1 << 0) | (1 << 51),                         // 2♣ and A♠
        ];
        for &p in &patterns {
            assert_eq!(CardSet::from_raw(p).to_raw(), p, "round trip failed for {:#018b}", p);
        }
    }

    // ─── Masking — high bits above index 53 are not storable ──────────

    #[test]
    fn from_raw_masks_off_bits_above_card_index_fifty_three() {
        // All 64 bits set → only the low 54 should round-trip.
        let cs = CardSet::from_raw(u64::MAX);
        assert_eq!(cs.to_raw(), (1u64 << 54) - 1);
        assert_eq!(cs.len(), 54);
    }

    #[test]
    fn from_raw_with_high_bits_only_yields_empty_set() {
        // Bits 54..=63 set, no valid card bits set.
        let high_bits_only: u64 = 0xFFC0_0000_0000_0000;
        let cs = CardSet::from_raw(high_bits_only);
        assert_eq!(cs.to_raw(), 0);
        assert!(cs.is_empty());
    }

    #[test]
    fn from_raw_masking_preserves_legitimate_low_bits() {
        // Mix of legitimate (low) and garbage (high) bits.
        let mixed: u64 = 0xFF00_0000_0000_0001; // bit 0 valid, bits 56..=63 garbage
        let cs = CardSet::from_raw(mixed);
        assert_eq!(cs.len(), 1);
        assert!(cs.contains(Card::from_index(0).unwrap()));
    }

    // ─── Insert ───────────────────────────────────────────

    #[test]
    fn insert_into_empty_yields_singleton_containing_that_card() {
        let cs = CardSet::empty().insert(queen_of_hearts());
        assert_eq!(cs.len(), 1);
        assert!(cs.contains(queen_of_hearts()));
    }

    #[test]
    fn inserting_same_card_twice_is_idempotent() {
        let once = CardSet::empty().insert(ace_of_spades());
        let twice = once.insert(ace_of_spades());
        assert_eq!(once.to_raw(), twice.to_raw());
        assert_eq!(twice.len(), 1);
    }

    #[test]
    fn insert_does_not_remove_other_cards_already_in_set() {
        let cs = CardSet::empty()
            .insert(two_of_clubs())
            .insert(ace_of_spades());
        assert!(cs.contains(two_of_clubs()));
        assert!(cs.contains(ace_of_spades()));
    }

    #[test]
    fn insert_two_distinct_cards_yields_length_two() {
        let cs = CardSet::empty()
            .insert(two_of_clubs())
            .insert(queen_of_hearts());
        assert_eq!(cs.len(), 2);
    }

    // ─── Remove ───────────────────────────────────────────

    #[test]
    fn removing_from_empty_set_is_a_no_op() {
        let cs = CardSet::empty().remove(ace_of_spades());
        assert!(cs.is_empty());
    }

    #[test]
    fn removing_a_present_card_decreases_length_by_one() {
        let before = CardSet::empty()
            .insert(two_of_clubs())
            .insert(ace_of_spades());
        let after = before.remove(ace_of_spades());
        assert_eq!(after.len(), before.len() - 1);
    }

    #[test]
    fn removing_an_absent_card_is_a_no_op() {
        let before = CardSet::empty().insert(two_of_clubs());
        let after = before.remove(ace_of_spades());
        assert_eq!(before.to_raw(), after.to_raw());
    }

    #[test]
    fn insert_then_remove_returns_to_original_set() {
        let original = CardSet::empty().insert(two_of_clubs());
        let round_trip = original.insert(ace_of_spades()).remove(ace_of_spades());
        assert_eq!(original.to_raw(), round_trip.to_raw());
    }

    // ─── Set operations ───────────────────────────────────

    #[test]
    fn union_with_empty_returns_self_unchanged() {
        let a = CardSet::empty().insert(ace_of_spades()).insert(two_of_clubs());
        assert_eq!(a.union(CardSet::empty()).to_raw(), a.to_raw());
    }

    #[test]
    fn union_of_disjoint_sets_contains_all_cards_from_both() {
        let a = CardSet::single(two_of_clubs());
        let b = CardSet::single(ace_of_spades());
        let u = a.union(b);
        assert_eq!(u.len(), 2);
        assert!(u.contains(two_of_clubs()));
        assert!(u.contains(ace_of_spades()));
    }

    #[test]
    fn union_with_self_is_idempotent() {
        let a = CardSet::empty()
            .insert(queen_of_hearts())
            .insert(seven_of_diamonds());
        assert_eq!(a.union(a).to_raw(), a.to_raw());
    }

    #[test]
    fn intersection_of_disjoint_sets_is_empty() {
        let a = CardSet::single(two_of_clubs());
        let b = CardSet::single(ace_of_spades());
        assert!(a.intersection(b).is_empty());
    }

    #[test]
    fn intersection_with_self_returns_self() {
        let a = CardSet::empty()
            .insert(queen_of_hearts())
            .insert(two_of_clubs());
        assert_eq!(a.intersection(a).to_raw(), a.to_raw());
    }

    #[test]
    fn intersection_of_overlapping_sets_returns_only_shared_cards() {
        let a = CardSet::empty().insert(two_of_clubs()).insert(ace_of_spades());
        let b = CardSet::empty().insert(ace_of_spades()).insert(queen_of_hearts());
        let i = a.intersection(b);
        assert_eq!(i.len(), 1);
        assert!(i.contains(ace_of_spades()));
    }

    #[test]
    fn intersection_with_empty_is_empty() {
        let a = CardSet::single(two_of_clubs());
        assert!(a.intersection(CardSet::empty()).is_empty());
    }

    #[test]
    fn difference_of_a_set_with_itself_is_empty() {
        let a = CardSet::empty().insert(two_of_clubs()).insert(ace_of_spades());
        assert!(a.difference(a).is_empty());
    }

    #[test]
    fn difference_with_empty_returns_self_unchanged() {
        let a = CardSet::empty().insert(two_of_clubs()).insert(ace_of_spades());
        assert_eq!(a.difference(CardSet::empty()).to_raw(), a.to_raw());
    }

    #[test]
    fn difference_removes_only_overlapping_cards() {
        let a = CardSet::empty().insert(two_of_clubs()).insert(ace_of_spades());
        let b = CardSet::single(ace_of_spades());
        let d = a.difference(b);
        assert_eq!(d.len(), 1);
        assert!(d.contains(two_of_clubs()));
        assert!(!d.contains(ace_of_spades()));
    }

    // ─── Iteration ────────────────────────────────────────

    #[test]
    fn iter_on_empty_set_yields_no_cards() {
        let cs = CardSet::empty();
        let collected: Vec<Card> = cs.iter().collect();
        assert!(collected.is_empty());
    }

    #[test]
    fn iter_yields_every_card_in_the_set() {
        let cs = CardSet::empty()
            .insert(two_of_clubs())
            .insert(queen_of_hearts())
            .insert(ace_of_spades());
        let collected: Vec<Card> = cs.iter().collect();
        assert!(collected.contains(&two_of_clubs()));
        assert!(collected.contains(&queen_of_hearts()));
        assert!(collected.contains(&ace_of_spades()));
        assert_eq!(collected.len(), 3);
    }

    #[test]
    fn iter_yields_cards_in_ascending_index_order() {
        // Insert deliberately out of index order; iter must return ascending.
        let cs = CardSet::empty()
            .insert(ace_of_spades())       // index 51
            .insert(two_of_clubs())        // index 0
            .insert(queen_of_hearts());    // index 46
        let indices: Vec<u8> = cs.iter().map(|c| c.to_index()).collect();
        let mut sorted = indices.clone();
        sorted.sort();
        assert_eq!(indices, sorted, "iter must yield cards in ascending index order");
    }

    #[test]
    fn iter_count_matches_len_for_arbitrary_sets() {
        // Build a set of ~half the deck and confirm iter() yields exactly len() cards.
        let mut cs = CardSet::empty();
        for i in (0u8..54).step_by(2) {
            cs = cs.insert(Card::from_index(i).unwrap());
        }
        let iter_count = cs.iter().count();
        assert_eq!(iter_count as u32, cs.len());
        assert_eq!(iter_count, 27); // 0, 2, 4, ..., 52 → 27 cards
    }

    // ─── Derived trait behaviors ──────────────────────────

    #[test]
    fn equal_card_sets_compare_equal() {
        let a = CardSet::empty().insert(two_of_clubs()).insert(ace_of_spades());
        let b = CardSet::empty().insert(ace_of_spades()).insert(two_of_clubs());
        assert_eq!(a, b);
    }

    #[test]
    fn card_sets_are_copy_so_they_can_be_used_after_assignment() {
        let a = CardSet::single(ace_of_spades());
        let b = a; // would move and invalidate `a` if not Copy
        assert_eq!(a, b);
    }

    // ─── Suit filtering ───────────────────────────────────

    fn full_standard_deck() -> CardSet {
        // Bits 0..=51 set — all 52 standard cards, no jokers.
        CardSet::from_raw((1u64 << 52) - 1)
    }

    #[test]
    fn empty_set_has_no_cards_of_any_suit() {
        let empty = CardSet::empty();
        for &suit in &[Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades] {
            assert!(
                empty.cards_of_suit(suit).is_empty(),
                "empty set should have no cards of suit {:?}",
                suit
            );
        }
    }

    #[test]
    fn cards_of_suit_returns_singleton_when_set_has_one_matching_card() {
        let cs = CardSet::single(queen_of_hearts());
        let hearts = cs.cards_of_suit(Suit::Hearts);
        assert_eq!(hearts.len(), 1);
        assert!(hearts.contains(queen_of_hearts()));
    }

    #[test]
    fn cards_of_suit_returns_empty_when_set_has_no_matching_cards() {
        let cs = CardSet::single(queen_of_hearts());
        assert!(cs.cards_of_suit(Suit::Clubs).is_empty());
        assert!(cs.cards_of_suit(Suit::Diamonds).is_empty());
        assert!(cs.cards_of_suit(Suit::Spades).is_empty());
    }

    #[test]
    fn full_deck_has_thirteen_clubs() {
        assert_eq!(full_standard_deck().cards_of_suit(Suit::Clubs).len(), 13);
    }

    #[test]
    fn full_deck_has_thirteen_diamonds() {
        assert_eq!(full_standard_deck().cards_of_suit(Suit::Diamonds).len(), 13);
    }

    #[test]
    fn full_deck_has_thirteen_hearts() {
        assert_eq!(full_standard_deck().cards_of_suit(Suit::Hearts).len(), 13);
    }

    #[test]
    fn full_deck_has_thirteen_spades() {
        assert_eq!(full_standard_deck().cards_of_suit(Suit::Spades).len(), 13);
    }

    #[test]
    fn cards_of_suit_excludes_jokers_for_every_suit() {
        // Jokers have no natural suit — they're never returned by suit filtering.
        // (Variant-specific behavior like "jokers play as spades" is handled in legal.rs,
        // not here.)
        let cs = CardSet::empty()
            .insert(Card::LITTLE_JOKER)
            .insert(Card::BIG_JOKER);
        for &suit in &[Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades] {
            assert!(
                cs.cards_of_suit(suit).is_empty(),
                "jokers should not match suit {:?} — they have no natural suit",
                suit
            );
        }
    }

    #[test]
    fn cards_of_suit_returns_only_matching_suit_for_mixed_set() {
        // A hand: 2♣, 7♦, Q♥, A♠
        let cs = CardSet::empty()
            .insert(two_of_clubs())
            .insert(seven_of_diamonds())
            .insert(queen_of_hearts())
            .insert(ace_of_spades());
        let diamonds = cs.cards_of_suit(Suit::Diamonds);
        assert_eq!(diamonds.len(), 1);
        assert!(diamonds.contains(seven_of_diamonds()));
        assert!(!diamonds.contains(two_of_clubs()));
        assert!(!diamonds.contains(queen_of_hearts()));
        assert!(!diamonds.contains(ace_of_spades()));
    }

    #[test]
    fn cards_of_suit_partitions_a_full_deck_into_thirteen_each() {
        // The four suit subsets should be disjoint and union to the full deck.
        let deck = full_standard_deck();
        let c = deck.cards_of_suit(Suit::Clubs);
        let d = deck.cards_of_suit(Suit::Diamonds);
        let h = deck.cards_of_suit(Suit::Hearts);
        let s = deck.cards_of_suit(Suit::Spades);
        assert_eq!(c.len() + d.len() + h.len() + s.len(), 52);
        assert!(c.intersection(d).is_empty());
        assert!(c.intersection(h).is_empty());
        assert!(c.intersection(s).is_empty());
        assert!(d.intersection(h).is_empty());
        assert!(d.intersection(s).is_empty());
        assert!(h.intersection(s).is_empty());
        assert_eq!(c.union(d).union(h).union(s).to_raw(), deck.to_raw());
    }

    // ─── has_any_of_suit ──────────────────────────────────

    #[test]
    fn empty_set_has_no_card_of_any_suit() {
        let empty = CardSet::empty();
        assert!(!empty.has_any_of_suit(Suit::Clubs));
        assert!(!empty.has_any_of_suit(Suit::Diamonds));
        assert!(!empty.has_any_of_suit(Suit::Hearts));
        assert!(!empty.has_any_of_suit(Suit::Spades));
    }

    #[test]
    fn has_any_of_suit_true_when_set_contains_a_card_of_that_suit() {
        let cs = CardSet::single(queen_of_hearts());
        assert!(cs.has_any_of_suit(Suit::Hearts));
    }

    #[test]
    fn has_any_of_suit_false_when_set_lacks_that_suit() {
        let cs = CardSet::single(queen_of_hearts());
        assert!(!cs.has_any_of_suit(Suit::Clubs));
        assert!(!cs.has_any_of_suit(Suit::Diamonds));
        assert!(!cs.has_any_of_suit(Suit::Spades));
    }

    #[test]
    fn has_any_of_suit_false_when_set_has_only_jokers() {
        let cs = CardSet::empty()
            .insert(Card::LITTLE_JOKER)
            .insert(Card::BIG_JOKER);
        for &suit in &[Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades] {
            assert!(!cs.has_any_of_suit(suit));
        }
    }

    #[test]
    fn has_any_of_suit_agrees_with_cards_of_suit_being_nonempty() {
        // Property test across many configurations.
        let configurations = [
            CardSet::empty(),
            CardSet::single(two_of_clubs()),
            CardSet::single(ace_of_spades()),
            CardSet::empty().insert(Card::LITTLE_JOKER),
            full_standard_deck(),
            CardSet::empty().insert(seven_of_diamonds()).insert(queen_of_hearts()),
        ];
        for cs in &configurations {
            for &suit in &[Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades] {
                assert_eq!(
                    cs.has_any_of_suit(suit),
                    !cs.cards_of_suit(suit).is_empty(),
                    "has_any_of_suit({:?}) and cards_of_suit({:?}).is_empty() disagree",
                    suit, suit
                );
            }
        }
    }
}
