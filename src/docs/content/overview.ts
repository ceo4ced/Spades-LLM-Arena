import type { DocCategory } from './types';

export const overview: DocCategory = {
  id: 'overview',
  title: 'Overview',
  intro:
    'High-level orientation: what the system is, how the major subsystems connect, and where to start reading. ' +
    'Every page deeper in the docs follows the same three-layer pattern: abstract prose, a Java-style interface for collaborators, then pseudocode of the actual behavior.',
  topics: [
    {
      id: 'project',
      title: 'Spades LLM Arena (what it is)',
      summary: 'Bots-vs-bots Spades; LLMs in 4 seats; persistent SpacetimeDB leaderboard.',
      status: 'shipped',
      files: ['README.md'],
      layers: {
        abstract:
          'Four seats, four bots, real Spades. Each seat is configured to a model (random, heuristic, ' +
          'or any LLM via OpenRouter / Anthropic / OpenAI / Gemini). The engine runs the game; agents ' +
          'return bids and plays in response to observations; results are persisted to SpacetimeDB ' +
          'Maincloud where any client can subscribe to a live leaderboard and head-to-head matchups.\n\n' +
          'The benchmark exists because off-the-shelf LLM evals (MMLU, HumanEval, etc.) do not measure ' +
          'multi-step decision-making under hidden information with partner coordination. Spades does. ' +
          'The same harness also serves as a reference implementation for runtime constraint enforcement ' +
          '(see the SARC mapping in Research/NOTES.md).',
        iface:
          '// Top-level building blocks. Each is documented in its own page.\n' +
          'interface SpadesArena {\n' +
          '    GameEngine    engine;       // pure-TS rules, scoring, state machine\n' +
          '    Agent[4]      seats;        // one Agent per seat\n' +
          '    SpacetimeDB   store;        // game / hand / decision / model tables\n' +
          '    ReactUI       ui;           // GameSetup, GameBoard, Dashboard, ...\n' +
          '    Orchestrator  stream;       // headless Playwright + FFmpeg → YouTube\n' +
          '\n' +
          '    void          startMatch(GameConfig cfg);\n' +
          '    Leaderboard   liveLeaderboard();\n' +
          '}',
        pseudocode:
          '// Lifecycle of one match, end-to-end.\n' +
          'on user clicks "Start Match":\n' +
          '    config = GameSetup.read()                        // variant, target, seats, policy, seed?\n' +
          '    engine = new GameEngine(config)                  // assigns rngSeed if none provided\n' +
          '    agents = [buildAgent(p) for p in config.players] // RandomAgent / LLMAgent / …\n' +
          '    until engine.phase == game_over:\n' +
          '        seat       = engine.currentTurn\n' +
          '        obs        = engine.getObservation(seat)\n' +
          '        action     = await agents[seat].decide(obs)\n' +
          '        engine.apply(action)                         // validates + may log cheat events\n' +
          '    saveResult(engine.state) → localStorage\n' +
          '    recordCompleteGame(...) → SpacetimeDB (best-effort)\n',
      },
    },

    {
      id: 'architecture',
      title: 'Architecture map',
      summary: 'Where each subsystem lives and how data flows between them.',
      status: 'shipped',
      files: ['README.md', 'src/', 'spacetime/'],
      layers: {
        abstract:
          'Six subsystems: engine, agents, hooks, components, spacetime client, spacetime module. ' +
          'Plus two adjacent pieces: a Rust encoding crate that the module uses to pack hands/bids/tricks ' +
          'compactly, and the streaming orchestrator that drives a headless browser so unattended games can ' +
          'broadcast to YouTube.\n\n' +
          'Data flows downhill: UI configures, hooks drive the loop, engine produces state, agents consume ' +
          'observations and emit actions, and the spacetime client batches results to the module. The module ' +
          'is the only piece running in the cloud; everything else lives in the browser or the Node ' +
          'orchestrator process.',
        iface:
          'package src.engine;     // pure rules, no IO\n' +
          'package src.agents;     // one file per provider, all implement Agent\n' +
          'package src.hooks;      // React hooks: useGame, useSpacetime, useOpenRouterModels\n' +
          'package src.components; // GameSetup, GameBoard, Dashboard, …\n' +
          'package src.spacetime;  // spacetime-client.ts, spacetime-results.ts, spacetime-bindings/\n' +
          'package spacetime.module;  // Rust → wasm, runs in SpacetimeDB Maincloud\n' +
          'package stream;         // Playwright + FFmpeg → YouTube RTMP\n' +
          '\n' +
          '// Dependency direction (no cycles):\n' +
          '//   components → hooks → engine + agents + spacetime-client → spacetime-bindings\n' +
          '//                                                              ↓ network\n' +
          '//                                                          spacetime.module',
        pseudocode:
          '// Click → recorded game, traced through the stack.\n' +
          'GameSetup (component)\n' +
          '    builds GameConfig\n' +
          '    → calls App.handleStart(config)\n' +
          '        → useGame.initGame(config)\n' +
          '            → new GameEngine(config)\n' +
          '            → loop:\n' +
          '                engine.getObservation(seat)\n' +
          '                Agent.decide(observation)\n' +
          '                engine.apply(action)\n' +
          '                trigger re-render via setGameState\n' +
          '            on game_over:\n' +
          '                saveResult(result)            // localStorage\n' +
          '                recordCompleteGame(...)       // spacetime-client → spacetime.module\n' +
          '                                              //   stores: Game row + (future) Hand/Decision rows\n' +
          'Dashboard (component) subscribes to model + game tables\n' +
          '    via useSpacetime.useLeaderboard / useMatchups / useGameCount\n' +
          '    → live re-renders as new games land\n',
      },
    },

    {
      id: 'data-flow',
      title: 'End-to-end data flow',
      summary: 'One bid/play decision, traced through every layer.',
      status: 'shipped',
      files: ['src/hooks/useGame.ts', 'src/engine/game.ts', 'src/agents/base.ts'],
      layers: {
        abstract:
          'Take a single decision (Bot 2 plays the 9♠) and follow it through the code. This is the most ' +
          'useful mental model for the whole project: the loop is tight, the data is small, and almost ' +
          'every other doc page below is some specialization of one of these steps.',
        iface:
          '// Each tick of the game loop:\n' +
          'class Tick {\n' +
          '    Observation buildObservation(int seat);                         // engine\n' +
          '    Action      askAgent(Observation obs);                          // agent\n' +
          '    String?     apply(int seat, Action a);                          // engine; null = ok\n' +
          '    void        log(String message);                                // hook\n' +
          '    void        recordIfGameOver();                                 // hook → spacetime-client\n' +
          '}',
        pseudocode:
          '// One iteration of useGame.runLoop(), the heart of the system.\n' +
          'state = engine.state\n' +
          'if state.phase == game_over: recordResults(); return\n' +
          'seat  = state.currentTurn\n' +
          'agent = agents[seat]\n' +
          'if agent is null: setIsHumanTurn(true); return        // wait for human input\n' +
          '\n' +
          'await sleep(speed)                                    // UI pacing\n' +
          'obs  = engine.getObservation(seat)                    // legal_plays computed here\n' +
          'if state.phase == bidding:\n' +
          '    action = await agent.bid(obs)                     // {action:"bid", value, reasoning}\n' +
          '    err    = engine.processBid(seat, action)\n' +
          'else:\n' +
          '    action = await agent.play(obs)                    // {action:"play", card, reasoning}\n' +
          '    err    = engine.processPlay(seat, action)         // may log a CheatEvent\n' +
          '\n' +
          'if err: log(err); engine.applyFallback(seat)          // RandomAgent picks a legal action\n' +
          'setGameState({...engine.state})                       // triggers UI re-render\n' +
          'if engine.isTrickComplete(): engine.resolveTrick()    // also scoreHand at hand boundary\n' +
          'schedule next tick (runLoop)\n',
      },
    },
  ],
};
