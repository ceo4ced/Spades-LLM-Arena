//! Pure bitmask-backed set of cards.
//!
//! A `CardSet` is a `u64` where bit `i` set means card index `i` is in the
//! set. Membership/insert/remove/intersect/union/popcount are all single CPU
//! operations.
//!
//! All operations are pure: `insert` and `remove` consume `self` by value
//! (CardSet is `Copy`) and return a new `CardSet`. No mutation in place.
//!
//! Storage form: a `Hand`'s deal is four `CardSet` values, one per seat,
//! together representing 52 (or 54) cards. Legal-plays computation, suit
//! filtering, and replay state all live on top of this primitive.
//!
//! Implementation lives below the test block — written only after every test
//! fails for the right reason (RED phase).

use crate::card::Card;

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
}
