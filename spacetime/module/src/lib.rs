//! SpacetimeDB module for the Spades LLM Arena.
//!
//! Persists game records (tournaments, games, hands, decisions, chat,
//! accusations) and exposes reducers that clients call to record events.
//!
//! All tables are `public` so the TypeScript client can subscribe to them
//! for live dashboards. Field types stay primitive (`u8`/`u16`/`u32`/`u64`/
//! `i16`/`String`/`Vec<u8>`/`Option<...>`) so the schema is independent of
//! the `encoding` crate's enum types — clients use `Variant::from_u8` etc.
//! at the boundary when interpreting these values.

use spacetimedb::{reducer, table, ReducerContext, SpacetimeType, Table};
use spacetimedb::Timestamp;

// ─── Tables ──────────────────────────────────────────────────────────────

#[table(accessor =model, public)]
pub struct Model {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub name: String,
    /// 0 = random, 1 = heuristic, 2 = LLM, 3 = iterate, 4 = human
    pub kind: u8,
    pub version: String,
    pub introduced_at: Timestamp,
}

#[table(accessor =tournament, public)]
pub struct Tournament {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub name: String,
    /// 0 = round_robin, 1 = single_elim, 2 = double_elim
    pub format: u8,
    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub champion_team: Option<String>,
}

#[table(accessor =game, public)]
pub struct Game {
    #[primary_key]
    #[auto_inc]
    pub id: u64,

    /// Bumped when the bit-packed encoding changes; lets old rows be decoded
    /// by a version-aware reader.
    pub schema_version: u8,

    /// `None` = mini-game (non-tournament).
    pub tournament_id: Option<u64>,

    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub target_score: u16,

    /// `Variant`: 0 = Standard, 1 = JJA, 2 = JJDD.
    pub variant: u8,

    // ── Team rosters (FK → Model) ────────────────────────
    pub team1_seat0_model_id: u32,
    pub team1_seat2_model_id: u32,
    pub team2_seat1_model_id: u32,
    pub team2_seat3_model_id: u32,

    // ── Final scores ────────────────────────────────────
    pub team1_score: i16,
    pub team2_score: i16,
    pub team1_bags: u8,
    pub team2_bags: u8,
    /// 1 or 2; 0 = unfinished.
    pub winner_team: u8,
    pub rng_seed: u64,

    // ── Cheating policy (per-game) ──────────────────────
    pub allow_renege: bool,
    /// `ChatPolicy`: 0 = None, 1 = PublicOnly, 2 = Partner, 3 = All.
    pub chat_policy: u8,
    /// `PromptCheatingMode`: 0 = Silent, 1 = Permissive, 2 = Encouraged.
    pub prompt_cheating_mode: u8,
    pub prompt_for_detection: bool,
    pub announce_detected_cheats: bool,
    pub agent_detection_quorum: bool,
    /// `CheatConsequence::kind`: 0 = LogOnly, 1 = HandPenalty, 2 = GameForfeit.
    pub cheat_consequence_kind: u8,
    /// Penalty value when `cheat_consequence_kind == HandPenalty`.
    pub cheat_consequence_value: i16,

    // ── House rules (per-game) ──────────────────────────
    /// `SpadesLeadPolicy`: 0 = MustBeBroken, 1 = AlwaysAllowed.
    pub spades_lead_policy: u8,
    /// 0 disables the team-bid floor.
    pub minimum_team_bid: u8,
}

#[table(accessor =hand, public, index(accessor =idx_game, btree(columns = [game_id])))]
pub struct Hand {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub game_id: u64,
    pub hand_number: u8,
    pub dealer_seat: u8,
    pub deal_seat0: u64,
    pub deal_seat1: u64,
    pub deal_seat2: u64,
    pub deal_seat3: u64,
    /// 4 seats × 8 bits — see `encoding::bid::pack_bids`.
    pub bids_packed: u32,
    /// 4 seats × 4 bits — see `encoding::hand::pack_tricks_won`.
    pub tricks_won_packed: u16,
    pub team1_score_delta: i16,
    pub team2_score_delta: i16,
}

#[table(
    accessor =decision,
    public,
    index(accessor =idx_game, btree(columns = [game_id])),
    index(accessor =idx_hand, btree(columns = [hand_id])),
    index(accessor =idx_model, btree(columns = [model_id]))
)]
pub struct Decision {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub game_id: u64,
    pub hand_id: u64,
    pub model_id: u32,
    /// 0..56 within the hand.
    pub decision_index: u16,
    pub seat: u8,
    /// 0 = bid, 1 = play.
    pub kind: u8,
    /// Bid encoding (1..=23) OR card index (0..=53). See encoding crate.
    pub action: u8,
    /// Bitmask of legal actions per the rules.
    pub legal_mask: u64,
    /// Small denormalized state for fast filtering (scores, bags, trick number, etc.).
    pub fingerprint: u64,
    pub latency_ms: u16,

