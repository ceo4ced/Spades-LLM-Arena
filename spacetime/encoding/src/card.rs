//! Pure encoding for a single playing card.
//!
//! A `Card` is a `u8` index in the range 0..54:
//!   - 0..52: standard cards. `index = rank * 4 + suit`, where
//!            ranks 0..13 are 2..A and suits 0..4 are Clubs, Diamonds, Hearts, Spades.
//!   - 52: Little Joker
//!   - 53: Big Joker
//!
//! The inner `u8` is private so invalid cards are unrepresentable from outside
//! the module. All construction goes through `Card::new` (rank+suit) or
//! `Card::from_index` (raw index, returns `Option`).
//!
//! Card identity is variant-independent. Trump strength (which can promote 2♦,
//! 2♠, or jokers above the Ace of Spades) is computed by separate functions
//! that take both `Card` and `Variant` — see `strength.rs` and `legal.rs`.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Card(u8);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Rank {
    Two = 0,
    Three = 1,
    Four = 2,
    Five = 3,
    Six = 4,
    Seven = 5,
    Eight = 6,
    Nine = 7,
    Ten = 8,
    Jack = 9,
    Queen = 10,
    King = 11,
    Ace = 12,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Suit {
    Clubs = 0,
    Diamonds = 1,
    Hearts = 2,
    Spades = 3,
}

impl Card {
    pub const LITTLE_JOKER: Card = Card(52);
    pub const BIG_JOKER: Card = Card(53);

    pub const fn new(rank: Rank, suit: Suit) -> Card {
        Card((rank as u8) * 4 + (suit as u8))
    }

    pub const fn from_index(index: u8) -> Option<Card> {
        if index < 54 {
            Some(Card(index))
        } else {
            None
        }
    }

    pub const fn to_index(self) -> u8 {
        self.0
    }

    pub const fn is_joker(self) -> bool {
        self.0 >= 52
    }

    pub fn rank(self) -> Option<Rank> {
        if self.is_joker() {
            return None;
        }
        match self.0 / 4 {
            0 => Some(Rank::Two),
            1 => Some(Rank::Three),
            2 => Some(Rank::Four),
            3 => Some(Rank::Five),
            4 => Some(Rank::Six),
            5 => Some(Rank::Seven),
            6 => Some(Rank::Eight),
            7 => Some(Rank::Nine),
            8 => Some(Rank::Ten),
            9 => Some(Rank::Jack),
            10 => Some(Rank::Queen),
            11 => Some(Rank::King),
            12 => Some(Rank::Ace),
            _ => unreachable!("is_joker gate ensures self.0 < 52, so self.0 / 4 < 13"),
        }
    }

