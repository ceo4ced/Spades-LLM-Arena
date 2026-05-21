import type { DocCategory } from './types';

export const engine: DocCategory = {
  id: 'engine',
  title: 'Engine',
  intro:
    'Pure TypeScript Spades rules, state machine, scoring, and reproducibility primitives. No IO, no React, no network. ' +
    'Everything else in the codebase consumes the engine — agents read observations, hooks drive the loop, the spacetime ' +
    'client persists results.',
  topics: [
    {
      id: 'game-engine',
      title: 'GameEngine — the state machine',
      summary: 'Owns game state, advances turns, validates actions, applies cheat consequences.',
      status: 'shipped',
      files: ['src/engine/game.ts'],
      layers: {
        abstract:
          'The single class that holds GameState and exposes every legal mutation. Construction deals 13 cards per ' +
          'seat, picks a dealer (real Spades cuts → seeded RNG), and waits for bidding. processBid / processPlay are ' +
          'the only mutators agents can drive; resolveTrick + scoreHand close the trick / hand boundaries. ' +
          'The constructor takes a CheatingPolicy and an rngSeed, both with sane defaults — pass them to reproduce a ' +
          'specific game or change house rules.',
        iface:
          'public class GameEngine {\n' +
          '    public GameState        state;\n' +
          '    public final String     variant;       // "standard" | "jokers"\n' +
          '    public final BigInt     rngSeed;       // persisted with each game\n' +
          '    public final CheatingPolicy policy;\n' +
          '    public List<CheatEvent> cheatEvents;\n' +
          '    public HandResult       lastHandResult;\n' +
          '\n' +
          '    public GameEngine(int targetScore,\n' +
          '                      String variant,\n' +
          '                      Integer initialDealer,   // optional\n' +
          '                      CheatingPolicy policy,   // default STRICT\n' +
          '                      BigInt rngSeed);         // default generateRandomSeed()\n' +
          '\n' +
          '    public void           dealHand();\n' +
          '    public Observation    getObservation(int seat);\n' +
          '    public String?        processBid(int seat, BidAction a);   // null = success\n' +
          '    public String?        processPlay(int seat, PlayAction a);\n' +
          '    public boolean        isTrickComplete();\n' +
          '    public void           resolveTrick();\n' +
          '    public void           scoreHand();\n' +
          '}',
        pseudocode:
          'constructor(targetScore, variant, initialDealer?, policy?, rngSeed?):\n' +
          '    this.policy   = policy ?? STRICT_CHEATING_POLICY\n' +
          '    this.rngSeed  = rngSeed ?? generateRandomSeed()    // crypto-random 64-bit\n' +
          '    this.rng      = seededRng(this.rngSeed)            // splitmix64\n' +
          '    dealer        = initialDealer ?? floor(rng() * 4)\n' +
          '    initState(dealer); dealHand()\n' +
          '\n' +
          'processPlay(seat, action):\n' +
          '    guard phase == playing and currentTurn == seat\n' +
          '    card  = parseCard(action.card)\n' +
          '    guard player.hand contains card\n' +
          '    legal = getLegalPlays(player.hand, ledSuit, spadesBroken,\n' +
          '                           forcedOpeningCard(), policy.spadesLeadPolicy)\n' +
          '    if card not in legal:\n' +
          '        if !policy.allowRenege or isForcedOpening: return "Illegal play"\n' +
          '        kind = (isLead ? IllegalLead : Renege)\n' +
          '        endedGame = recordAndApplyCheat({seat, kind, card})\n' +
          '        if endedGame: return null    // GameForfeit short-circuits\n' +
          '    apply: remove card from hand, append to currentTrick.plays\n' +
          '    if !ledSuit: set ledSuit = card.suit\n' +
          '    if card.isSpade: spadesBroken = true\n' +
          '    if !isTrickComplete(): currentTurn = (currentTurn + 1) % 4\n' +
          '\n' +
          'scoreHand():\n' +
          '    if policy.minimumTeamBid > 0: flag any team whose bid is below floor\n' +
          '    apply calculateTeamScore for each team\n' +
          '    deduct pendingPenalties (from CheatConsequence.HandPenalty)\n' +
          '    if either team reached targetScore: phase = game_over\n' +
          '    else: advance dealer, increment handNumber, dealHand()\n',
      },
    },

    {
      id: 'rules',
      title: 'rules.ts — legal-play oracle',
      summary: 'getLegalPlays + determineTrickWinner. Pure functions, no state.',
      status: 'shipped',
      files: ['src/engine/rules.ts'],
      layers: {
        abstract:
          'Two pure functions. getLegalPlays is the Pre-Action Gate (SARC mapping): it filters the hand down to the ' +
          'subset the player is allowed to commit, honoring follow-suit, spades-breaking, the universal opening-card ' +
          'rule, and the optional AlwaysAllowed lead policy. determineTrickWinner picks the winning seat once four ' +
          'cards have been played.',
        iface:
          'public final class Rules {\n' +
          '    public static List<Card> getLegalPlays(\n' +
          '        List<Card>       hand,\n' +
          '        Suit?            ledSuit,           // null when this seat leads\n' +
          '        boolean          spadesBroken,\n' +
          '        String?          forcedOpeningCardId, // "2C"/"3C" on trick 1\n' +
          '        SpadesLeadPolicy leadPolicy            // default MustBeBroken\n' +
          '    );\n' +
          '    public static int determineTrickWinner(List<TrickPlay> plays, Suit ledSuit);\n' +
          '}',
        pseudocode:
          'getLegalPlays(hand, ledSuit, spadesBroken, forcedOpener, leadPolicy):\n' +
          '    if ledSuit is null:                            // we are leading\n' +
          '        if forcedOpener and hand contains it: return [forcedOpener]\n' +
          '        if leadPolicy == MustBeBroken and !spadesBroken and hand has non-spades:\n' +
          '            return hand.filter(c => not isTrump(c))\n' +
          '        return hand.copy()\n' +
          '    if ledSuit == Spades:\n' +
          '        suitCards = hand.filter(isTrump)           // jokers count as spades\n' +
          '    else:\n' +
          '        suitCards = hand.filter(c => c.suit == ledSuit)\n' +
          '    return suitCards.nonEmpty ? suitCards : hand.copy()\n' +
          '\n' +
          'determineTrickWinner(plays, ledSuit):\n' +
          '    winner = plays[0]\n' +
          '    for each subsequent play p:\n' +
          '        if p.card is trump and winner.card is not: winner = p\n' +
          '        else if both trumps and value(p) > value(winner): winner = p\n' +
          '        else if neither trump and p.suit == winner.suit and value(p) > value(winner): winner = p\n' +
          '        else if neither trump and p.suit == ledSuit and winner.suit != ledSuit: winner = p\n' +
          '    return winner.seat\n',
      },
    },

    {
      id: 'deck',
      title: 'deck.ts — cards, shuffle, parse',
      summary: 'Builds the 52- or 54-card deck, Fisher-Yates shuffle (RNG-injected), parses card ids.',
      status: 'shipped',
      files: ['src/engine/deck.ts'],
      layers: {
        abstract:
          'Card ids are short strings ("AS", "10H", "BigJoker"). createDeck returns 52 cards in standard, 52 in jokers ' +
          '(removes 2♣/2♦, adds Big/Little Jokers). shuffle is Fisher-Yates parameterized by an RNG function so the ' +
          'engine can supply a seeded source for reproducibility. getCardValue and parseCard are utilities.',
        iface:
          'public final class Deck {\n' +
          '    public static List<Card> createDeck(String variant);              // "standard" | "jokers"\n' +
          '    public static List<Card> shuffle(List<Card> deck, () => double rng);  // default Math.random\n' +
          '    public static int        getCardValue(Rank r, Suit s);\n' +
          '    public static Card?      parseCard(String id);\n' +
          '}',
        pseudocode:
          'createDeck(variant):\n' +
          '    deck = []\n' +
          '    for suit in [S,H,D,C]:\n' +
          '        for rank in [A,K,Q,J,10..2]:\n' +
          '            if variant == "jokers" and (suit in {C,D}) and rank == "2": skip\n' +
          '            deck.push({suit, rank, id: rank+suit})\n' +
          '    if variant == "jokers":\n' +
          '        deck.push({suit:"J", rank:"Big",    id:"BigJoker"})\n' +
          '        deck.push({suit:"J", rank:"Little", id:"LittleJoker"})\n' +
          '    return deck\n' +
          '\n' +
          'shuffle(deck, rng):\n' +
          '    a = deck.copy()\n' +
          '    for i from a.length-1 down to 1:\n' +
          '        j = floor(rng() * (i+1))\n' +
          '        swap a[i] and a[j]\n' +
          '    return a\n',
      },
    },

    {
      id: 'scoring',
      title: 'scoring.ts — points, bags, nil',
      summary: 'calculateTeamScore: bid satisfaction, overtricks, bags, nil bonuses, bag penalty.',
      status: 'shipped',
      files: ['src/engine/scoring.ts'],
      layers: {
        abstract:
          'A single pure function. Given a team\'s two players and the team\'s pre-hand state, returns the post-hand ' +
          'score and bag count. Honors nil bids (±100), team bid satisfaction (10× bid + 1 bag per overtrick), failure ' +
          '(−10× bid), and the standard bag penalty (−100 per 10 bags accumulated, with the bag counter wrapping).',
        iface:
          'public final class Scoring {\n' +
          '    public static TeamState calculateTeamScore(\n' +
          '        PlayerState player1,\n' +
          '        PlayerState player2,\n' +
          '        TeamState   current\n' +
          '    );\n' +
          '}',
        pseudocode:
          'calculateTeamScore(p1, p2, current):\n' +
          '    score = current.score; bags = current.bags\n' +
          '    for each (bid, won) in [(p1.bid, p1.won), (p2.bid, p2.won)]:\n' +
          '        if bid == 0:                              // nil\n' +
          '            score += (won == 0 ? +100 : -100)\n' +
          '    teamBid = sum of non-nil bids\n' +
          '    teamWon = sum of tricks won by non-nil bidders\n' +
          '    if teamBid > 0:\n' +
          '        if teamWon >= teamBid:\n' +
          '            score += teamBid * 10\n' +
          '            over = teamWon - teamBid\n' +
          '            score += over; bags += over\n' +
          '        else:\n' +
          '            score -= teamBid * 10\n' +
          '    while bags >= 10:                             // bag penalty\n' +
          '        score -= 100; bags -= 10\n' +
          '    return {score, bags}\n',
      },
    },

    {
      id: 'rng',
      title: 'rng.ts — seeded reproducibility',
      summary: 'splitmix64 PRNG + crypto seed generator. Same seed → same deal.',
      status: 'shipped',
      files: ['src/engine/rng.ts', 'src/engine/rng.test.ts'],
      layers: {
        abstract:
          'splitmix64 is a single-state 64-bit PRNG with good statistical quality. seededRng wraps it as a ' +
          'Math.random-compatible () => double function so existing call sites (Fisher-Yates, dealer pick) can ' +
          'switch without changing their math. generateRandomSeed uses Web Crypto when available and falls back ' +
          'to Math.random on legacy hosts (should never trigger in modern browsers / Node ≥ 19).',
        iface:
          'public final class Rng {\n' +
          '    public static () => double seededRng(BigInt seed);    // splitmix64\n' +
          '    public static BigInt       generateRandomSeed();      // u64-range\n' +
          '}',
        pseudocode:
          'seededRng(seed):\n' +
          '    state = (seed & u64) or 1n             // avoid degenerate zero\n' +
          '    return () => {\n' +
          '        state = (state + 0x9E3779B97F4A7C15) & u64\n' +
          '        z = state\n' +
          '        z = ((z xor (z >> 30)) * 0xBF58476D1CE4E5B9) & u64\n' +
          '        z = ((z xor (z >> 27)) * 0x94D049BB133111EB) & u64\n' +
          '        z = z xor (z >> 31)\n' +
          '        return Number(z >> 11) / 2^53          // top 53 bits → [0, 1)\n' +
          '    }\n' +
          '\n' +
          'generateRandomSeed():\n' +
          '    if crypto.getRandomValues exists:\n' +
          '        buf = new BigUint64Array(1)\n' +
          '        crypto.getRandomValues(buf)\n' +
          '        return buf[0]\n' +
          '    return (hi32 << 32) | lo32 from Math.random\n',
      },
    },

    {
      id: 'cheating-policy',
      title: 'CheatingPolicy + CheatEvent',
      summary: 'Per-game policy data + the audit-trail event type.',
      status: 'shipped',
      files: ['src/engine/types.ts', 'src/engine/game.cheating.test.ts'],
      layers: {
        abstract:
          'CheatingPolicy is the input to runtime enforcement; CheatEvent is the output. The four presets in ' +
          'GameSetup (Strict, Permissive, Penalty, Forfeit) are concrete CheatingPolicy values. CheatEvent is the ' +
          'append-only trace produced by the engine — SARC\'s Post-Action Auditor in concrete form.',
        iface:
          'enum SpadesLeadPolicy     { MustBeBroken, AlwaysAllowed }\n' +
          'enum CheatConsequenceKind { LogOnly, HandPenalty, GameForfeit }\n' +
          'enum EngineCheatKind      { Renege, IllegalLead, BidBelowMinimum }\n' +
          '\n' +
          'class CheatingPolicy {\n' +
          '    boolean             allowRenege;\n' +
          '    SpadesLeadPolicy    spadesLeadPolicy;\n' +
          '    int                 minimumTeamBid;     // 0 disables floor\n' +
          '    CheatConsequence    consequence;        // {kind, value}\n' +
          '}\n' +
          '\n' +
          'class CheatEvent {\n' +
          '    int               handNumber;\n' +
          '    int               trickNumber;          // 0 for bid-time events\n' +
          '    int               seat;\n' +
          '    EngineCheatKind   kind;\n' +
          '    { String? card; int? bid; }  attempted;\n' +
          '    CheatConsequenceKind consequence;\n' +
          '    int               penaltyApplied;\n' +
          '    boolean           endedGame;\n' +
          '}',
        pseudocode:
          'recordAndApplyCheat(base):\n' +
          '    consequence = policy.consequence\n' +
          '    penalty     = 0\n' +
          '    endedGame   = false\n' +
          '    switch consequence.kind:\n' +
          '        HandPenalty:\n' +
          '            team = (base.seat % 2 == 0 ? 1 : 2)\n' +
          '            pendingPenalties[team] += consequence.value\n' +
          '            penalty = consequence.value\n' +
          '        GameForfeit:\n' +
          '            offender = (base.seat % 2 == 0 ? 1 : 2); opp = 3 - offender\n' +
          '            scores[opp]      = targetScore\n' +
          '            scores[offender] = min(scores[offender], targetScore - 1)\n' +
          '            phase = game_over\n' +
          '            endedGame = true\n' +
          '        LogOnly: (no score effect)\n' +
          '    cheatEvents.push({...base, consequence: consequence.kind, penaltyApplied: penalty, endedGame})\n' +
          '    return endedGame\n',
      },
    },

    {
      id: 'runner',
      title: 'runner.ts — headless game driver',
      summary: 'Drives an engine + 4 agents to completion without React. Used by streaming.',
      status: 'shipped',
      files: ['src/engine/runner.ts'],
      layers: {
        abstract:
          'A thin async loop that mirrors useGame.runLoop but with no UI. The streaming orchestrator and benchmark ' +
          'scripts use it to play games headlessly. It produces the same GameResult shape that the React loop produces, ' +
          'so downstream code (saveResult, recordCompleteGame) is identical.',
        iface:
          'public final class Runner {\n' +
          '    public static GameResult runGame(\n' +
          '        GameConfig cfg,\n' +
          '        Agent[]    agents,\n' +
          '        (String)   logSink             // optional progress callback\n' +
          '    );\n' +
          '}',
        pseudocode:
          'runGame(cfg, agents, log):\n' +
          '    engine = new GameEngine(cfg.targetScore, cfg.variant, …, cfg.cheatingPolicy, cfg.rngSeed)\n' +
          '    while engine.phase != game_over:\n' +
          '        seat   = engine.currentTurn\n' +
          '        obs    = engine.getObservation(seat)\n' +
          '        action = await agents[seat].decide(obs)\n' +
          '        engine.apply(action)\n' +
          '        if engine.isTrickComplete(): engine.resolveTrick()\n' +
          '    return buildGameResult(engine)\n',
      },
    },

    {
      id: 'results-store',
      title: 'resultsStore.ts — localStorage leaderboard',
      summary: 'Source of truth for the local leaderboard until SpacetimeDB writes catch up.',
      status: 'shipped',
      files: ['src/engine/resultsStore.ts'],
      layers: {
        abstract:
          'A pre-SpacetimeDB leaderboard backed by localStorage. Survives because some UI surfaces (ModelDetail) ' +
          'still read it. New games are saved synchronously to localStorage before the best-effort spacetime call ' +
          'fires. Slated for retirement once ModelDetail migrates (see README "what\'s left to do").',
        iface:
          'public final class ResultsStore {\n' +
          '    public static GameResult        saveResult(GameResultDraft d);\n' +
          '    public static List<GameResult>  getAllResults();\n' +
          '    public static int               getTotalGamesPlayed();\n' +
          '    public static List<ModelStats>  getLeaderboard();\n' +
          '    public static List<Matchup>     getMatchups();\n' +
          '    public static List<GameResult>  getModelResults(String name);\n' +
          '    public static void              saveTournament(TournamentResult t);\n' +
          '    public static List<Tournament>  getAllTournaments();\n' +
          '    public static void              clearAllData();\n' +
          '}',
        pseudocode:
          'saveResult(draft):\n' +
          '    results = JSON.parse(localStorage.getItem("spades_arena_results")) ?? []\n' +
          '    result  = {...draft, id: crypto.randomUUID()}\n' +
          '    results.push(result); writeBack(); return result\n' +
          '\n' +
          'getLeaderboard():\n' +
          '    stats = {}\n' +
          '    for each game in getAllResults():\n' +
          '        for each model in game.team1Models: tally(stats[model], game, won=game.winner==1)\n' +
          '        for each model in game.team2Models: tally(stats[model], game, won=game.winner==2)\n' +
          '    sort by winRate desc, totalPoints desc\n',
      },
    },

    {
      id: 'types',
      title: 'types.ts — shared types',
      summary: 'Card/Rank/Suit, GameState, Observation, BidAction/PlayAction, CheatingPolicy.',
      status: 'shipped',
      files: ['src/engine/types.ts'],
      layers: {
        abstract:
          'The shared contract between engine, agents, and UI. Notable: Observation is the exact JSON shape an ' +
          'LLM agent receives in its prompt — keeping it stable matters for prompt regressions.',
        iface:
          'type Suit = "S" | "H" | "D" | "C" | "J";\n' +
          'type Rank = "Big" | "Little" | "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";\n' +
          '\n' +
          'class Card        { Suit suit; Rank rank; String id; }\n' +
          'class GameConfig  { String variant; int targetScore; Player[] players; CheatingPolicy? policy; BigInt? rngSeed; }\n' +
          'class PlayerState { int seat; Card[] hand; int? bid; int tricksWon; String type; String name; }\n' +
          'class TeamState   { int score; int bags; }\n' +
          'class Trick       { int number; TrickPlay[] plays; int? winner; Suit? ledSuit; }\n' +
          'class GameState   { String phase; int dealer; int currentTurn; PlayerState[] players;\n' +
          '                    Teams teams; Trick currentTrick; Trick[] trickHistory;\n' +
          '                    boolean spadesBroken; int targetScore; int handNumber; }\n' +
          '\n' +
          '// Sent to agents; this is the prompt input.\n' +
          'class Observation { String phase; String[] hand; int seat; int partner_seat;\n' +
          '                    int dealer; Scores score; BiddingContext? bidding_context;\n' +
          '                    PlayingContext? playing_context; }\n' +
          '\n' +
          'class BidAction   { "bid"  action; int value;  String reasoning; }\n' +
          'class PlayAction  { "play" action; String card; String reasoning; }',
        pseudocode:
          '// types.ts has no behavior — just declarations. The notable invariants:\n' +
          '//\n' +
          '// 1. card.id == rank+suit, except jokers which are "BigJoker" and "LittleJoker"\n' +
          '// 2. seat % 2 == 0  =>  team 1; seat % 2 == 1  =>  team 2\n' +
          '// 3. partner_seat   == (seat + 2) % 4\n' +
          '// 4. Observation.hand is a string[] (card ids), NOT a Card[] — the prompt sees strings\n' +
          '// 5. playing_context.legal_plays is computed by getLegalPlays at observation-build time\n',
      },
    },
  ],
};