    // ── Cheating annotations ────────────────────────────
    /// 0 = legal/honest, 1 = renege (engine-detected).
    pub engine_cheat_kind: u8,
    /// 0 = none, 1 = intentional_renege (agent-reported).
    pub self_reported_cheat: u8,
}

#[table(accessor =reasoning, public)]
pub struct Reasoning {
    #[primary_key]
    pub decision_id: u64,
    pub text_zstd: Vec<u8>,
}

#[table(
    accessor =communication,
    public,
    index(accessor =idx_game, btree(columns = [game_id])),
    index(accessor =idx_hand, btree(columns = [hand_id]))
)]
pub struct Communication {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub game_id: u64,
    pub hand_id: u64,
    pub seat: u8,
    pub timestamp: Timestamp,
    /// 0 = bidding, 1 = playing, 2 = between_hands
    pub phase: u8,
    /// 0 = public, 1 = partner_only, 2 = cross_table_target
    pub audience: u8,
    pub target_seat: Option<u8>,
    pub text_zstd: Vec<u8>,
    pub referenced_card: Option<u8>,
    /// 0 = honest, 1 = lie_about_hand, 2 = cross_table_signal, 3 = encoded_signal
    pub self_reported_cheat: u8,
    pub engine_detected_lie: bool,
}

#[table(
    accessor =accusation,
    public,
    index(accessor =idx_game, btree(columns = [game_id]))
)]
pub struct Accusation {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub game_id: u64,
    pub accuser_seat: u8,
    pub accused_seat: u8,
    pub timestamp: Timestamp,
    pub accused_decision_id: Option<u64>,
    pub accused_communication_id: Option<u64>,
    /// 0..=100 confidence percentage.
    pub confidence: u8,
    pub reasoning_zstd: Vec<u8>,
}

// ─── Reducers ────────────────────────────────────────────────────────────

/// Register a new model/agent. Called once per agent type before games can
/// reference it. Returns the new model id implicitly (auto_inc).
#[reducer]
pub fn register_model(
    ctx: &ReducerContext,
    name: String,
    kind: u8,
    version: String,
) -> Result<(), String> {
    ctx.db.model().insert(Model {
        id: 0,
        name,
        kind,
        version,
        introduced_at: ctx.timestamp,
    });
    Ok(())
}

/// Input bundle for `record_decision`. Bundled into a single `SpacetimeType`
/// argument because the field count is large enough that positional params
/// would be error-prone for clients to fill in.
#[derive(SpacetimeType, Clone, Debug)]
pub struct DecisionInput {
    pub game_id: u64,
    pub hand_id: u64,
    pub model_id: u32,
    pub decision_index: u16,
    pub seat: u8,
    pub kind: u8,
    pub action: u8,
    pub legal_mask: u64,
    pub fingerprint: u64,
    pub latency_ms: u16,
    pub engine_cheat_kind: u8,
    pub self_reported_cheat: u8,
}

/// Record one bid or play action. Called by the engine immediately after
/// each agent commits a decision.
#[reducer]
pub fn record_decision(ctx: &ReducerContext, input: DecisionInput) -> Result<(), String> {
    ctx.db.decision().insert(Decision {
        id: 0,
        game_id: input.game_id,
        hand_id: input.hand_id,
        model_id: input.model_id,
        decision_index: input.decision_index,
        seat: input.seat,
        kind: input.kind,
        action: input.action,
        legal_mask: input.legal_mask,
        fingerprint: input.fingerprint,
        latency_ms: input.latency_ms,
        engine_cheat_kind: input.engine_cheat_kind,
        self_reported_cheat: input.self_reported_cheat,
    });
    Ok(())
}

/// Attach the agent's reasoning text to a decision row. Sparse — only
/// LLM agents typically write here.
#[reducer]
pub fn record_reasoning(
    ctx: &ReducerContext,
    decision_id: u64,
    text_zstd: Vec<u8>,
) -> Result<(), String> {
    ctx.db.reasoning().insert(Reasoning {
        decision_id,
        text_zstd,
    });
    Ok(())
}

// ─── Tournament reducers ────────────────────────────────

#[reducer]
pub fn start_tournament(
    ctx: &ReducerContext,
    name: String,
    format: u8,
) -> Result<(), String> {
    ctx.db.tournament().insert(Tournament {
        id: 0,
        name,
        format,
        started_at: ctx.timestamp,
        completed_at: None,
        champion_team: None,
    });
    Ok(())
}

