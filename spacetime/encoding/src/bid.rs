//! Bids and packed-bid encoding.
//!
//! A `Bid` is what one player commits to during the bidding phase:
//!   - `Regular(n)` — promise to win exactly `n` tricks, where `n` is 1..=13.
//!                     Available in all variants.
//!   - `Nil`         — promise to win zero tricks (sighted). Bonus +100 / -100.
//!                     Available in all variants.
//!   - `BlindNil`    — nil declared sight-unseen. Bonus +200 / -200.
//!                     Available in all variants.
//!   - `Blind(n)`    — bid n tricks sight-unseen, where n is 6..=13.
//!                     Score is doubled (n × 20). Available ONLY in JJA / JJDD;
//!                     `legal_bids` rejects it in Standard.
//!
//! Construction:
//!   - `Bid::regular(n)` — Some(Regular(n)) iff n is 1..=13
//!   - `Bid::blind(n)` — Some(Blind(n)) iff n is 6..=13
//!   - `Bid::Nil` and `Bid::BlindNil` — direct enum variants
//!
//! Packed encoding (8 bits per seat × 4 seats = 32 bits, fits in `u32`).
//! 8-bit-per-seat (instead of the original 4) because the bid space expanded
//! from 16 to ~24 distinct states, and 8-bit nibbles keep hex dumps readable.
//!
//! Per-seat byte layout:
//!   0          — not yet bid (sentinel — only valid mid-bidding-phase)
//!   1..=13     — Regular(N)
//!   14         — Nil
//!   15         — BlindNil
//!   16..=23    — Blind(N) where N = code − 10 (so Blind(6)=16, Blind(13)=23)
//!
//! Byte position: seat 0 in bits 0..=7, seat 1 in bits 8..=15, etc.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Bid {
    Regular(u8),
    Nil,
    BlindNil,
    Blind(u8),
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

    /// Smart constructor for a blind regular bid. Enforces the 6..=13 invariant.
    /// `Blind(N)` is only legal in JJA / JJDD — that constraint lives in
    /// `legal_bids`, not here. This constructor only validates the range.
    pub const fn blind(tricks: u8) -> Option<Bid> {
        if tricks >= 6 && tricks <= 13 {
            Some(Bid::Blind(tricks))
        } else {
            None
        }
    }

    /// How many tricks this bid commits to winning.
    /// `Regular(n)` and `Blind(n)` commit to n; `Nil` and `BlindNil` commit to zero.
    pub const fn tricks_committed(self) -> u8 {
        match self {
            Bid::Regular(n) | Bid::Blind(n) => n,
            Bid::Nil | Bid::BlindNil => 0,
        }
    }

    /// Whether this bid is any flavor of nil (sighted or blind).
    /// Note: `Blind(N)` is *not* nil — it's a blind regular bid.
    pub const fn is_nil(self) -> bool {
        matches!(self, Bid::Nil | Bid::BlindNil)
    }

    /// Whether this bid was declared sight-unseen (BlindNil or Blind).
    pub const fn is_blind(self) -> bool {
        matches!(self, Bid::BlindNil | Bid::Blind(_))
    }
}

/// Pack four optional bids (seats 0..=3) into a `u32`. Returns `None` if any
/// bid value is outside its valid range (1..=13 for Regular, 6..=13 for Blind).
/// Defense in depth against bypassing the smart constructors.
pub fn pack_bids(bids: [Option<Bid>; 4]) -> Option<u32> {
    let mut packed: u32 = 0;
    for seat in 0..4 {
        let byte: u32 = match bids[seat] {
            None => 0,
            Some(Bid::Regular(n)) if n >= 1 && n <= 13 => n as u32,
            Some(Bid::Regular(_)) => return None,
            Some(Bid::Nil) => 14,
            Some(Bid::BlindNil) => 15,
            Some(Bid::Blind(n)) if n >= 6 && n <= 13 => (n + 10) as u32,
            Some(Bid::Blind(_)) => return None,
        };
        packed |= byte << (seat * 8);
    }
    Some(packed)
}

