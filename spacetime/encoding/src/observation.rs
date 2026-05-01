//! Type-level information isolation per seat.
//!
//! `SeatObservation` is the canonical "what one player knows" representation.
//! It has fields *only* for information that seat would know in the actual game:
//!   - The seat's own hand (private)
//!   - All public state (bids, completed tricks, current trick plays, scores)
//!   - The legal actions available *if* it's their turn
//!
//! It does **not** have fields for:
//!   - Other seats' hands
//!   - Other seats' private reasoning
//!   - Chat messages with audience the seat couldn't hear (chat filtering is
//!     handled in the SpacetimeDB module crate, not here)
//!
//! `seat_observation(...)` is the only constructor — and a future careless
//! caller can't leak other-seat data, because the type doesn't represent it.

use crate::bid::Bid;
use crate::card_set::CardSet;
use crate::house_rules::HouseRules;
use crate::legal::{legal_bids, legal_plays};
use crate::replay::{CompletedTrick, HandPhase, HandState, TrickPlay};
use crate::variant::Variant;

/// A seat's view of the game state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeatObservation {
    // ─── Identity ────────────────────────────────────────
    pub seat: u8,
    pub partner_seat: u8,

    // ─── Game configuration (public) ─────────────────────
    pub variant: Variant,
    pub house_rules: HouseRules,
    pub hand_number: u8,
    pub trick_number: u8,
    pub dealer: u8,

    // ─── PRIVATE — this seat's hand only ─────────────────
    pub your_hand: CardSet,

    // ─── PUBLIC — known to everyone ──────────────────────
    pub bids: [Option<Bid>; 4],
    pub tricks_won: [u8; 4],
    pub team1_score: i16,
    pub team2_score: i16,
    pub team1_bags: u8,
    pub team2_bags: u8,
    pub completed_tricks: Vec<CompletedTrick>,
    pub current_trick_plays: Vec<TrickPlay>,
    pub current_turn: u8,
    pub spades_broken: bool,
    pub phase: HandPhase,

    // ─── For this seat's decision ────────────────────────
    pub legal_actions: LegalActions,
}

/// What this seat can legally do right now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LegalActions {
    Bids(Vec<Bid>),
    Plays(CardSet),
    /// Some other seat's turn.
    NotMyTurn,
    /// The hand is complete; no more actions.
    HandComplete,
}