#[reducer]
pub fn complete_tournament(
    ctx: &ReducerContext,
    id: u64,
    champion_team: String,
) -> Result<(), String> {
    let row = ctx
        .db
        .tournament()
        .id()
        .find(id)
        .ok_or_else(|| format!("tournament {} not found", id))?;
    ctx.db.tournament().id().update(Tournament {
        completed_at: Some(ctx.timestamp),
        champion_team: Some(champion_team),
        ..row
    });
    Ok(())
}

// ─── Game reducers ──────────────────────────────────────

#[derive(SpacetimeType, Clone, Debug)]
pub struct GameStartInput {
    pub schema_version: u8,
    pub tournament_id: Option<u64>,
    pub target_score: u16,
    pub variant: u8,
    pub team1_seat0_model_id: u32,
    pub team1_seat2_model_id: u32,
    pub team2_seat1_model_id: u32,
    pub team2_seat3_model_id: u32,
    pub rng_seed: u64,
    // Cheating policy
    pub allow_renege: bool,
    pub chat_policy: u8,
    pub prompt_cheating_mode: u8,
    pub prompt_for_detection: bool,
    pub announce_detected_cheats: bool,
    pub agent_detection_quorum: bool,
    pub cheat_consequence_kind: u8,
    pub cheat_consequence_value: i16,
    // House rules
    pub spades_lead_policy: u8,
    pub minimum_team_bid: u8,
}

