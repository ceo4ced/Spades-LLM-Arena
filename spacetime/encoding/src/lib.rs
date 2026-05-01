//! Pure bit-packed encoding for Spades game state.
//!
//! This crate has no I/O, no async, and no SpacetimeDB dependencies. Every
//! function is pure: same inputs → same outputs, no side effects. That
//! discipline lets us unit-test the entire encoding layer with `cargo test`
//! in milliseconds, without spinning up a database.
//!
//! Modules are added incrementally, one at a time, behind passing tests.

pub mod bid;
pub mod card;
pub mod card_set;
pub mod hand;
pub mod house_rules;
pub mod legal;
pub mod observation;
pub mod replay;
pub mod score;
pub mod strength;
pub mod variant;