    pub fn suit(self) -> Option<Suit> {
        if self.is_joker() {
            return None;
        }
        match self.0 % 4 {
            0 => Some(Suit::Clubs),
            1 => Some(Suit::Diamonds),
            2 => Some(Suit::Hearts),
            3 => Some(Suit::Spades),
            _ => unreachable!("u8 % 4 is always 0..=3"),
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Card::new constructs from rank + suit ────────────

    #[test]
    fn new_two_of_clubs_has_index_zero() {
        let c = Card::new(Rank::Two, Suit::Clubs);
        assert_eq!(c.to_index(), 0);
    }

    #[test]
    fn new_two_of_spades_has_index_three() {
        let c = Card::new(Rank::Two, Suit::Spades);
        assert_eq!(c.to_index(), 3);
    }

    #[test]
    fn new_three_of_clubs_has_index_four() {
        let c = Card::new(Rank::Three, Suit::Clubs);
        assert_eq!(c.to_index(), 4);
    }

    #[test]
    fn new_ace_of_spades_has_index_fifty_one() {
        let c = Card::new(Rank::Ace, Suit::Spades);
        assert_eq!(c.to_index(), 51);
    }

    // ─── Card::from_index validates raw indices ───────────

    #[test]
    fn from_index_zero_decodes_to_two_of_clubs() {
        let c = Card::from_index(0).expect("0 is a valid card index");
        assert_eq!(c.rank(), Some(Rank::Two));
        assert_eq!(c.suit(), Some(Suit::Clubs));
    }

    #[test]
    fn from_index_fifty_one_decodes_to_ace_of_spades() {
        let c = Card::from_index(51).expect("51 is a valid card index");
        assert_eq!(c.rank(), Some(Rank::Ace));
        assert_eq!(c.suit(), Some(Suit::Spades));
    }

    #[test]
    fn from_index_fifty_two_is_the_little_joker_constant() {
        let c = Card::from_index(52).expect("52 is the little joker");
        assert_eq!(c, Card::LITTLE_JOKER);
    }

    #[test]
    fn from_index_fifty_three_is_the_big_joker_constant() {
        let c = Card::from_index(53).expect("53 is the big joker");
        assert_eq!(c, Card::BIG_JOKER);
    }

    #[test]
    fn from_index_fifty_four_is_rejected() {
        assert_eq!(Card::from_index(54), None);
    }

    #[test]
    fn from_index_max_u8_is_rejected() {
        assert_eq!(Card::from_index(u8::MAX), None);
    }

    // ─── Card::rank ────────────────────────────────────────

    #[test]
    fn rank_of_a_standard_card_returns_some() {
        assert_eq!(
            Card::new(Rank::King, Suit::Hearts).rank(),
            Some(Rank::King)
        );
    }

    #[test]
    fn rank_of_little_joker_is_none() {
        assert_eq!(Card::LITTLE_JOKER.rank(), None);
    }

    #[test]
    fn rank_of_big_joker_is_none() {
        assert_eq!(Card::BIG_JOKER.rank(), None);
    }

    // ─── Card::suit ────────────────────────────────────────

    #[test]
    fn suit_of_a_standard_card_returns_some() {
        assert_eq!(
            Card::new(Rank::Seven, Suit::Diamonds).suit(),
            Some(Suit::Diamonds)
        );
    }

    #[test]
    fn suit_of_little_joker_is_none() {
        assert_eq!(Card::LITTLE_JOKER.suit(), None);
    }

    #[test]
    fn suit_of_big_joker_is_none() {
        assert_eq!(Card::BIG_JOKER.suit(), None);
    }

    // ─── Card::is_joker ────────────────────────────────────

    #[test]
    fn standard_cards_are_not_jokers() {
        for i in 0u8..52 {
            let c = Card::from_index(i).expect("0..52 are valid standard cards");
            assert!(!c.is_joker(), "card index {} should not be a joker", i);
        }
    }

    #[test]
    fn little_joker_reports_as_joker() {
        assert!(Card::LITTLE_JOKER.is_joker());
    }

    #[test]
    fn big_joker_reports_as_joker() {
        assert!(Card::BIG_JOKER.is_joker());
    }

    // ─── Round-trip properties ─────────────────────────────

    #[test]
    fn from_index_then_to_index_is_identity_for_every_valid_card() {
        for i in 0u8..54 {
            let c = Card::from_index(i).expect("0..54 are valid");
            assert_eq!(c.to_index(), i, "round trip failed for index {}", i);
        }
    }

    #[test]
    fn new_then_rank_and_suit_recovers_inputs_for_every_standard_card() {
        let ranks = [
            Rank::Two, Rank::Three, Rank::Four, Rank::Five, Rank::Six, Rank::Seven,
            Rank::Eight, Rank::Nine, Rank::Ten, Rank::Jack, Rank::Queen, Rank::King,
            Rank::Ace,
        ];
        let suits = [Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades];
        for &r in &ranks {
            for &s in &suits {
                let c = Card::new(r, s);
                assert_eq!(c.rank(), Some(r), "rank lost for {:?} of {:?}", r, s);
                assert_eq!(c.suit(), Some(s), "suit lost for {:?} of {:?}", r, s);
            }
        }
    }

    // ─── Derived trait behaviors we depend on ──────────────

    #[test]
    fn equal_cards_compare_equal() {
        let a = Card::new(Rank::Queen, Suit::Hearts);
        let b = Card::from_index(a.to_index()).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn cards_are_copy_so_they_can_be_used_after_assignment() {
        let a = Card::new(Rank::Queen, Suit::Hearts);
        let b = a; // would move and invalidate `a` if Card were not Copy
        assert_eq!(a, b);
    }
}
