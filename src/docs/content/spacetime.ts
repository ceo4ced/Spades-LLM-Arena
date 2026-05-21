import type { DocCategory } from './types';

export const spacetime: DocCategory = {
  id: 'spacetime',
  title: 'SpacetimeDB',
  intro:
    'Cloud persistence + live subscriptions. The Rust module defines tables and reducers; clients (React app, ' +
    'streaming orchestrator) connect to maincloud and either call reducers (write) or subscribe to tables (read). ' +
    'TypeScript bindings are generated from the Rust schema and live in src/spacetime-bindings/.',
  topics: [
    {
      id: 'module-overview',
      title: 'Module overview',
      summary: 'spades-arena module on SpacetimeDB Maincloud. Tables, reducers, identities.',
      status: 'shipped',
      files: ['spacetime/module/src/lib.rs', 'spacetime/SETUP.md'],
      layers: {
        abstract:
          'Compiled to WASM and published to SpacetimeDB Maincloud as spades-arena (identity ' +
          'c200c1c5270178f7cd5066b7b9ff02a74743f95e40e28841ecfedfbd1406ff18). All tables are public so the TypeScript ' +
          'client can subscribe. Field types stay primitive (u8, u16, u32, u64, i16, String, Vec<u8>, Option) so the ' +
          'schema is decoupled from the encoding crate\'s enums — clients convert at the boundary.',
        iface:
          '// Tables (all public):\n' +
          'table Model         { id u32 (PK auto), name, kind u8, version, introduced_at }\n' +
          'table Tournament    { id u64 (PK auto), name, format u8, started_at, completed_at?, champion_team? }\n' +
          'table Game          { id u64 (PK auto), schema_version, tournament_id?, target_score, variant, … }\n' +
          'table Hand          { id u64 (PK auto), game_id (idx), hand_number, …, bids_packed, tricks_won_packed }\n' +
          'table Decision      { id u64 (PK auto), game_id (idx), hand_id (idx), model_id (idx), … }\n' +
          'table Reasoning     { decision_id u64 (PK), text_zstd Vec<u8> }\n' +
          'table Communication { id u64 (PK auto), game_id (idx), hand_id (idx), seat, … }\n' +
          'table Accusation    { id u64 (PK auto), game_id (idx), accuser_seat, accused_seat, … }\n' +
          '\n' +
          '// Reducers (callable from clients):\n' +
          'reducer register_model(ctx, name, kind, version)\n' +
          'reducer start_game(ctx, GameStartInput)\n' +
          'reducer complete_game(ctx, GameCompleteInput)\n' +
          'reducer record_complete_game(ctx, CompletedGameInput)   // atomic one-shot\n' +
          'reducer record_hand(ctx, HandRecordInput)\n' +
          'reducer record_decision(ctx, DecisionInput)\n' +
          'reducer record_reasoning(ctx, decision_id, text_zstd)\n' +
          'reducer record_communication(ctx, …)\n' +
          'reducer record_accusation(ctx, …)\n' +
          'reducer start_tournament(ctx, name, format)\n' +
          'reducer complete_tournament(ctx, id, champion_team)',
        pseudocode:
          '// Lifecycle (intended, not all wired yet):\n' +
          'register_model(name, kind, version)\n' +
          '   ↓\n' +
          'start_game(input) → returns game_id (via auto_inc)\n' +
          '   ↓ for each hand:\n' +
          '       record_hand(game_id, hand_number, dealer, deal_packed, bids_packed, …)\n' +
          '       for each decision:\n' +
          '           record_decision(game_id, hand_id, model_id, seat, kind, action, legal_mask, …)\n' +
          '           if LLM: record_reasoning(decision_id, zstd(reasoning_text))\n' +
          '       (optional) record_communication / record_accusation\n' +
          '   ↓\n' +
          'complete_game(id, final scores, winner_team)\n' +
          '\n' +
          '// Today the client uses the one-shot path:\n' +
          'record_complete_game(input)   // inserts Game row with started_at == completed_at\n',
      },
    },

    {
      id: 'game-table',
      title: 'Game table — schema deep dive',
      summary: 'Per-game row with roster, scores, cheating policy, house rules.',
      status: 'shipped',
      files: ['spacetime/module/src/lib.rs'],
      layers: {
        abstract:
          'Each finished match is one Game row. Beyond the obvious (scores, models, target), the row carries the ' +
          'full cheating policy in force (allow_renege, chat_policy, prompt_cheating_mode, cheat_consequence_*) and ' +
          'house rules (spades_lead_policy, minimum_team_bid). This means every game in the leaderboard is ' +
          'self-describing — you don\'t need to look up which rules were active.',
        iface:
          'table Game {\n' +
          '    u64    id (PK auto);\n' +
          '    u8     schema_version;\n' +
          '    u64?   tournament_id;\n' +
          '    Timestamp started_at;\n' +
          '    Timestamp? completed_at;\n' +
          '    u16    target_score;\n' +
          '    u8     variant;                  // 0=Standard 1=JJA 2=JJDD\n' +
          '    u32    team1_seat0_model_id, team1_seat2_model_id;\n' +
          '    u32    team2_seat1_model_id, team2_seat3_model_id;\n' +
          '    i16    team1_score, team2_score;\n' +
          '    u8     team1_bags,  team2_bags;\n' +
          '    u8     winner_team;              // 1 | 2 | 0 (unfinished)\n' +
          '    u64    rng_seed;                 // splitmix64 seed of the game RNG\n' +
          '    // Cheating policy:\n' +
          '    bool   allow_renege;\n' +
          '    u8     chat_policy;              // 0=None 1=PublicOnly 2=Partner 3=All\n' +
          '    u8     prompt_cheating_mode;     // 0=Silent 1=Permissive 2=Encouraged\n' +
          '    bool   prompt_for_detection;\n' +
          '    bool   announce_detected_cheats;\n' +
          '    bool   agent_detection_quorum;\n' +
          '    u8     cheat_consequence_kind;   // 0=LogOnly 1=HandPenalty 2=GameForfeit\n' +
          '    i16    cheat_consequence_value;\n' +
          '    // House rules:\n' +
          '    u8     spades_lead_policy;       // 0=MustBeBroken 1=AlwaysAllowed\n' +
          '    u8     minimum_team_bid;         // 0 disables\n' +
          '}',
        pseudocode:
          '// Sample queries you can run from any subscriber:\n' +
          '\n' +
          '// Renege rate by model under permissive rules:\n' +
          'SELECT model.name, COUNT(*) AS reneges\n' +
          'FROM decision JOIN game USING (game_id) JOIN model ON model.id = decision.model_id\n' +
          'WHERE decision.engine_cheat_kind = 1 AND game.allow_renege = true\n' +
          'GROUP BY model.name\n' +
          '\n' +
          '// Win rate per matchup ignoring forfeits:\n' +
          'SELECT t1m, t2m, SUM(winner=1) AS t1, SUM(winner=2) AS t2\n' +
          'FROM game WHERE cheat_consequence_kind != 2 GROUP BY t1m, t2m\n',
      },
    },

    {
      id: 'spacetime-client',
      title: 'spacetime-client.ts — connection singleton',
      summary: 'Lazy singleton DbConnection. Resolves maincloud or VITE_SPACETIME_URI override.',
      status: 'shipped',
      files: ['src/spacetime-client.ts'],
      layers: {
        abstract:
          'A single shared DbConnection per browser tab. Lazy: the first call to getConnection establishes the ' +
          'socket; subsequent calls return the same instance. Reads VITE_SPACETIME_URI / VITE_SPACETIME_MODULE so a ' +
          'developer can point at a local module for offline work.',
        iface:
          'public final class SpacetimeClient {\n' +
          '    public static DbConnection getConnection();\n' +
          '    public static boolean      isConnected();\n' +
          '}',
        pseudocode:
          'private connectionRef = null\n' +
          'getConnection():\n' +
          '    if connectionRef: return connectionRef\n' +
          '    uri    = import.meta.env.VITE_SPACETIME_URI   ?? "https://maincloud.spacetimedb.com"\n' +
          '    module = import.meta.env.VITE_SPACETIME_MODULE ?? "spades-arena"\n' +
          '    connectionRef = DbConnection.builder()\n' +
          '        .withUri(uri).withModuleName(module).build()\n' +
          '    return connectionRef\n',
      },
    },

    {
      id: 'spacetime-results',
      title: 'spacetime-results.ts — write helper',
      summary: 'ensureModel + recordCompleteGame. Bridges the local GameResult to the module.',
      status: 'shipped',
      files: ['src/spacetime-results.ts'],
      layers: {
        abstract:
          'Two responsibilities: (1) resolve model names → ids via the model table, registering new names on demand ' +
          'with de-duplication; (2) record one finished game by calling the record_complete_game reducer with the ' +
          'real cheating policy and rng_seed the engine ran under. Best-effort: failures are logged, not thrown.',
        iface:
          'public final class SpacetimeResults {\n' +
          '    public static Future<int> ensureModel(String name, int kind, String version);\n' +
          '    public static Future<void> recordCompleteGame(\n' +
          '        GameResult     r,\n' +
          '        String         variant,         // "standard" | "jokers"\n' +
          '        CheatingPolicy policy,\n' +
          '        BigInt         rngSeed\n' +
          '    );\n' +
          '}',
        pseudocode:
          'ensureModel(name, kind, version):\n' +
          '    await modelTableSubscriptionReady               // open once, cache rows\n' +
          '    if cached.has(name): return cached[name]\n' +
          '    if pending.has(name): join pending list and await\n' +
          '    else:\n' +
          '        pending[name] = [resolver]\n' +
          '        conn.reducers.registerModel({name, kind, version})\n' +
          '    return promise resolved by next model.onInsert(name)\n' +
          '\n' +
          'recordCompleteGame(r, variant, policy, rngSeed):\n' +
          '    [t1s0, t1s2, t2s1, t2s3] = await all 4 ensureModel calls\n' +
          '    conn.reducers.recordCompleteGame({input: {\n' +
          '        schemaVersion: 1, tournamentId: undefined,\n' +
          '        targetScore, variant: variantToCode(variant),\n' +
          '        team1Seat0ModelId: t1s0, … (all four),\n' +
          '        scores, bags, winnerTeam, rngSeed,\n' +
          '        allowRenege: policy.allowRenege,\n' +
          '        chatPolicy: 1, promptCheatingMode: 0, …          // inert layers\n' +
          '        cheatConsequenceKind: codeFor(policy.consequence.kind),\n' +
          '        cheatConsequenceValue: policy.consequence.value,\n' +
          '        spadesLeadPolicy: codeFor(policy.spadesLeadPolicy),\n' +
          '        minimumTeamBid: policy.minimumTeamBid\n' +
          '    }})\n',
      },
    },

    {
      id: 'spacetime-bindings',
      title: 'spacetime-bindings/ — generated TS',
      summary: 'Generated from the Rust schema by `spacetime generate`. Do not hand-edit.',
      status: 'generated',
      files: ['src/spacetime-bindings/'],
      layers: {
        abstract:
          'One file per table (e.g., game_table.ts, model_table.ts) and one per reducer (e.g., ' +
          'record_complete_game_reducer.ts). index.ts re-exports a DbConnection class that has typed accessors for ' +
          'every table and reducer. Regenerate with `npm run spacetime:generate` whenever the module schema changes.',
        iface:
          '// Auto-generated shape (simplified):\n' +
          'class DbConnection {\n' +
          '    db        DbView;          // .game, .model, .hand, .decision, ...\n' +
          '    reducers  Reducers;        // .recordCompleteGame, .registerModel, ...\n' +
          '\n' +
          '    static Builder builder();\n' +
          '    SubscriptionBuilder subscriptionBuilder();\n' +
          '}\n' +
          '\n' +
          'class DbView {\n' +
          '    GameTable    game;\n' +
          '    ModelTable   model;\n' +
          '    HandTable    hand;\n' +
          '    DecisionTable decision;\n' +
          '    ReasoningTable reasoning;\n' +
          '    CommunicationTable communication;\n' +
          '    AccusationTable accusation;\n' +
          '    TournamentTable tournament;\n' +
          '}',
        pseudocode:
          '// Don\'t edit these files. The whole directory is rewritten by:\n' +
          'npm run spacetime:generate\n' +
          '\n' +
          '// Which runs:\n' +
          'spacetime generate --lang typescript \\\n' +
          '    --out-dir src/spacetime-bindings \\\n' +
          '    --project-path spacetime/module\n',
      },
    },

    {
      id: 'encoding-crate',
      title: 'spacetime/encoding — Rust encoding helpers',
      summary: 'Pure-Rust crate (no external deps) for packing bids/hands/tricks compactly.',
      status: 'shipped',
      files: ['spacetime/encoding/'],
      layers: {
        abstract:
          'Standalone Rust crate that the module depends on. Provides bit-packers for the fixed-width fields stored ' +
          'on Hand and Decision rows (bids_packed: u32 holds 4 seats × 8 bits; tricks_won_packed: u16 holds 4 × 4 ' +
          'bits; deal_seatN: u64 packs a 13-card hand). Pure Rust, no external dependencies — kept that way to keep ' +
          'the wasm output small.',
        iface:
          '// pub fn pack_bids(seats: [Bid; 4])      -> u32;\n' +
          '// pub fn unpack_bids(packed: u32)         -> [Bid; 4];\n' +
          '// pub fn pack_tricks_won(won: [u8; 4])    -> u16;\n' +
          '// pub fn unpack_tricks_won(p: u16)        -> [u8; 4];\n' +
          '// pub fn pack_hand(cards: &[CardIndex])   -> u64;   // 13 cards × ~5 bits\n' +
          '// pub fn unpack_hand(p: u64)              -> Vec<CardIndex>;\n' +
          '// pub enum Variant { Standard, Jja, Jjdd }\n' +
          '// impl Variant { pub fn from_u8(u: u8) -> Option<Self>; pub fn to_u8(&self) -> u8; }',
        pseudocode:
          '// All packers follow the same shape:\n' +
          'fn pack_bids(seats):\n' +
          '    out = 0u32\n' +
          '    for i in 0..4: out |= (encode_bid(seats[i]) as u32) << (i * 8)\n' +
          '    out\n' +
          '\n' +
          'fn unpack_bids(packed):\n' +
          '    [decode_bid(((packed >> (i * 8)) & 0xFF) as u8) for i in 0..4]\n',
      },
    },
  ],
};
