//! Bids and packed-bid encoding.
//!
//! A `Bid` is what one player commits to during the bidding phase:
//!   - `Regular(n)` — promise to win exactly `n` tricks, where `n` is 1..=13.
//!   - `Nil`         — promise to win zero tricks. Bonus +50 / penalty -50
//!                     (or +100 / -100 in some houses) on the team score.
//!                     Partner's tricks count for partner only — they do NOT
//!                     fulfill the nil bidder's contract.
//!   - `BlindNil`    — nil declared before looking at the hand. Doubled
//!                     bonus / penalty (+200 / -200 typically).
//!
//! Construction goes through `Bid::regular(n) -> Option<Bid>` to enforce
//! the 1..=13 invariant. Constructing `Bid::Regular(0)` or `Bid::Regular(14)`
//! directly is a programming error — `pack_bids` defensively validates and
//! returns `None` rather than emit corrupt nibbles.
//!
//! Packed encoding (4 bits per seat × 4 seats = 16 bits, fits in `u16`):
//!   0       — not yet bid (sentinel — only valid mid-bidding-phase)
//!   1..=13  — regular bid of that many tricks
//!   14      — Nil
//!   15      — BlindNil
//!
//! Layout: seat 0 in bits 0..=3, seat 1 in bits 4..=7, seat 2 in bits 8..=11,
//! seat 3 in bits 12..=15.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Bid {
    Regular(u8),
    Nil,
    BlindNil,
}

impl Bid {
    /// Smart constructor for a regular bid. Enforces the 1..=13 invariant.
    pub const fn regular(tricks: u8) -> Option<Bid> {
        if tricks >= 1 && tricks <= 13 {
            Some(Bid::Regular(tricks))
        } else {
            None
        }
    }

    /// How many tricks this bid commits to winning. Nil and BlindNil
    /// commit to zero.
    pub const fn tricks_committed(self) -> u8 {
        match self {
            Bid::Regular(n) => n,
            Bid::Nil | Bid::BlindNil => 0,
        }
    }

    /// Whether this bid is any flavor of nil (sighted or blind).
    pub const fn is_nil(self) -> bool {
        matches!(self, Bid::Nil | Bid::BlindNil)
    }
}

/// Pack four optional bids (seats 0..=3) into a u16. Returns `None` if
/// any `Bid::Regular(n)` has `n` outside the valid 1..=13 range — defense
/// in depth against bypassing the smart constructor.
pub fn pack_bids(bids: [Option<Bid>; 4]) -> Option<u16> {
    let mut packed: u16 = 0;
    for seat in 0..4 {
        let nibble: u16 = match bids[seat] {
            None => 0,
            Some(Bid::Regular(n)) if n >= 1 && n <= 13 => n as u16,
            Some(Bid::Regular(_)) => return None,
            Some(Bid::Nil) => 14,
            Some(Bid::BlindNil) => 15,
        };
        packed |= nibble << (seat * 4);
    }
    Some(packed)
}

