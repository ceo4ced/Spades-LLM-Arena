import type { DocCategory } from './types';

export const hooks: DocCategory = {
  id: 'hooks',
  title: 'React Hooks',
  intro:
    'React-side controllers. useGame is the main loop; useSpacetime exposes live SpacetimeDB subscriptions to the ' +
    'UI; useOpenRouterModels keeps the model picker fresh.',
  topics: [
    {
      id: 'use-game',
      title: 'useGame — the main loop',
      summary: 'initGame, runLoop, humanAction, togglePause, quitGame. Drives the engine + agents to completion.',
      status: 'shipped',
      files: ['src/hooks/useGame.ts'],
      layers: {
        abstract:
          'Owns the live engine reference and the per-seat agent array. runLoop is the recursive async function that ' +
          'asks the active seat\'s agent for a bid or play, applies it, advances trick / hand boundaries, and ' +
          're-schedules itself. When a human takes a seat, the loop pauses on that seat and waits for humanAction to ' +
          'be called from the UI. On game_over, persists the result to localStorage and best-effort to SpacetimeDB.',
        iface:
          'public interface UseGame {                        // React hook return shape\n' +
          '    GameState?  gameState;\n' +
          '    String[]    logs;                             // last 50 lines\n' +
          '    boolean     isHumanTurn;\n' +
          '    boolean     isPaused;\n' +
          '    void        initGame(GameConfig cfg);\n' +
          '    void        humanAction(BidAction | PlayAction a);\n' +
          '    void        togglePause();\n' +
          '    void        quitGame();\n' +
          '}',
        pseudocode:
          'initGame(cfg):\n' +
          '    cancel any in-flight loop (bump loopId, drop refs)\n' +
          '    engine  = new GameEngine(cfg.targetScore, cfg.variant, ?, cfg.cheatingPolicy, cfg.rngSeed)\n' +
          '    agents  = cfg.players.map(buildAgent)         // human seats → null\n' +
          '    log("Seed: " + engine.rngSeed)\n' +
          '    isRunning = true\n' +
          '    runLoop(loopId)\n' +
          '\n' +
          'runLoop(currentLoopId):\n' +
          '    if cancelled(currentLoopId): return\n' +
          '    if engine.phase == game_over:\n' +
          '        result = saveResult(buildPayload(engine))\n' +
          '        if engine.cheatEvents: log(summary(engine.cheatEvents))\n' +
          '        recordCompleteGame(result, engine.variant, engine.policy, engine.rngSeed)\n' +
          '            .catch(warn)                          // best-effort\n' +
          '        return\n' +
          '    seat  = engine.currentTurn\n' +
          '    agent = agents[seat]\n' +
          '    if agent is null: setIsHumanTurn(true); return\n' +
          '    await sleep(speed)\n' +
          '    obs   = engine.getObservation(seat)\n' +
          '    action = (engine.phase == bidding) ? await agent.bid(obs) : await agent.play(obs)\n' +
          '    err = engine.processBid|Play(seat, action)\n' +
          '    if err: log(err); engine.applyFallback(seat)\n' +
          '    setGameState({...engine.state})\n' +
          '    await sleep(cardDelay)\n' +
          '    if engine.isTrickComplete(): engine.resolveTrick(); emitTrickSummary(); emitRoundSummary()\n' +
          '    runLoop(currentLoopId)                        // re-schedule\n',
      },
    },

    {
      id: 'use-spacetime',
      title: 'useSpacetime — live DB subscriptions',
      summary: 'useLeaderboard / useMatchups / useGameCount hooks subscribe to SpacetimeDB tables.',
      status: 'shipped',
      files: ['src/hooks/useSpacetime.ts'],
      layers: {
        abstract:
          'Each hook opens a subscription on a single table (or joined view) and re-renders the consumer when rows ' +
          'arrive. Subscriptions are cached at the connection level; multiple consumers of the same hook share one ' +
          'underlying socket. Failure mode: if the maincloud is unreachable, the hooks return empty data and ' +
          'ConnectionIndicator flips to disconnected.',
        iface:
          'public final class UseSpacetime {                 // collection of React hooks\n' +
          '    public static {ModelStats[], boolean} useLeaderboard();\n' +
          '    public static {Matchup[],    boolean} useMatchups();\n' +
          '    public static {int,          boolean} useGameCount();\n' +
          '    // boolean = "ready" — false until the initial sync applies\n' +
          '}',
        pseudocode:
          'useLeaderboard():\n' +
          '    const [rows, setRows]   = useState([])\n' +
          '    const [models, setModels] = useState([])\n' +
          '    const [ready, setReady] = useState(false)\n' +
          '    useEffect(once):\n' +
          '        conn = getConnection()\n' +
          '        conn.db.game.onInsert((_, g) => setRows(prev => [...prev, g]))\n' +
          '        conn.db.model.onInsert((_, m) => setModels(prev => [...prev, m]))\n' +
          '        conn.subscriptionBuilder().onApplied(() => setReady(true))\n' +
          '             .subscribe(["SELECT * FROM game", "SELECT * FROM model"])\n' +
          '    derive ModelStats[] by joining rows with models, return [stats, ready]\n',
      },
    },

    {
      id: 'use-openrouter-models',
      title: 'useOpenRouterModels — live model catalog',
      summary: 'Fetches /v1/models from OpenRouter, caches 24 h in localStorage, falls back to a curated list.',
      status: 'shipped',
      files: ['src/hooks/useOpenRouterModels.ts'],
      layers: {
        abstract:
          'The OpenRouter catalog has 300+ models and changes frequently. The hook caches the list in localStorage ' +
          'for 24 h so it doesn\'t hammer the endpoint, refreshes on stale, and falls back to a curated 10-model list ' +
          'if the fetch fails entirely (offline, network error).',
        iface:
          'public interface UseOpenRouterModels {\n' +
          '    {id, name}[]  models;\n' +
          '    boolean       loading;\n' +
          '    String?       error;\n' +
          '}',
        pseudocode:
          'useOpenRouterModels():\n' +
          '    const [state, setState] = useState({models: [], loading: true, error: null})\n' +
          '    useEffect(once):\n' +
          '        cached = readCache("openrouter_models", maxAgeMs=24h)\n' +
          '        if cached: setState({models: cached, loading: false, error: null}); return\n' +
          '        try:\n' +
          '            list = await fetch("https://openrouter.ai/api/v1/models").json()\n' +
          '            models = list.data.map(m => ({id: m.id, name: m.name}))\n' +
          '            writeCache("openrouter_models", models)\n' +
          '            setState({models, loading: false, error: null})\n' +
          '        catch e:\n' +
          '            setState({models: FALLBACK_LIST, loading: false, error: e.message})\n' +
          '    return state\n',
      },
    },
  ],
};