/// Unpack a `u32` into four optional bids. Returns `None` if any byte contains
/// a value outside the valid encoding range (24..=255). Within 0..=23, every
/// value maps to a unique `Option<Bid>`.
pub fn unpack_bids(packed: u32) -> Option<[Option<Bid>; 4]> {
    let mut result: [Option<Bid>; 4] = [None; 4];
    for seat in 0..4 {
        let byte = ((packed >> (seat * 8)) & 0xFF) as u8;
        result[seat] = match byte {
            0 => None,
            n @ 1..=13 => Some(Bid::Regular(n)),
            14 => Some(Bid::Nil),
            15 => Some(Bid::BlindNil),
            n @ 16..=23 => Some(Bid::Blind(n - 10)),
            _ => return None,
        };
    }
    Some(result)
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

    // ─── Bid::blind smart constructor ─────────────────────

    #[test]
    fn blind_five_is_rejected() {
        assert_eq!(Bid::blind(5), None);
    }

    #[test]
    fn blind_six_is_accepted() {
        assert_eq!(Bid::blind(6), Some(Bid::Blind(6)));
    }

    #[test]
    fn blind_thirteen_is_accepted() {
        assert_eq!(Bid::blind(13), Some(Bid::Blind(13)));
    }

    #[test]
    fn blind_fourteen_is_rejected() {
        assert_eq!(Bid::blind(14), None);
    }

    #[test]
    fn blind_zero_is_rejected() {
        assert_eq!(Bid::blind(0), None);
    }

    #[test]
    fn blind_max_u8_is_rejected() {
        assert_eq!(Bid::blind(u8::MAX), None);
    }

    #[test]
    fn blind_constructor_accepts_every_value_in_six_through_thirteen() {
        for n in 6u8..=13 {
            assert_eq!(Bid::blind(n), Some(Bid::Blind(n)));
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
    fn blind_bid_commits_to_its_value() {
        for n in 6u8..=13 {
            assert_eq!(Bid::Blind(n).tricks_committed(), n);
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

    #[test]
    fn blind_regular_bid_is_not_nil() {
        // Blind(N) is a blind regular bid, not a nil.
        assert!(!Bid::Blind(7).is_nil());
    }

    // ─── Bid::is_blind ────────────────────────────────────

    #[test]
    fn regular_bid_is_not_blind() {
        assert!(!Bid::Regular(4).is_blind());
    }

    #[test]
    fn nil_bid_is_not_blind() {
        // Sighted nil — not declared sight-unseen.
        assert!(!Bid::Nil.is_blind());
    }

    #[test]
    fn blind_nil_bid_is_blind() {
        assert!(Bid::BlindNil.is_blind());
    }

    #[test]
    fn blind_regular_bid_is_blind() {
        assert!(Bid::Blind(8).is_blind());
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
    fn pack_regular_bid_at_seat_three_occupies_high_byte() {
        // Seat 3 bids 4 → high byte = 0x04 in bits 24..=31
        assert_eq!(
            pack_bids([None, None, None, Some(Bid::Regular(4))]),
            Some(0x0400_0000)
        );
    }

    #[test]
    fn pack_four_regular_bids_in_separate_bytes() {
        // Seats 0..=3 bid 1, 2, 3, 4 → bytes 0x04_03_02_01
        assert_eq!(
            pack_bids([
                Some(Bid::Regular(1)),
                Some(Bid::Regular(2)),
                Some(Bid::Regular(3)),
                Some(Bid::Regular(4)),
            ]),
            Some(0x0403_0201)
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
    fn pack_max_regular_bids_at_every_seat_yields_oddoddodd() {
        // All seats bid 13 → every byte = 0x0D
        assert_eq!(
            pack_bids([
                Some(Bid::Regular(13)),
                Some(Bid::Regular(13)),
                Some(Bid::Regular(13)),
                Some(Bid::Regular(13)),
            ]),
            Some(0x0D0D_0D0D)
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
                Some(Bid::Regular(3)),  // seat 0 → 0x03
                Some(Bid::Nil),         // seat 1 → 0x0E
                None,                   // seat 2 → 0x00
                Some(Bid::BlindNil),    // seat 3 → 0x0F
            ]),
            Some(0x0F00_0E03)
        );
    }

    // ─── pack_bids — Blind variant (JJA/JJDD) ────────────

    #[test]
    fn pack_blind_six_at_seat_zero_uses_code_sixteen() {
        // Blind(6) → code = 6 + 10 = 16 = 0x10
        assert_eq!(
            pack_bids([Some(Bid::Blind(6)), None, None, None]),
            Some(0x0000_0010)
        );
    }

    #[test]
    fn pack_blind_thirteen_at_seat_zero_uses_code_twenty_three() {
        // Blind(13) → code = 13 + 10 = 23 = 0x17
        assert_eq!(
            pack_bids([Some(Bid::Blind(13)), None, None, None]),
            Some(0x0000_0017)
        );
    }

    #[test]
    fn pack_blind_below_minimum_returns_none() {
        // Blind(5) is invalid — minimum is 6.
        assert_eq!(
            pack_bids([Some(Bid::Blind(5)), None, None, None]),
            None
        );
    }

    #[test]
    fn pack_blind_above_max_returns_none() {
        assert_eq!(
            pack_bids([Some(Bid::Blind(14)), None, None, None]),
            None
        );
    }

    // ─── unpack_bids ──────────────────────────────────────

    #[test]
    fn unpack_zero_yields_all_none() {
        assert_eq!(unpack_bids(0x0000_0000), Some([None, None, None, None]));
    }

    #[test]
    fn unpack_byte_one_yields_regular_one_at_seat_zero() {
        let result = unpack_bids(0x0000_0001).unwrap();
        assert_eq!(result[0], Some(Bid::Regular(1)));
        assert_eq!(result[1], None);
        assert_eq!(result[2], None);
        assert_eq!(result[3], None);
    }

    #[test]
    fn unpack_byte_thirteen_yields_regular_thirteen_at_seat_zero() {
        let result = unpack_bids(0x0000_000D).unwrap();
        assert_eq!(result[0], Some(Bid::Regular(13)));
    }

    #[test]
    fn unpack_byte_fourteen_yields_nil_at_seat_zero() {
        let result = unpack_bids(0x0000_000E).unwrap();
        assert_eq!(result[0], Some(Bid::Nil));
    }

    #[test]
    fn unpack_byte_fifteen_yields_blind_nil_at_seat_zero() {
        let result = unpack_bids(0x0000_000F).unwrap();
        assert_eq!(result[0], Some(Bid::BlindNil));
    }

    #[test]
    fn unpack_byte_sixteen_yields_blind_six_at_seat_zero() {
        let result = unpack_bids(0x0000_0010).unwrap();
        assert_eq!(result[0], Some(Bid::Blind(6)));
    }

    #[test]
    fn unpack_byte_twenty_three_yields_blind_thirteen_at_seat_zero() {
        let result = unpack_bids(0x0000_0017).unwrap();
        assert_eq!(result[0], Some(Bid::Blind(13)));
    }

    #[test]
    fn unpack_invalid_byte_returns_none() {
        // Codes 24..=255 are not valid bid encodings.
        assert_eq!(unpack_bids(0x0000_0018), None);
        assert_eq!(unpack_bids(0x0000_00FF), None);
    }

    #[test]
    fn unpack_high_byte_decodes_to_seat_three() {
        let result = unpack_bids(0x0400_0000).unwrap();
        assert_eq!(result[3], Some(Bid::Regular(4)));
        assert_eq!(result[0], None);
    }

    #[test]
    fn unpack_full_mixed_pattern() {
        // 0x0F00_0E03: seat 0=3, seat 1=Nil(0x0E), seat 2=None(0), seat 3=BlindNil(0x0F)
        let result = unpack_bids(0x0F00_0E03).unwrap();
        assert_eq!(result[0], Some(Bid::Regular(3)));
        assert_eq!(result[1], Some(Bid::Nil));
        assert_eq!(result[2], None);
        assert_eq!(result[3], Some(Bid::BlindNil));
    }

    // ─── Round-trip property ──────────────────────────────

    #[test]
    fn pack_then_unpack_is_identity_for_assorted_inputs() {
        let cases: [[Option<Bid>; 4]; 6] = [
            [None, None, None, None],
            [Some(Bid::Regular(1)), Some(Bid::Regular(13)), Some(Bid::Nil), Some(Bid::BlindNil)],
            [Some(Bid::Regular(7)), None, Some(Bid::Regular(7)), None],
            [Some(Bid::Nil), Some(Bid::Nil), Some(Bid::Nil), Some(Bid::Nil)],
            [None, Some(Bid::Regular(5)), None, Some(Bid::Regular(8))],
            [Some(Bid::Blind(6)), Some(Bid::Blind(13)), Some(Bid::BlindNil), Some(Bid::Regular(4))],
        ];
        for case in &cases {
            let packed = pack_bids(*case).expect("test cases use only valid bids");
            assert_eq!(unpack_bids(packed), Some(*case), "round trip failed for {:?}", case);
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