/// Unpack a u16 into four optional bids (seats 0..=3). Total — never fails,
/// because every 4-bit value (0..=15) maps to a valid `Option<Bid>`.
pub fn unpack_bids(packed: u16) -> [Option<Bid>; 4] {
    let mut result: [Option<Bid>; 4] = [None; 4];
    for seat in 0..4 {
        let nibble = ((packed >> (seat * 4)) & 0xF) as u8;
        result[seat] = match nibble {
            0 => None,
            n @ 1..=13 => Some(Bid::Regular(n)),
            14 => Some(Bid::Nil),
            15 => Some(Bid::BlindNil),
            _ => unreachable!("nibble was masked with & 0xF, so it's in 0..=15"),
        };
    }
    result
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Bid::regular smart constructor ───────────────────

    #[test]
    fn regular_zero_is_rejected() {
        assert_eq!(Bid::regular(0), None);
    }

    #[test]
    fn regular_one_is_accepted() {
        assert_eq!(Bid::regular(1), Some(Bid::Regular(1)));
    }

    #[test]
    fn regular_thirteen_is_accepted() {
        assert_eq!(Bid::regular(13), Some(Bid::Regular(13)));
    }

    #[test]
    fn regular_fourteen_is_rejected() {
        assert_eq!(Bid::regular(14), None);
    }

    #[test]
    fn regular_max_u8_is_rejected() {
        assert_eq!(Bid::regular(u8::MAX), None);
    }

    #[test]
    fn regular_constructor_accepts_every_value_in_one_through_thirteen() {
        for n in 1u8..=13 {
            assert_eq!(Bid::regular(n), Some(Bid::Regular(n)));
        }
    }

    // ─── Bid::tricks_committed ────────────────────────────

    #[test]
    fn regular_bid_commits_to_its_value() {
        for n in 1u8..=13 {
            assert_eq!(Bid::Regular(n).tricks_committed(), n);
        }
    }

    #[test]
    fn nil_bid_commits_to_zero_tricks() {
        assert_eq!(Bid::Nil.tricks_committed(), 0);
    }

    #[test]
    fn blind_nil_bid_commits_to_zero_tricks() {
        assert_eq!(Bid::BlindNil.tricks_committed(), 0);
    }

    // ─── Bid::is_nil ──────────────────────────────────────

    #[test]
    fn regular_bid_is_not_nil() {
        assert!(!Bid::Regular(4).is_nil());
    }

    #[test]
    fn nil_bid_is_nil() {
        assert!(Bid::Nil.is_nil());
    }

    #[test]
    fn blind_nil_bid_is_nil() {
        assert!(Bid::BlindNil.is_nil());
    }

    // ─── pack_bids ────────────────────────────────────────

    #[test]
    fn pack_all_none_yields_zero() {
        assert_eq!(pack_bids([None, None, None, None]), Some(0));
    }

    #[test]
    fn pack_regular_bid_at_seat_zero_occupies_low_nibble() {
        // Seat 0 bids 4 → low nibble = 0x4
        assert_eq!(
            pack_bids([Some(Bid::Regular(4)), None, None, None]),
            Some(0x0004)
        );
    }

    #[test]
    fn pack_regular_bid_at_seat_three_occupies_high_nibble() {
        // Seat 3 bids 4 → high nibble = 0x4 in bits 12..=15
        assert_eq!(
            pack_bids([None, None, None, Some(Bid::Regular(4))]),
            Some(0x4000)
        );
    }

    #[test]
    fn pack_four_regular_bids_in_separate_nibbles() {
        // Seats 0..=3 bid 1, 2, 3, 4 → nibbles 0x4321
        assert_eq!(
            pack_bids([
                Some(Bid::Regular(1)),
                Some(Bid::Regular(2)),
                Some(Bid::Regular(3)),
                Some(Bid::Regular(4)),
            ]),
            Some(0x4321)
        );
    }

    #[test]
    fn pack_nil_bid_uses_value_fourteen() {
        // Seat 0 bids Nil → low nibble = 0xE (14)
        assert_eq!(pack_bids([Some(Bid::Nil), None, None, None]), Some(0x000E));
    }

    #[test]
    fn pack_blind_nil_bid_uses_value_fifteen() {
        // Seat 0 bids BlindNil → low nibble = 0xF (15)
        assert_eq!(
            pack_bids([Some(Bid::BlindNil), None, None, None]),
            Some(0x000F)
        );
    }

    #[test]
    fn pack_max_regular_bids_at_every_seat_yields_dddd() {
        // All seats bid 13 → every nibble = 0xD
        assert_eq!(
            pack_bids([
                Some(Bid::Regular(13)),
                Some(Bid::Regular(13)),
                Some(Bid::Regular(13)),
                Some(Bid::Regular(13)),
            ]),
            Some(0xDDDD)
        );
    }

    #[test]
    fn pack_invalid_regular_bid_returns_none() {
        // Bypasses the smart constructor — directly constructs an invalid bid.
        // pack must reject rather than emit corrupt nibbles.
        assert_eq!(
            pack_bids([Some(Bid::Regular(99)), None, None, None]),
            None
        );
    }

    #[test]
    fn pack_invalid_zero_regular_bid_returns_none() {
        // Bid::Regular(0) is also invalid (regular bids are 1..=13)
        assert_eq!(
            pack_bids([Some(Bid::Regular(0)), None, None, None]),
            None
        );
    }

    #[test]
    fn pack_mixed_kinds_in_distinct_seats() {
        assert_eq!(
            pack_bids([
                Some(Bid::Regular(3)),  // seat 0 → 0x3
                Some(Bid::Nil),         // seat 1 → 0xE
                None,                   // seat 2 → 0x0
                Some(Bid::BlindNil),    // seat 3 → 0xF
            ]),
            Some(0xF0E3)
        );
    }

    // ─── unpack_bids ──────────────────────────────────────

    #[test]
    fn unpack_zero_yields_all_none() {
        assert_eq!(unpack_bids(0x0000), [None, None, None, None]);
    }

    #[test]
    fn unpack_low_nibble_one_yields_regular_one_at_seat_zero() {
        let result = unpack_bids(0x0001);
        assert_eq!(result[0], Some(Bid::Regular(1)));
        assert_eq!(result[1], None);
        assert_eq!(result[2], None);
        assert_eq!(result[3], None);
    }

    #[test]
    fn unpack_low_nibble_thirteen_yields_regular_thirteen_at_seat_zero() {
        let result = unpack_bids(0x000D);
        assert_eq!(result[0], Some(Bid::Regular(13)));
    }

    #[test]
    fn unpack_low_nibble_fourteen_yields_nil_at_seat_zero() {
        let result = unpack_bids(0x000E);
        assert_eq!(result[0], Some(Bid::Nil));
    }

    #[test]
    fn unpack_low_nibble_fifteen_yields_blind_nil_at_seat_zero() {
        let result = unpack_bids(0x000F);
        assert_eq!(result[0], Some(Bid::BlindNil));
    }

    #[test]
    fn unpack_high_nibble_decodes_to_seat_three() {
        let result = unpack_bids(0x4000);
        assert_eq!(result[3], Some(Bid::Regular(4)));
        assert_eq!(result[0], None);
    }

    #[test]
    fn unpack_full_mixed_pattern() {
        // 0xF0E3: seat 0=3, seat 1=Nil(E), seat 2=None(0), seat 3=BlindNil(F)
        let result = unpack_bids(0xF0E3);
        assert_eq!(result[0], Some(Bid::Regular(3)));
        assert_eq!(result[1], Some(Bid::Nil));
        assert_eq!(result[2], None);
        assert_eq!(result[3], Some(Bid::BlindNil));
    }

    // ─── Round-trip property ──────────────────────────────

    #[test]
    fn pack_then_unpack_is_identity_for_assorted_inputs() {
        let cases: [[Option<Bid>; 4]; 5] = [
            [None, None, None, None],
            [Some(Bid::Regular(1)), Some(Bid::Regular(13)), Some(Bid::Nil), Some(Bid::BlindNil)],
            [Some(Bid::Regular(7)), None, Some(Bid::Regular(7)), None],
            [Some(Bid::Nil), Some(Bid::Nil), Some(Bid::Nil), Some(Bid::Nil)],
            [None, Some(Bid::Regular(5)), None, Some(Bid::Regular(8))],
        ];
        for case in &cases {
            let packed = pack_bids(*case).expect("test cases use only valid bids");
            assert_eq!(unpack_bids(packed), *case, "round trip failed for {:?}", case);
        }
    }

    // ─── Derived trait behaviors ──────────────────────────

    #[test]
    fn equal_bids_compare_equal() {
        assert_eq!(Bid::Regular(7), Bid::Regular(7));
        assert_eq!(Bid::Nil, Bid::Nil);
    }

    #[test]
    fn different_bid_kinds_compare_unequal() {
        assert_ne!(Bid::Nil, Bid::BlindNil);
        assert_ne!(Bid::Regular(5), Bid::Regular(6));
    }

    #[test]
    fn bids_are_copy_so_they_can_be_used_after_assignment() {
        let a = Bid::Regular(10);
        let b = a;
        assert_eq!(a, b);
    }
}
