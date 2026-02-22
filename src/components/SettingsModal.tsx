import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings as SettingsIcon, Key } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [gameSpeed, setGameSpeed] = useState(500);

  useEffect(() => {
    if (isOpen) {
      const storedKey = localStorage.getItem('spades_openrouter_key') || '';
      const storedSpeed = localStorage.getItem('spades_game_speed');
      setOpenRouterKey(storedKey);
      setGameSpeed(storedSpeed ? parseInt(storedSpeed) : 500);
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('spades_openrouter_key', openRouterKey);
    localStorage.setItem('spades_game_speed', gameSpeed.toString());
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
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
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

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Required for using models like GPT-4, Claude 3.5, and Llama 3.1 via OpenRouter.
                  Key is stored locally in your browser.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Game Speed (Delay between turns)
                </label>
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

              {/* Future settings can go here */}
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
