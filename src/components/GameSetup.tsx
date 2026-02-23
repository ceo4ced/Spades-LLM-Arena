import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameConfig } from '../engine/types';
import { motion } from 'motion/react';
import { SettingsModal } from './SettingsModal';
import { Settings as SettingsIcon } from 'lucide-react';

interface GameSetupProps {
  onStart: (config: GameConfig) => void;
  onLeaderboard?: () => void;
}

const OPENROUTER_MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b', name: 'Hermes 3 405B' },
  { id: 'microsoft/phi-3-medium-128k-instruct', name: 'Phi-3 Medium' },
];

export const GameSetup: React.FC<GameSetupProps> = ({ onStart, onLeaderboard }) => {
  const [variant, setVariant] = useState<'standard' | 'jokers'>('standard');
  const [targetScore, setTargetScore] = useState<number>(500);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Players organized by Team
  // Team 1: Seat 0 & 2
  // Team 2: Seat 1 & 3
  const [players, setPlayers] = useState<GameConfig['players']>([
    { seat: 0, type: 'bot', model: 'heuristic', name: 'Bot 1 (Team 1)' },
    { seat: 1, type: 'bot', model: 'heuristic', name: 'Bot 2 (Team 2)' },
    { seat: 2, type: 'bot', model: 'heuristic', name: 'Bot 3 (Team 1)' },
    { seat: 3, type: 'bot', model: 'heuristic', name: 'Bot 4 (Team 2)' },
  ]);

  const updatePlayer = (seat: number, field: keyof typeof players[0], value: any) => {
    const newPlayers = [...players];
    newPlayers[seat] = { ...newPlayers[seat], [field]: value };
    setPlayers(newPlayers);
  };

  const handleStart = () => {
    const openRouterKey = localStorage.getItem('spades_openrouter_key') || '';
    onStart({ variant, players, targetScore, openrouter_api_key: openRouterKey });
  };

  // ─── Auto-start countdown (60s idle) ─────────────────
  const AUTO_START_SECONDS = 60;
  const [countdown, setCountdown] = useState(AUTO_START_SECONDS);
  const countdownRef = useRef(AUTO_START_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoStarted = useRef(false);

  // Available models for auto-start random pairings
  const AUTO_MODELS: GameConfig['players'][0]['model'][] = ['heuristic', 'random', 'heuristic', 'random'];
  const AUTO_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

  const autoStart = useCallback(() => {
    if (hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    // TODO: Check for tournament schedule here — if tournament exists, defer to it
    const openRouterKey = localStorage.getItem('spades_openrouter_key') || '';
    const autoConfig: GameConfig = {
      variant: 'jokers',
      targetScore: 250,
      openrouter_api_key: openRouterKey,
      players: [
        { seat: 0, type: 'bot', model: 'heuristic', name: 'Alpha (T1)' },
        { seat: 1, type: 'bot', model: 'random', name: 'Bravo (T2)' },
        { seat: 2, type: 'bot', model: 'heuristic', name: 'Charlie (T1)' },
        { seat: 3, type: 'bot', model: 'random', name: 'Delta (T2)' },
      ],
    };
    onStart(autoConfig);
  }, [onStart]);

  // Reset countdown on any interaction
  const resetCountdown = useCallback(() => {
    countdownRef.current = AUTO_START_SECONDS;
    setCountdown(AUTO_START_SECONDS);
  }, []);

  useEffect(() => {
    // Start interval
    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        autoStart();
      }
    }, 1000);

    // Reset on deliberate user interaction (not mousemove — that resets too easily)
    const events = ['click', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetCountdown));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      events.forEach(e => window.removeEventListener(e, resetCountdown));
    };
  }, [autoStart, resetCountdown]);

  const renderPlayerConfig = (seat: number, label: string) => {
    const player = players[seat];
    return (
      <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-700">{label}</span>
          <span className="text-xs text-gray-500 uppercase">{player.type}</span>
        </div>

        <input
          type="text"
          value={player.name}
          onChange={(e) => updatePlayer(seat, 'name', e.target.value)}
          className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm"
          placeholder="Name"
        />

        <select
          value={player.type}
          onChange={(e) => updatePlayer(seat, 'type', e.target.value as 'human' | 'bot')}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value="bot">Bot</option>
          <option value="human">Human</option>
        </select>

        {player.type === 'bot' && (
          <>
            <select
              value={player.model}
              onChange={(e) => updatePlayer(seat, 'model', e.target.value)}
              className="bg-white border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="heuristic">Heuristic (Rule-based)</option>
              <option value="random">Random (Baseline)</option>
              <option value="gemini-flash">Gemini Flash</option>
              <option value="gemini-pro">Gemini Pro</option>
              <option value="openrouter">OpenRouter LLM</option>
            </select>

            {player.model === 'openrouter' && (
              <select
                value={player.openrouter_model || OPENROUTER_MODELS[0].id}
                onChange={(e) => updatePlayer(seat, 'openrouter_model', e.target.value)}
                className="bg-white border border-gray-300 rounded px-2 py-1 text-xs"
              >
                {OPENROUTER_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex items-center justify-center p-4 relative bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 overflow-hidden">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-5xl w-full max-h-[90vh] overflow-y-auto relative z-10"
      >
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-8 right-8 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors group"
          title="Settings"
        >
          <SettingsIcon className="w-6 h-6 text-gray-600 group-hover:text-gray-800" />
        </button>

        {/* Auto-start countdown — upper left */}
        <div className="absolute top-8 left-8 flex items-center gap-2">
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-gray-400 tracking-wide">
              Auto-start in
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold font-mono text-gray-600">{countdown}s</span>
              <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / AUTO_START_SECONDS) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">Spades AI Benchmark</h1>
        <p className="text-center text-gray-500 mb-8">Configure teams and AI models to compete.</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Game Settings */}
          <div className="space-y-6 lg:col-span-1">
            <h2 className="text-xl font-bold text-gray-700 border-b pb-2">Game Rules</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Variant</label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setVariant('standard')}
                  className={`py-2 px-4 rounded-lg border-2 text-left transition-all ${variant === 'standard'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                  Standard (52 Cards)
                  <div className="text-xs font-normal opacity-75">Classic Spades. Ace is high.</div>
                </button>
                <button
                  onClick={() => setVariant('jokers')}
                  className={`py-2 px-4 rounded-lg border-2 text-left transition-all ${variant === 'jokers'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                  Jokers (Big/Little)
                  <div className="text-xs font-normal opacity-75">Includes Big & Little Jokers.</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Score</label>
              <div className="flex gap-2">
                {[250, 500, 1000].map(score => (
                  <button
                    key={score}
                    onClick={() => setTargetScore(score)}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${targetScore === score
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t text-sm text-gray-600 space-y-2">
              <p><strong>Heuristic:</strong> Rule-based logic. Fast and consistent baseline.</p>
              <p><strong>Random:</strong> Plays completely randomly. Useful for testing.</p>
            </div>
          </div>

          {/* Right Column: Teams */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-6">
            {/* Team 1 */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-blue-600 border-b border-blue-200 pb-2">Team 1</h2>
              {renderPlayerConfig(0, 'Player 1 (South)')}
              {renderPlayerConfig(2, 'Player 3 (North)')}
            </div>

            {/* Team 2 */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-red-600 border-b border-red-200 pb-2">Team 2</h2>
              {renderPlayerConfig(1, 'Player 2 (West)')}
              {renderPlayerConfig(3, 'Player 4 (East)')}
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-center gap-4">
          <button
            onClick={handleStart}
            className="px-12 py-4 bg-green-600 text-white text-xl font-bold rounded-xl shadow-lg hover:bg-green-700 transform hover:scale-105 transition-all"
          >
            Start Match
          </button>
          {onLeaderboard && (
            <button
              onClick={onLeaderboard}
              className="px-8 py-4 bg-gray-800 text-white text-xl font-bold rounded-xl shadow-lg hover:bg-gray-700 transform hover:scale-105 transition-all border border-gray-600"
            >
              🏆 Leaderboard
            </button>
          )}
        </div>
      </motion.div>



      {isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
};
