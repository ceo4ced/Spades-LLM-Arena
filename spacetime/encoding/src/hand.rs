//! Hand-level packing helpers.
//!
//! Currently: tricks-won packing. Each player can win 0..=13 tricks per hand
//! (a single hand has exactly 13 tricks, but they can be split arbitrarily
//! among the 4 seats). 4 bits per seat × 4 seats = 16 bits → fits in `u16`.
//!
//! Layout: seat 0 in bits 0..=3, seat 1 in bits 4..=7, seat 2 in bits 8..=11,
//! seat 3 in bits 12..=15.
//!
//! Both `pack_tricks_won` and `unpack_tricks_won` are strict — they return
//! `None` if any per-seat count is outside 0..=13. Values 14 and 15 are
//! representable in 4 bits but cannot occur in a well-formed Spades hand,
//! so we reject them rather than silently propagate corrupt data.

/// Pack four per-seat trick counts into a `u16`.
/// Returns `None` if any count exceeds 13 (the maximum legal value).
pub fn pack_tricks_won(tricks: [u8; 4]) -> Option<u16> {
    let mut packed: u16 = 0;
    for seat in 0..4 {
        let count = tricks[seat];
        if count > 13 {
            return None;
        }
        packed |= (count as u16) << (seat * 4);
    }
    Some(packed)
}

/// Unpack a `u16` into four per-seat trick counts.
/// Returns `None` if any 4-bit nibble exceeds 13 (corrupt data).
pub fn unpack_tricks_won(packed: u16) -> Option<[u8; 4]> {
    let mut result = [0u8; 4];
    for seat in 0..4 {
        let nibble = ((packed >> (seat * 4)) & 0xF) as u8;
        if nibble > 13 {
            return None;
        }
        result[seat] = nibble;
    }
    Some(result)
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── pack_tricks_won ──────────────────────────────────

    #[test]
    fn pack_zeros_yields_zero() {
        assert_eq!(pack_tricks_won([0, 0, 0, 0]), Some(0x0000));
    }

    #[test]
    fn pack_one_at_seat_zero_occupies_low_nibble() {
        assert_eq!(pack_tricks_won([1, 0, 0, 0]), Some(0x0001));
    }

    #[test]
    fn pack_three_at_seat_three_occupies_high_nibble() {
        assert_eq!(pack_tricks_won([0, 0, 0, 3]), Some(0x3000));
    }

    #[test]
    fn pack_max_at_every_seat_yields_dddd() {
        assert_eq!(pack_tricks_won([13, 13, 13, 13]), Some(0xDDDD));
    }

    #[test]
    fn pack_typical_full_hand_distribution() {
        // Sum of 13 — typical end-of-hand distribution.
        // Seats: [3, 4, 3, 3] → nibbles 0x3343 (seat 3 in high nibble).
        assert_eq!(pack_tricks_won([3, 4, 3, 3]), Some(0x3343));
    }

    #[test]
    fn pack_value_fourteen_returns_none() {
        // 14 fits in 4 bits but is not a legal trick count (max 13/hand).
        assert_eq!(pack_tricks_won([14, 0, 0, 0]), None);
    }

    #[test]
    fn pack_value_fifteen_returns_none() {
        assert_eq!(pack_tricks_won([0, 15, 0, 0]), None);
    }

    #[test]
    fn pack_max_u8_returns_none() {
        assert_eq!(pack_tricks_won([0, 0, u8::MAX, 0]), None);
    }

    #[test]
    fn pack_invalid_at_high_seat_returns_none() {
        assert_eq!(pack_tricks_won([0, 0, 0, 14]), None);
    }

    // ─── unpack_tricks_won ────────────────────────────────

    #[test]
    fn unpack_zero_yields_all_zeros() {
        assert_eq!(unpack_tricks_won(0x0000), Some([0, 0, 0, 0]));
    }

    #[test]
    fn unpack_low_nibble_seven_yields_seven_at_seat_zero() {
        assert_eq!(unpack_tricks_won(0x0007), Some([7, 0, 0, 0]));
    }

    #[test]
    fn unpack_high_nibble_three_yields_three_at_seat_three() {
        assert_eq!(unpack_tricks_won(0x3000), Some([0, 0, 0, 3]));
    }

    #[test]
    fn unpack_thirteen_thirteen_thirteen_thirteen_yields_max_array() {
        assert_eq!(unpack_tricks_won(0xDDDD), Some([13, 13, 13, 13]));
    }

    #[test]
    fn unpack_full_mixed_pattern() {
        // 0x3343 → [3, 4, 3, 3] (seat 0 in low nibble).
        assert_eq!(unpack_tricks_won(0x3343), Some([3, 4, 3, 3]));
    }

    #[test]
    fn unpack_nibble_fourteen_returns_none() {
        // Low nibble = 14 — not a valid trick count.
        assert_eq!(unpack_tricks_won(0x000E), None);
    }

    #[test]
    fn unpack_nibble_fifteen_returns_none() {
        assert_eq!(unpack_tricks_won(0x000F), None);
    }

    #[test]
    fn unpack_invalid_nibble_at_high_position_returns_none() {
        assert_eq!(unpack_tricks_won(0xE000), None);
    }

    #[test]
    fn unpack_one_invalid_nibble_among_valid_returns_none() {
        // 0x130E — seat 0 nibble = 0xE (invalid), others valid.
        assert_eq!(unpack_tricks_won(0x130E), None);
    }

    // ─── Round-trip ───────────────────────────────────────

    #[test]
    fn pack_then_unpack_is_identity_for_assorted_inputs() {
        let cases: [[u8; 4]; 6] = [
            [0, 0, 0, 0],
            [13, 0, 0, 0],
            [0, 13, 0, 0],
            [0, 0, 0, 13],
            [3, 4, 3, 3],   // typical hand split
            [13, 13, 13, 13],
        ];
        for case in &cases {
            let packed = pack_tricks_won(*case).expect("test cases use only valid counts");
            assert_eq!(unpack_tricks_won(packed), Some(*case),
                "round trip failed for {:?}", case);
        }
    }
}
