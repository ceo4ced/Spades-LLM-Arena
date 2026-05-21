import type { DocCategory } from './types';

export const ui: DocCategory = {
  id: 'ui',
  title: 'UI Components',
  intro:
    'Every React component in src/components/. The UI is split between the match flow (GameSetup → GameBoard → Card → ChatPanel) ' +
    'and the post-match analytics surfaces (Dashboard, ModelDetail, Tournament, ConnectionIndicator). Some are fully ' +
    'wired (GameSetup, GameBoard, Dashboard); ModelDetail and Tournament are still partial (see status badges).',
  topics: [
    {
      id: 'game-setup',
      title: 'GameSetup',
      summary: 'Match configuration screen. Variant, target, per-seat model, house rules, auto-start.',
      status: 'shipped',
      files: ['src/components/GameSetup.tsx'],
      layers: {
        abstract:
          'The pre-match form. Lets the user pick variant, target score, the four seats\' models (with provider-specific ' +
          'sub-pickers), and a cheating-mode preset (Strict / Permissive / Penalty / Forfeit). Calls onStart with a fully ' +
          'populated GameConfig. Includes a 60-second idle auto-start that fires a default match using the free ' +
          'OpenRouter model so unattended kiosks keep playing.',
        iface:
          'public class GameSetup extends React.Component {\n' +
          '    interface Props {\n' +
          '        void onStart(GameConfig cfg);\n' +
          '        void onLeaderboard();      // optional\n' +
          '        void onTournament();       // optional\n' +
          '    }\n' +
          '    // Internal state:\n' +
          '    String           variant;\n' +
          '    int              targetScore;\n' +
          '    String           cheatingPresetId;\n' +
          '    GameConfig.Player[] players;\n' +
          '    int              countdown;   // auto-start seconds remaining\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    left column: variant picker, target picker, House Rules preset picker\n' +
          '    right column: 4× renderPlayerConfig(seat) — per-seat type + provider + model select\n' +
          '    footer: [Start Match] [Leaderboard?] [Tournament?]\n' +
          '    overlay: "Auto-start in Ns" + progress bar\n' +
          '\n' +
          'auto-start timer (useEffect):\n' +
          '    every 1s: countdown -= 1\n' +
          '    on countdown <= 0 and not yet auto-started:\n' +
          '        autoConfig = jokers/250/OpenRouter-free × 4\n' +
          '        onStart(autoConfig)\n' +
          '    any click/keydown/touchstart: reset countdown to 60\n' +
          '\n' +
          'handleStart():\n' +
          '    preset = CHEATING_PRESETS.find(p => p.id == cheatingPresetId) ?? Strict\n' +
          '    onStart({variant, players, targetScore, cheatingPolicy: preset.policy})\n',
      },
    },

    {
      id: 'game-board',
      title: 'GameBoard',
      summary: 'Live match view. Seats around a felt, current trick in center, pause/quit controls.',
      status: 'shipped',
      files: ['src/components/GameBoard.tsx'],
      layers: {
        abstract:
          'Pure presentation over the GameState handed in via props. Renders four seats (with bid + tricks-won badges), ' +
          'the current trick in the table center, a side log, and pause/quit controls. When isHumanTurn is true, surfaces ' +
          'bid or play affordances tied to the legal-plays list.',
        iface:
          'public class GameBoard extends React.Component {\n' +
          '    interface Props {\n' +
          '        GameState                       gameState;\n' +
          '        void                            onBid(int v);\n' +
          '        void                            onPlay(String cardId);\n' +
          '        boolean                         isHumanTurn;\n' +
          '        String[]                        logs;\n' +
          '        boolean                         isPaused;\n' +
          '        void                            onTogglePause();\n' +
          '        void                            onQuitGame();\n' +
          '    }\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    4 seat panels at compass points; each shows: name, bid, tricks won, hand (face-down except human)\n' +
          '    center table:\n' +
          '        for each play in gameState.currentTrick.plays: draw Card at seat\'s edge\n' +
          '    if isHumanTurn and phase == bidding: show 0..13 bid buttons\n' +
          '    if isHumanTurn and phase == playing: highlight legal_plays in human seat\'s hand, click → onPlay(id)\n' +
          '    side panel: scrolling log of last 50 logs\n' +
          '    top bar: pause (toggles), quit (calls onQuitGame), score scoreboard\n',
      },
    },

    {
      id: 'card',
      title: 'Card',
      summary: 'Visual card primitive. Faces, backs, suit colors, hover/selectable states.',
      status: 'shipped',
      files: ['src/components/Card.tsx'],
      layers: {
        abstract:
          'A single playing card. Accepts a card id string ("AS", "10H", "BigJoker") or null for face-down. Renders ' +
          'with suit-coloured pip + corner indices; selectable variant draws a hover ring; disabled variant dims.',
        iface:
          'public class Card extends React.Component {\n' +
          '    interface Props {\n' +
          '        String?  cardId;          // null = face-down\n' +
          '        boolean  selectable;\n' +
          '        boolean  disabled;\n' +
          '        boolean  highlighted;     // e.g., legal play indicator\n' +
          '        void     onClick();       // optional\n' +
          '    }\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    if cardId is null: draw card back\n' +
          '    else:\n' +
          '        {rank, suit} = parseCard(cardId)\n' +
          '        color = (suit in {H, D}) ? red : black; (J suit → purple)\n' +
          '        draw rank + suit-glyph at top-left and bottom-right\n' +
          '        draw large central glyph\n' +
          '    if selectable: add hover ring; on click → onClick()\n' +
          '    if disabled: opacity 0.5, pointer-events none\n' +
          '    if highlighted: green outline\n',
      },
    },

    {
      id: 'chat-panel',
      title: 'ChatPanel',
      summary: 'Side panel showing parsed agent "chat" lines plus the raw game log.',
      status: 'partial',
      files: ['src/components/ChatPanel.tsx'],
      layers: {
        abstract:
          'Renders two streams: parsed ChatMessages (agent bids becoming "I\'ll bid N. 🤔" lines, hand summaries, game-over ' +
          'notices) and the raw rolling log. The ChatMessage parsing lives in App.tsx today, not in the panel itself. ' +
          'The schema has chat_policy + Communication + Accusation tables for real agent-to-agent chat, but no chat is ' +
          'yet wired into the engine — the panel currently just narrates engine events.',
        iface:
          'public class ChatPanel extends React.Component {\n' +
          '    interface Props { ChatMessage[] messages; String[] logs; }\n' +
          '\n' +
          '    public class ChatMessage {\n' +
          '        int     id;\n' +
          '        String  sender;\n' +
          '        int     seat;\n' +
          '        int     team;\n' +
          '        String  text;\n' +
          '        String  type;       // "chat" | "round_summary" | "action"\n' +
          '        long    timestamp;\n' +
          '    }\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    top half: scrolling list of messages, styled by type\n' +
          '        chat            → bubble, team-coloured\n' +
          '        round_summary   → block card with the hand-result text\n' +
          '        action          → centred system line\n' +
          '    bottom half: collapsible "Game Log" with the raw logs[] array, monospace\n' +
          '\n' +
          '// Note: real agent-to-agent chat (Communication table) is not yet wired.\n' +
          '// The "chat messages" are currently parsed from engine logs in App.tsx.\n',
      },
    },

    {
      id: 'dashboard',
      title: 'Dashboard',
      summary: 'Leaderboard + matchup grid + total game count. Reads live from SpacetimeDB.',
      status: 'shipped',
      files: ['src/components/Dashboard.tsx'],
      layers: {
        abstract:
          'Subscribes to model + game tables via useSpacetime hooks. Top tiles: total games played, leader\'s win rate. ' +
          'Main grid: per-model win rate, total points, games played, sorted by win rate desc. Side panel: head-to-head ' +
          'matchups between every model pair. Tournament panel is rendered but currently empty (no module-side ' +
          'tournament rows yet).',
        iface:
          'public class Dashboard extends React.Component {\n' +
          '    interface Props {\n' +
          '        void onBack();\n' +
          '        void onPlay();\n' +
          '        void onModelClick(String name);\n' +
          '    }\n' +
          '    // Subscribed reads (via useSpacetime hooks):\n' +
          '    int            gameCount;\n' +
          '    ModelStats[]   leaderboard;\n' +
          '    Matchup[]      matchups;\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    const {leaderboard, ready: lbReady}  = useLeaderboard()\n' +
          '    const {matchups,    ready: mReady}   = useMatchups()\n' +
          '    const {count}                        = useGameCount()\n' +
          '\n' +
          '    if not (lbReady and mReady): show loading skeleton\n' +
          '    else:\n' +
          '        top tiles: gameCount, top-model win rate\n' +
          '        table: leaderboard.map(row → <tr onClick={() => onModelClick(row.model)} />)\n' +
          '        side: matchup grid (model × model with W-L)\n' +
          '        bottom: Tournament panel (empty state — no tournament rows yet)\n',
      },
    },

    {
      id: 'model-detail',
      title: 'ModelDetail',
      summary: 'Per-model deep dive. Still reads localStorage; pending migration to SpacetimeDB.',
      status: 'partial',
      files: ['src/components/ModelDetail.tsx'],
      layers: {
        abstract:
          'Clicking a model name on the Dashboard navigates here. Shows games played, win/loss rate, ' +
          'recent-games list, and an opponent breakdown. Currently reads from the localStorage resultsStore — so ' +
          'on a fresh maincloud-only user, this page is empty. Migration to useSpacetime is the top item in the ' +
          '"what\'s left" list in README.',
        iface:
          'public class ModelDetail extends React.Component {\n' +
          '    interface Props {\n' +
          '        String modelName;\n' +
          '        void   onBack();\n' +
          '        void   onPlay();\n' +
          '    }\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    games  = getModelResults(modelName)            // ← still localStorage\n' +
          '    wins   = games.filter(g => winningTeamModels(g).includes(modelName)).length\n' +
          '    losses = games.length - wins\n' +
          '\n' +
          '    top tiles: name, games, wins, losses, winRate\n' +
          '    chart:    points per game over time\n' +
          '    table:    games.sortByDate.desc → date, opponents, score, winner\n' +
          '    [Back] [Play with this model]\n' +
          '\n' +
          '// TODO: swap getModelResults for a SpacetimeDB-backed equivalent.\n',
      },
    },

    {
      id: 'tournament',
      title: 'Tournament (wireframe)',
      summary: 'UI wireframe. Schema has tournament_id but no module-side concept yet.',
      status: 'wireframe',
      files: ['src/components/Tournament.tsx'],
      layers: {
        abstract:
          'The visual scaffolding for a future bracket / round-robin view. Render-only — the Game row has an optional ' +
          'tournament_id field but no reducer creates Tournament rows on a schedule, and no client logic batches games ' +
          'into a tournament. Wiring this up is item #3 in README\'s "where we\'re going" list.',
        iface:
          'public class Tournament extends React.Component {\n' +
          '    interface Props { void onBack(); }\n' +
          '    // No live data wired in.\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    header: "Tournament — coming soon"\n' +
          '    placeholder bracket UI with dummy matchups\n' +
          '    [Back]\n' +
          '\n' +
          '// To make real:\n' +
          '//   1. start_tournament reducer (exists) → returns id\n' +
          '//   2. UI form: name + format + participants + schedule\n' +
          '//   3. record_complete_game(tournamentId: id, …) per game\n' +
          '//   4. complete_tournament(id, champion)\n' +
          '//   5. Query games by tournament_id for the bracket\n',
      },
    },

    {
      id: 'splash-screen',
      title: 'SplashScreen',
      summary: 'Title-card intro shown on first load. Calls onComplete after a fixed delay.',
      status: 'shipped',
      files: ['src/components/SplashScreen.tsx'],
      layers: {
        abstract:
          'Brief animated title card; auto-advances to GameSetup. Pure presentation, no game logic.',
        iface:
          'public class SplashScreen extends React.Component {\n' +
          '    interface Props { void onComplete(); }\n' +
          '}',
        pseudocode:
          'useEffect(once):\n' +
          '    timer = setTimeout(onComplete, INTRO_DURATION_MS)\n' +
          '    return () => clearTimeout(timer)\n' +
          'render():\n' +
          '    fullscreen gradient + animated title "Spades LLM Arena"\n' +
          '    optional [Skip] button → onComplete\n',
      },
    },

    {
      id: 'settings-modal',
      title: 'SettingsModal',
      summary: 'Cosmetic timing settings (card delay, trick delay, game speed). localStorage-backed.',
      status: 'shipped',
      files: ['src/components/SettingsModal.tsx'],
      layers: {
        abstract:
          'Stored in localStorage as spades_card_delay, spades_trick_delay, spades_game_speed (milliseconds). ' +
          'useGame.runLoop reads them on each iteration so changes take effect mid-match.',
        iface:
          'public class SettingsModal extends React.Component {\n' +
          '    interface Props { boolean isOpen; void onClose(); }\n' +
          '    // Reads/writes the three localStorage keys directly.\n' +
          '}',
        pseudocode:
          'render():\n' +
          '    sliders bound to:\n' +
          '        spades_card_delay   (ms between cards)\n' +
          '        spades_trick_delay  (ms after a trick resolves)\n' +
          '        spades_game_speed   (ms minimum per bot decision)\n' +
          '    each onChange: localStorage.setItem(key, value)\n' +
          '    [Close] → onClose()\n',
      },
    },

    {
      id: 'connection-indicator',
      title: 'ConnectionIndicator',
      summary: 'Tiny corner indicator: SpacetimeDB connected / disconnected / reconnecting.',
      status: 'shipped',
      files: ['src/components/ConnectionIndicator.tsx'],
      layers: {
        abstract:
          'Mounted alongside every screen. Subscribes to DbConnection state events and shows a small dot ' +
          '(green / yellow / red) in the corner. Click expands a tooltip with the connected URI + module.',
        iface:
          'public class ConnectionIndicator extends React.Component {\n' +
          '    // No props. Reads connection status from spacetime-client singleton.\n' +
          '}',
        pseudocode:
          'useEffect(once):\n' +
          '    conn = getConnection()\n' +
          '    conn.onConnect(() => setStatus("connected"))\n' +
          '    conn.onDisconnect(() => setStatus("disconnected"))\n' +
          'render():\n' +
          '    fixed bottom-right dot, color by status\n' +
          '    click → tooltip with uri + module name + last-heartbeat\n',
      },
    },
  ],
};
