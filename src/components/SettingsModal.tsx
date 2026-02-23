import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings as SettingsIcon, Key, Timer, Tv, Eye } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [gameSpeed, setGameSpeed] = useState(500);
  const [cardDelay, setCardDelay] = useState(800);
  const [trickDelay, setTrickDelay] = useState(2000);
  const [youtubeStreamKey, setYoutubeStreamKey] = useState('');
  const [showCards, setShowCards] = useState([true, false, false, false]); // per seat

  useEffect(() => {
    if (isOpen) {
      setOpenRouterKey(localStorage.getItem('spades_openrouter_key') || '');
      setGameSpeed(parseInt(localStorage.getItem('spades_game_speed') || '500'));
      setCardDelay(parseInt(localStorage.getItem('spades_card_delay') || '800'));
      setTrickDelay(parseInt(localStorage.getItem('spades_trick_delay') || '2000'));
      setYoutubeStreamKey(localStorage.getItem('spades_youtube_key') || '');
      setShowCards([
        localStorage.getItem('spades_show_cards_0') !== 'false',
        localStorage.getItem('spades_show_cards_1') === 'true',
        localStorage.getItem('spades_show_cards_2') === 'true',
        localStorage.getItem('spades_show_cards_3') === 'true',
      ]);
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('spades_openrouter_key', openRouterKey);
    localStorage.setItem('spades_game_speed', gameSpeed.toString());
    localStorage.setItem('spades_card_delay', cardDelay.toString());
    localStorage.setItem('spades_trick_delay', trickDelay.toString());
    localStorage.setItem('spades_youtube_key', youtubeStreamKey);
    showCards.forEach((val, i) => localStorage.setItem(`spades_show_cards_${i}`, val.toString()));
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div className="flex items-center gap-2 text-gray-800">
                <SettingsIcon className="w-5 h-5" />
                <h2 className="text-lg font-bold">Settings</h2>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Future settings can go here */}

              {/* ─── Display Settings ─── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Show Player Cards (Face Up)
                </h3>
                <p className="text-xs text-gray-400">
                  Toggle which players' hands are shown face-up on screen
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['South (Seat 0)', 'West (Seat 1)', 'North (Seat 2)', 'East (Seat 3)'].map((label, i) => (
                    <label key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={showCards[i]}
                        onChange={(e) => {
                          const next = [...showCards];
                          next[i] = e.target.checked;
                          setShowCards(next);
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* ─── Timing Settings ─── */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Timer className="w-4 h-4" />
                  Timing
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pause Between Cards
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    How long to wait after each card is played
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="200"
                      max="3000"
                      step="100"
                      value={cardDelay}
                      onChange={(e) => setCardDelay(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-mono w-16 text-right">{cardDelay}ms</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pause After Trick Won
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    How long to display the completed trick before clearing
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="500"
                      max="5000"
                      step="250"
                      value={trickDelay}
                      onChange={(e) => setTrickDelay(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-mono w-16 text-right">{trickDelay}ms</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bot Thinking Speed
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    General delay between bot decisions
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="100"
                      value={gameSpeed}
                      onChange={(e) => setGameSpeed(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-mono w-16 text-right">{gameSpeed}ms</span>
                  </div>
                </div>
              </div>

              {/* ─── YouTube Streaming ─── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Tv className="w-4 h-4" />
                  YouTube Streaming
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    YouTube Stream Key
                  </label>
                  <input
                    type="password"
                    value={youtubeStreamKey}
                    onChange={(e) => setYoutubeStreamKey(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Used by <code className="bg-gray-100 px-1 rounded">npm run stream:live</code> to broadcast to YouTube.
                  </p>
                </div>
              </div>

              {/* ─── API Keys ─── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  API Keys
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OpenRouter API Key
                  </label>
                  <input
                    type="password"
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for GPT-4, Claude, Llama models. Stored locally in your browser.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save & Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