#[reducer]
pub fn start_game(ctx: &ReducerContext, input: GameStartInput) -> Result<(), String> {
    ctx.db.game().insert(Game {
        id: 0,
        schema_version: input.schema_version,
        tournament_id: input.tournament_id,
        started_at: ctx.timestamp,
        completed_at: None,
        target_score: input.target_score,
        variant: input.variant,
        team1_seat0_model_id: input.team1_seat0_model_id,
        team1_seat2_model_id: input.team1_seat2_model_id,
        team2_seat1_model_id: input.team2_seat1_model_id,
        team2_seat3_model_id: input.team2_seat3_model_id,
        team1_score: 0,
        team2_score: 0,
        team1_bags: 0,
        team2_bags: 0,
        winner_team: 0,
        rng_seed: input.rng_seed,
        allow_renege: input.allow_renege,
        chat_policy: input.chat_policy,
        prompt_cheating_mode: input.prompt_cheating_mode,
        prompt_for_detection: input.prompt_for_detection,
        announce_detected_cheats: input.announce_detected_cheats,
        agent_detection_quorum: input.agent_detection_quorum,
        cheat_consequence_kind: input.cheat_consequence_kind,
        cheat_consequence_value: input.cheat_consequence_value,
        spades_lead_policy: input.spades_lead_policy,
        minimum_team_bid: input.minimum_team_bid,
    });
    Ok(())
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct GameCompleteInput {
    pub id: u64,
    pub team1_score: i16,
    pub team2_score: i16,
    pub team1_bags: u8,
    pub team2_bags: u8,
    pub winner_team: u8,
}

#[reducer]
pub fn complete_game(ctx: &ReducerContext, input: GameCompleteInput) -> Result<(), String> {
    let row = ctx
        .db
        .game()
        .id()
        .find(input.id)
        .ok_or_else(|| format!("game {} not found", input.id))?;
    ctx.db.game().id().update(Game {
        completed_at: Some(ctx.timestamp),
        team1_score: input.team1_score,
        team2_score: input.team2_score,
        team1_bags: input.team1_bags,
        team2_bags: input.team2_bags,
        winner_team: input.winner_team,
        ..row
    });
    Ok(())
}

/// Combined start+complete in one shot. Useful when the client only learns
/// about a game *after* it's already over (legacy localStorage migration).
/// Atomic: a single Game row is inserted with `completed_at = ctx.timestamp`.
#[derive(SpacetimeType, Clone, Debug)]
pub struct CompletedGameInput {
    pub schema_version: u8,
    pub tournament_id: Option<u64>,
    pub target_score: u16,
    pub variant: u8,
    pub team1_seat0_model_id: u32,
    pub team1_seat2_model_id: u32,
    pub team2_seat1_model_id: u32,
    pub team2_seat3_model_id: u32,
    pub team1_score: i16,
    pub team2_score: i16,
    pub team1_bags: u8,
    pub team2_bags: u8,
    pub winner_team: u8,
    pub rng_seed: u64,
    // Cheating policy
    pub allow_renege: bool,
    pub chat_policy: u8,
    pub prompt_cheating_mode: u8,
    pub prompt_for_detection: bool,
    pub announce_detected_cheats: bool,
    pub agent_detection_quorum: bool,
    pub cheat_consequence_kind: u8,
    pub cheat_consequence_value: i16,
    // House rules
    pub spades_lead_policy: u8,
    pub minimum_team_bid: u8,
}

#[reducer]
pub fn record_complete_game(
    ctx: &ReducerContext,
    input: CompletedGameInput,
) -> Result<(), String> {
    ctx.db.game().insert(Game {
        id: 0,
        schema_version: input.schema_version,
        tournament_id: input.tournament_id,
        started_at: ctx.timestamp,
        completed_at: Some(ctx.timestamp),
        target_score: input.target_score,
        variant: input.variant,
        team1_seat0_model_id: input.team1_seat0_model_id,
        team1_seat2_model_id: input.team1_seat2_model_id,
        team2_seat1_model_id: input.team2_seat1_model_id,
        team2_seat3_model_id: input.team2_seat3_model_id,
        team1_score: input.team1_score,
        team2_score: input.team2_score,
        team1_bags: input.team1_bags,
        team2_bags: input.team2_bags,
        winner_team: input.winner_team,
        rng_seed: input.rng_seed,
        allow_renege: input.allow_renege,
        chat_policy: input.chat_policy,
        prompt_cheating_mode: input.prompt_cheating_mode,
        prompt_for_detection: input.prompt_for_detection,
        announce_detected_cheats: input.announce_detected_cheats,
        agent_detection_quorum: input.agent_detection_quorum,
        cheat_consequence_kind: input.cheat_consequence_kind,
        cheat_consequence_value: input.cheat_consequence_value,
        spades_lead_policy: input.spades_lead_policy,
        minimum_team_bid: input.minimum_team_bid,
    });
    Ok(())
}

// ─── Hand reducer ───────────────────────────────────────

#[derive(SpacetimeType, Clone, Debug)]
pub struct HandRecordInput {
    pub game_id: u64,
    pub hand_number: u8,
    pub dealer_seat: u8,
    pub deal_seat0: u64,
    pub deal_seat1: u64,
    pub deal_seat2: u64,
    pub deal_seat3: u64,
    pub bids_packed: u32,
    pub tricks_won_packed: u16,
    pub team1_score_delta: i16,
    pub team2_score_delta: i16,
}

#[reducer]
pub fn record_hand(_ctx: &ReducerContext, input: HandRecordInput) -> Result<(), String> {
    _ctx.db.hand().insert(Hand {
        id: 0,
        game_id: input.game_id,
        hand_number: input.hand_number,
        dealer_seat: input.dealer_seat,
        deal_seat0: input.deal_seat0,
        deal_seat1: input.deal_seat1,
        deal_seat2: input.deal_seat2,
        deal_seat3: input.deal_seat3,
        bids_packed: input.bids_packed,
        tricks_won_packed: input.tricks_won_packed,
        team1_score_delta: input.team1_score_delta,
        team2_score_delta: input.team2_score_delta,
    });
    Ok(())
}

// ─── Communication reducer ──────────────────────────────

#[derive(SpacetimeType, Clone, Debug)]
pub struct CommunicationInput {
    pub game_id: u64,
    pub hand_id: u64,
    pub seat: u8,
    pub phase: u8,
    pub audience: u8,
    pub target_seat: Option<u8>,
    pub text_zstd: Vec<u8>,
    pub referenced_card: Option<u8>,
    pub self_reported_cheat: u8,
    pub engine_detected_lie: bool,
}

#[reducer]
pub fn record_communication(
    ctx: &ReducerContext,
    input: CommunicationInput,
) -> Result<(), String> {
    ctx.db.communication().insert(Communication {
        id: 0,
        game_id: input.game_id,
        hand_id: input.hand_id,
        seat: input.seat,
        timestamp: ctx.timestamp,
        phase: input.phase,
        audience: input.audience,
        target_seat: input.target_seat,
        text_zstd: input.text_zstd,
        referenced_card: input.referenced_card,
        self_reported_cheat: input.self_reported_cheat,
        engine_detected_lie: input.engine_detected_lie,
    });
    Ok(())
}

// ─── Accusation reducer ─────────────────────────────────

#[derive(SpacetimeType, Clone, Debug)]
pub struct AccusationInput {
    pub game_id: u64,
    pub accuser_seat: u8,
    pub accused_seat: u8,
    pub accused_decision_id: Option<u64>,
    pub accused_communication_id: Option<u64>,
    pub confidence: u8,
    pub reasoning_zstd: Vec<u8>,
}

#[reducer]
pub fn record_accusation(ctx: &ReducerContext, input: AccusationInput) -> Result<(), String> {
    ctx.db.accusation().insert(Accusation {
        id: 0,
        game_id: input.game_id,
        accuser_seat: input.accuser_seat,
        accused_seat: input.accused_seat,
        timestamp: ctx.timestamp,
        accused_decision_id: input.accused_decision_id,
        accused_communication_id: input.accused_communication_id,
        confidence: input.confidence,
        reasoning_zstd: input.reasoning_zstd,
    });
    Ok(())
}
