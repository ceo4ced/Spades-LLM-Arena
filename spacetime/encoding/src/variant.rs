//! The Spades rules variant in effect for a given game.
//!
//! Variants differ in two structural ways:
//!   - Whether the deck includes Big and Little Jokers (54 cards vs 52)
//!   - Whether the 2♦ and 2♠ are elevated above the A♠ as the top trumps,
//!     and the 2♦ plays as a spade ("high twos" rule)
//!
//! Strength ordering and effective-suit logic for each variant lives in
//! `strength.rs` and `legal.rs` — this module only classifies a game's rules.
//!
//! Persisted as a `u8` on the `Game` table:
//!   0 = Standard, 1 = Jokers, 2 = HighTwos, 3 = JokersHighTwos.
//!   These codes are stable — adding a new variant assigns the next code.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Variant {
    Standard,
    Jokers,
    HighTwos,
    JokersHighTwos,
}

impl Variant {
    pub const fn card_count(self) -> u8 {
        match self {
            Variant::Standard | Variant::HighTwos => 52,
            Variant::Jokers | Variant::JokersHighTwos => 54,
        }
    }

    pub const fn uses_jokers(self) -> bool {
        matches!(self, Variant::Jokers | Variant::JokersHighTwos)
    }

    pub const fn has_high_twos(self) -> bool {
        matches!(self, Variant::HighTwos | Variant::JokersHighTwos)
    }

    pub const fn to_u8(self) -> u8 {
        match self {
            Variant::Standard => 0,
            Variant::Jokers => 1,
            Variant::HighTwos => 2,
            Variant::JokersHighTwos => 3,
        }
    }

    pub const fn from_u8(code: u8) -> Option<Variant> {
        match code {
            0 => Some(Variant::Standard),
            1 => Some(Variant::Jokers),
            2 => Some(Variant::HighTwos),
            3 => Some(Variant::JokersHighTwos),
            _ => None,
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Variant::card_count ──────────────────────────────

    #[test]
    fn standard_variant_has_fifty_two_cards() {
        assert_eq!(Variant::Standard.card_count(), 52);
    }

    #[test]
    fn jokers_variant_has_fifty_four_cards() {
        assert_eq!(Variant::Jokers.card_count(), 54);
    }

    #[test]
    fn high_twos_variant_has_fifty_two_cards() {
        assert_eq!(Variant::HighTwos.card_count(), 52);
    }

    #[test]
    fn jokers_high_twos_variant_has_fifty_four_cards() {
        assert_eq!(Variant::JokersHighTwos.card_count(), 54);
    }

    // ─── Variant::uses_jokers ─────────────────────────────

    #[test]
    fn standard_variant_does_not_use_jokers() {
        assert!(!Variant::Standard.uses_jokers());
    }

    #[test]
    fn jokers_variant_uses_jokers() {
        assert!(Variant::Jokers.uses_jokers());
    }

    #[test]
    fn high_twos_variant_does_not_use_jokers() {
        assert!(!Variant::HighTwos.uses_jokers());
    }

    #[test]
    fn jokers_high_twos_variant_uses_jokers() {
        assert!(Variant::JokersHighTwos.uses_jokers());
    }

    // ─── Variant::has_high_twos ───────────────────────────

    #[test]
    fn standard_variant_does_not_have_high_twos() {
        assert!(!Variant::Standard.has_high_twos());
    }

    #[test]
    fn jokers_variant_does_not_have_high_twos() {
        assert!(!Variant::Jokers.has_high_twos());
    }

    #[test]
    fn high_twos_variant_has_high_twos() {
        assert!(Variant::HighTwos.has_high_twos());
    }

    #[test]
    fn jokers_high_twos_variant_has_high_twos() {
        assert!(Variant::JokersHighTwos.has_high_twos());
    }

    // ─── Variant::to_u8 — canonical wire codes ────────────

    #[test]
    fn standard_serializes_to_zero() {
        assert_eq!(Variant::Standard.to_u8(), 0);
    }

    #[test]
    fn jokers_serializes_to_one() {
        assert_eq!(Variant::Jokers.to_u8(), 1);
    }

    #[test]
    fn high_twos_serializes_to_two() {
        assert_eq!(Variant::HighTwos.to_u8(), 2);
    }

    #[test]
    fn jokers_high_twos_serializes_to_three() {
        assert_eq!(Variant::JokersHighTwos.to_u8(), 3);
    }

    // ─── Variant::from_u8 — wire decoding ─────────────────

    #[test]
    fn from_u8_zero_decodes_to_standard() {
        assert_eq!(Variant::from_u8(0), Some(Variant::Standard));
    }

    #[test]
    fn from_u8_one_decodes_to_jokers() {
        assert_eq!(Variant::from_u8(1), Some(Variant::Jokers));
    }

    #[test]
    fn from_u8_two_decodes_to_high_twos() {
        assert_eq!(Variant::from_u8(2), Some(Variant::HighTwos));
    }

    #[test]
    fn from_u8_three_decodes_to_jokers_high_twos() {
        assert_eq!(Variant::from_u8(3), Some(Variant::JokersHighTwos));
    }

    #[test]
    fn from_u8_four_is_unknown_variant() {
        assert_eq!(Variant::from_u8(4), None);
    }

    #[test]
    fn from_u8_max_u8_is_unknown_variant() {
        assert_eq!(Variant::from_u8(u8::MAX), None);
    }

    // ─── Round-trip property ──────────────────────────────

    #[test]
    fn from_u8_then_to_u8_is_identity_for_every_variant() {
        let all_variants = [
            Variant::Standard,
            Variant::Jokers,
            Variant::HighTwos,
            Variant::JokersHighTwos,
        ];
        for &v in &all_variants {
            assert_eq!(
                Variant::from_u8(v.to_u8()),
                Some(v),
                "round trip failed for {:?}",
                v
            );
        }
    }

    // ─── Derived trait behaviors ──────────────────────────

    #[test]
    fn equal_variants_compare_equal() {
        assert_eq!(Variant::Standard, Variant::Standard);
        assert_eq!(Variant::JokersHighTwos, Variant::JokersHighTwos);
    }

    #[test]
    fn different_variants_compare_unequal() {
        assert_ne!(Variant::Standard, Variant::Jokers);
        assert_ne!(Variant::HighTwos, Variant::JokersHighTwos);
    }

    #[test]
    fn variants_are_copy_so_they_can_be_used_after_assignment() {
        let a = Variant::HighTwos;
        let b = a;
        assert_eq!(a, b);
    }
}