/// Construct a `SeatObservation` from the canonical `HandState` plus game-level context.
///
/// This is the **only** path to building an observation. Any prompt sent to a
/// model is built from a `SeatObservation` — and the type guarantees no other-seat
/// information is exposed.
pub fn seat_observation(
    state: &HandState,
    seat: u8,
    hand_number: u8,
    team1_score: i16,
    team2_score: i16,
    team1_bags: u8,
    team2_bags: u8,
) -> SeatObservation {
    let partner_seat = (seat + 2) % 4;
    let your_hand = state.hands_remaining[seat as usize];
    let trick_number = (state.completed_tricks.len() + 1) as u8;

    let legal_actions = if state.phase == HandPhase::Complete {
        LegalActions::HandComplete
    } else if state.current_turn != seat {
        LegalActions::NotMyTurn
    } else {
        match state.phase {
            HandPhase::Bidding => LegalActions::Bids(legal_bids(
                seat,
                state.bids,
                state.variant,
                state.house_rules,
            )),
            HandPhase::Playing => {
                let is_first_trick = state.completed_tricks.is_empty();
                LegalActions::Plays(legal_plays(
                    your_hand,
                    state.current_trick_led_suit,
                    is_first_trick,
                    state.spades_broken,
                    state.variant,
                    state.house_rules,
                ))
            }
            HandPhase::Complete => {
                // Already handled above, but Rust requires exhaustive match.
                LegalActions::HandComplete
            }
        }
    };

    SeatObservation {
        seat,
        partner_seat,
        variant: state.variant,
        house_rules: state.house_rules,
        hand_number,
        trick_number,
        dealer: state.dealer,
        your_hand,
        bids: state.bids,
        tricks_won: state.tricks_won,
        team1_score,
        team2_score,
        team1_bags,
        team2_bags,
        completed_tricks: state.completed_tricks.clone(),
        current_trick_plays: state.current_trick.clone(),
        current_turn: state.current_turn,
        spades_broken: state.spades_broken,
        phase: state.phase,
        legal_actions,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{Card, Rank, Suit};
    use crate::house_rules::SpadesLeadPolicy;
    use crate::replay::{apply_bid, apply_play, initial_hand_state};

    fn standard_house() -> HouseRules {
        HouseRules {
            spades_lead_policy: SpadesLeadPolicy::MustBeBroken,
            minimum_team_bid: 0,
        }
    }

    fn deal_for_test() -> [CardSet; 4] {
        let cards: Vec<Card> = Variant::Standard.deck().iter().collect();
        let mut hands = [CardSet::empty(); 4];
        for (i, c) in cards.iter().enumerate() {
            let seat = i / 13;
            if seat < 4 {
                hands[seat] = hands[seat].insert(*c);
            }
        }
        hands
    }

    fn fresh_state() -> HandState {
        initial_hand_state(deal_for_test(), 0, Variant::Standard, standard_house())
    }

    // ─── Privacy / isolation ─────────────────────────────

    #[test]
    fn observation_for_seat_zero_includes_seat_zeros_hand() {
        let state = fresh_state();
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.your_hand, state.hands_remaining[0]);
    }

    #[test]
    fn observation_for_seat_one_does_not_expose_seat_zeros_hand() {
        // Sanity: the SeatObservation type has no field for other seats' hands.
        // This test demonstrates that the only hand visible is the asking seat's.
        let state = fresh_state();
        let obs = seat_observation(&state, 1, 1, 0, 0, 0, 0);
        assert_eq!(obs.your_hand, state.hands_remaining[1]);
        // Seat 0's hand is *not* equal to seat 1's view — by construction.
        assert_ne!(obs.your_hand, state.hands_remaining[0]);
    }

    #[test]
    fn observation_for_seat_two_returns_correct_partner() {
        let state = fresh_state();
        let obs = seat_observation(&state, 2, 1, 0, 0, 0, 0);
        assert_eq!(obs.partner_seat, 0);
    }

    #[test]
    fn observation_partner_seat_formula_is_seat_plus_two_mod_four() {
        let state = fresh_state();
        for seat in 0u8..4 {
            let obs = seat_observation(&state, seat, 1, 0, 0, 0, 0);
            assert_eq!(obs.partner_seat, (seat + 2) % 4);
        }
    }

    // ─── Public state pass-through ───────────────────────

    #[test]
    fn observation_includes_all_bids() {
        let mut state = fresh_state();
        state = apply_bid(state, 1, Bid::Regular(4)).unwrap();
        state = apply_bid(state, 2, Bid::Nil).unwrap();
        let obs = seat_observation(&state, 3, 1, 0, 0, 0, 0);
        assert_eq!(obs.bids[1], Some(Bid::Regular(4)));
        assert_eq!(obs.bids[2], Some(Bid::Nil));
        assert_eq!(obs.bids[0], None);
        assert_eq!(obs.bids[3], None);
    }

    #[test]
    fn observation_carries_game_level_scores() {
        let state = fresh_state();
        let obs = seat_observation(&state, 0, 3, 250, 175, 4, 7);
        assert_eq!(obs.hand_number, 3);
        assert_eq!(obs.team1_score, 250);
        assert_eq!(obs.team2_score, 175);
        assert_eq!(obs.team1_bags, 4);
        assert_eq!(obs.team2_bags, 7);
    }

    #[test]
    fn observation_includes_dealer_position() {
        let state = initial_hand_state(deal_for_test(), 2, Variant::Standard, standard_house());
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.dealer, 2);
    }

    #[test]
    fn observation_phase_matches_state_phase() {
        let state = fresh_state();
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.phase, HandPhase::Bidding);
    }

    #[test]
    fn observation_trick_number_starts_at_one() {
        let state = fresh_state();
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.trick_number, 1);
    }

    // ─── Legal actions ────────────────────────────────────

    #[test]
    fn observation_legal_actions_in_bidding_for_my_turn_returns_bids() {
        let state = fresh_state();
        let obs = seat_observation(&state, 1, 1, 0, 0, 0, 0); // seat 1 is the first bidder
        match obs.legal_actions {
            LegalActions::Bids(bids) => {
                assert_eq!(bids.len(), 15); // Regular(1..=13) + Nil + BlindNil
            }
            _ => panic!("expected Bids variant"),
        }
    }

    #[test]
    fn observation_legal_actions_when_not_my_turn_returns_not_my_turn() {
        let state = fresh_state();
        // Seat 0 is dealer, seat 1 bids first — so seat 0 is not on turn yet.
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.legal_actions, LegalActions::NotMyTurn);
    }

    #[test]
    fn observation_legal_actions_during_playing_returns_plays() {
        // Drive to playing phase.
        let mut state = fresh_state();
        for (seat, val) in [(1, 3), (2, 3), (3, 3), (0, 4)] {
            state = apply_bid(state, seat, Bid::Regular(val)).unwrap();
        }
        // current_turn now = opener (whoever has 2♣)
        let opener = state.current_turn;
        let obs = seat_observation(&state, opener, 1, 0, 0, 0, 0);
        match obs.legal_actions {
            LegalActions::Plays(plays) => {
                // First trick: must play 2♣ — singleton.
                assert_eq!(plays.len(), 1);
                assert!(plays.contains(Card::new(Rank::Two, Suit::Clubs)));
            }
            _ => panic!("expected Plays variant"),
        }
    }

    // ─── Trick state pass-through ────────────────────────

    #[test]
    fn observation_includes_completed_tricks() {
        // Drive through bidding + 1 full trick.
        let mut state = fresh_state();
        for (seat, val) in [(1, 3), (2, 3), (3, 3), (0, 4)] {
            state = apply_bid(state, seat, Bid::Regular(val)).unwrap();
        }
        let opener = state.current_turn;
        state = apply_play(state, opener, Card::new(Rank::Two, Suit::Clubs)).unwrap();
        // Have other seats follow with their lowest club.
        for _ in 0..3 {
            let seat = state.current_turn;
            let club = state.hands_remaining[seat as usize]
                .iter()
                .find(|c| c.suit() == Some(Suit::Clubs))
                .unwrap();
            state = apply_play(state, seat, club).unwrap();
        }
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.completed_tricks.len(), 1);
        assert_eq!(obs.trick_number, 2); // about to start trick 2
    }

    #[test]
    fn observation_includes_current_trick_plays_in_progress() {
        let mut state = fresh_state();
        for (seat, val) in [(1, 3), (2, 3), (3, 3), (0, 4)] {
            state = apply_bid(state, seat, Bid::Regular(val)).unwrap();
        }
        let opener = state.current_turn;
        state = apply_play(state, opener, Card::new(Rank::Two, Suit::Clubs)).unwrap();
        let obs = seat_observation(&state, 0, 1, 0, 0, 0, 0);
        assert_eq!(obs.current_trick_plays.len(), 1);
        assert_eq!(obs.current_trick_plays[0].card, Card::new(Rank::Two, Suit::Clubs));
    }
}
