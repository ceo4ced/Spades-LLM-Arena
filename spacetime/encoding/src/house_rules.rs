//! Per-game house rules — variations of Spades that can be toggled on or off
//! independently of the variant choice.
//!
//! Currently two rules:
//!   - `spades_lead_policy` — when leading spades is permitted
//!   - `minimum_team_bid` — required floor on the sum of partner bids
//!
//! Defaults are variant-aware: JJA and JJDD default to `minimum_team_bid: 4`
//! per the user's house style; Standard defaults to 0 (no constraint).
//! All variants default to `MustBeBroken` for spades-leading.

use crate::variant::Variant;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SpadesLeadPolicy {
    /// Standard rule: spades cannot be led until they've been broken
    /// (a spade has been played in some trick), or the leader has only
    /// spades remaining in hand.
    MustBeBroken,

    /// Spades can be led at any time from the second trick onward.
    /// The first trick is still subject to the universal opening rule
    /// (lowest club leads).
    AlwaysAllowed,
}

impl SpadesLeadPolicy {
    pub const fn to_u8(self) -> u8 {
        match self {
            SpadesLeadPolicy::MustBeBroken => 0,
            SpadesLeadPolicy::AlwaysAllowed => 1,
        }
    }

    pub const fn from_u8(code: u8) -> Option<SpadesLeadPolicy> {
        match code {
            0 => Some(SpadesLeadPolicy::MustBeBroken),
            1 => Some(SpadesLeadPolicy::AlwaysAllowed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct HouseRules {
    pub spades_lead_policy: SpadesLeadPolicy,
    /// Minimum sum of partner bids. 0 disables the constraint.
    pub minimum_team_bid: u8,
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

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── SpadesLeadPolicy serialization ──────────────────

    #[test]
    fn must_be_broken_serializes_to_zero() {
        assert_eq!(SpadesLeadPolicy::MustBeBroken.to_u8(), 0);
    }

    #[test]
    fn always_allowed_serializes_to_one() {
        assert_eq!(SpadesLeadPolicy::AlwaysAllowed.to_u8(), 1);
    }

    #[test]
    fn from_u8_zero_decodes_to_must_be_broken() {
        assert_eq!(SpadesLeadPolicy::from_u8(0), Some(SpadesLeadPolicy::MustBeBroken));
    }

    #[test]
    fn from_u8_one_decodes_to_always_allowed() {
        assert_eq!(SpadesLeadPolicy::from_u8(1), Some(SpadesLeadPolicy::AlwaysAllowed));
    }

    #[test]
    fn from_u8_two_is_unknown_policy() {
        assert_eq!(SpadesLeadPolicy::from_u8(2), None);
    }

    #[test]
    fn from_u8_max_u8_is_unknown_policy() {
        assert_eq!(SpadesLeadPolicy::from_u8(u8::MAX), None);
    }

    #[test]
    fn spades_lead_policy_round_trip() {
        for &p in &[SpadesLeadPolicy::MustBeBroken, SpadesLeadPolicy::AlwaysAllowed] {
            assert_eq!(SpadesLeadPolicy::from_u8(p.to_u8()), Some(p));
        }
    }

    // ─── HouseRules::default_for ────────────────────────

    #[test]
    fn default_for_standard_has_no_team_bid_minimum() {
        assert_eq!(HouseRules::default_for(Variant::Standard).minimum_team_bid, 0);
    }

    #[test]
    fn default_for_standard_uses_must_be_broken() {
        assert_eq!(
            HouseRules::default_for(Variant::Standard).spades_lead_policy,
            SpadesLeadPolicy::MustBeBroken
        );
    }

    #[test]
    fn default_for_jja_has_team_bid_minimum_of_four() {
        assert_eq!(HouseRules::default_for(Variant::JJA).minimum_team_bid, 4);
    }

    #[test]
    fn default_for_jja_uses_must_be_broken() {
        assert_eq!(
            HouseRules::default_for(Variant::JJA).spades_lead_policy,
            SpadesLeadPolicy::MustBeBroken
        );
    }

    #[test]
    fn default_for_jjdd_has_team_bid_minimum_of_four() {
        assert_eq!(HouseRules::default_for(Variant::JJDD).minimum_team_bid, 4);
    }

    #[test]
    fn default_for_jjdd_uses_must_be_broken() {
        assert_eq!(
            HouseRules::default_for(Variant::JJDD).spades_lead_policy,
            SpadesLeadPolicy::MustBeBroken
        );
    }

    // ─── Derived trait behaviors ────────────────────────

    #[test]
    fn house_rules_are_copy_so_they_can_be_used_after_assignment() {
        let a = HouseRules::default_for(Variant::JJDD);
        let b = a;
        assert_eq!(a, b);
    }

    #[test]
    fn equal_house_rules_compare_equal() {
        let a = HouseRules { spades_lead_policy: SpadesLeadPolicy::AlwaysAllowed, minimum_team_bid: 0 };
        let b = HouseRules { spades_lead_policy: SpadesLeadPolicy::AlwaysAllowed, minimum_team_bid: 0 };
        assert_eq!(a, b);
    }

    #[test]
    fn different_house_rules_compare_unequal() {
        let a = HouseRules { spades_lead_policy: SpadesLeadPolicy::MustBeBroken, minimum_team_bid: 0 };
        let b = HouseRules { spades_lead_policy: SpadesLeadPolicy::AlwaysAllowed, minimum_team_bid: 0 };
        assert_ne!(a, b);
    }
}
