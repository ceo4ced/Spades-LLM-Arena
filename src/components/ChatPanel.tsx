import React, { useEffect, useRef } from 'react';

export interface ChatMessage {
    id: number;
    sender: string;       // Bot name
    seat: number;         // 0-3
    team: 1 | 2;
    text: string;
    type: 'chat' | 'action' | 'round_summary';  // chat = bot talking, action = game event, round_summary = end-of-hand
    timestamp: number;
}

interface ChatPanelProps {
    messages: ChatMessage[];
    logs: string[];         // game event log (plays, bids, etc.)
}

const TEAM_COLORS = {
    1: { bg: 'bg-blue-900/40', border: 'border-blue-500/30', name: 'text-blue-300', dot: 'bg-blue-400' },
    2: { bg: 'bg-red-900/40', border: 'border-red-500/30', name: 'text-red-300', dot: 'bg-red-400' },
} as const;

const SUIT_MAP: Record<string, { symbol: string; color: string }> = {
    'S': { symbol: '♠', color: 'text-black' },
    'H': { symbol: '♥', color: 'text-red-600' },
    'D': { symbol: '♦', color: 'text-red-600' },
    'C': { symbol: '♣', color: 'text-black' },
};

/** Replace card codes like "4S", "KH", "10D" in a string with colored rank+suit symbols */
const renderLogWithCards = (text: string): React.ReactNode => {
    // Match card codes: rank (A,K,Q,J,10,2-9) followed by suit (S,H,D,C)
    const parts = text.split(/((?:10|[AKQJ2-9])[SHDC])/g);
    return parts.map((part, i) => {
        const match = part.match(/^(10|[AKQJ2-9])([SHDC])$/);
        if (match) {
            const [, rank, suit] = match;
            const info = SUIT_MAP[suit];
            return (
                <span key={i} className={`${info.color} font-bold`}>
                    {rank}{info.symbol}
                </span>
            );
        }
        return <span key={i}>{part}</span>;
    });
};

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, logs }) => {
    const chatEndRef = useRef<HTMLDivElement>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll chat to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-scroll log to bottom
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="w-full h-full bg-gray-950 flex flex-col">
            {/* Header */}
            <div className="flex-none px-3 py-2 bg-gray-900 border-b border-gray-700">
                <h2 className="text-sm font-bold text-white tracking-wide">♠ Arena Chat</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">Viewers monitor for illegal communication</p>
            </div>

            {/* Chat Messages — takes most of the space */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1.5">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-600 text-xs mt-8">
                        <div className="text-2xl mb-2">♠</div>
                        <div>Waiting for game to start...</div>
                        <div className="mt-1 text-[10px] text-gray-700">Bots will chat here during play</div>
                    </div>
                ) : (
                    messages.map((msg) => {
                        if (msg.type === 'action') {
                            return (
                                <div key={msg.id} className="text-center">
                                    <span className="text-[10px] text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-full">
                                        {msg.text}
                                    </span>
                                </div>
                            );
                        }

                        if (msg.type === 'round_summary') {
                            return (
                                <div key={msg.id} className="bg-yellow-900/30 border border-yellow-500/40 rounded-lg px-3 py-2 my-1">
                                    <div className="text-[11px] font-bold text-yellow-300 mb-1 text-center">🏆 {msg.sender}</div>
                                    <div className="text-[10px] text-gray-200 leading-relaxed whitespace-pre-line">{msg.text}</div>
                                </div>
                            );
                        }

                        // Bot chat message
                        const colors = TEAM_COLORS[msg.team];
                        return (
                            <div key={msg.id} className={`${colors.bg} ${colors.border} border rounded-lg px-2.5 py-1.5`}>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                                    <span className={`text-[11px] font-bold ${colors.name}`}>{msg.sender}</span>
                                    <span className="text-[9px] text-gray-600 ml-auto">T{msg.team}</span>
                                </div>
                                <div className="text-xs text-gray-300 leading-relaxed">{msg.text}</div>
                            </div>
                        );
                    })
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Divider */}
            <div className="flex-none px-3 py-1 bg-gray-900 border-t border-b border-gray-700">
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Game Log</h3>
            </div>

            {/* Game Log — white background so black suits show clearly */}
            <div className="h-[30%] shrink-0 overflow-y-auto px-2 py-1 space-y-0.5 bg-white">
                {logs.map((log, i) => (
                    <div key={i} className="text-[10px] text-gray-700 font-mono leading-tight">
                        {renderLogWithCards(log)}
                    </div>
                ))}
                <div ref={logEndRef} />
            </div>

            {/* Footer */}
            <div className="flex-none px-3 py-1.5 bg-gray-900 border-t border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-gray-500">LIVE</span>
                </div>
                <span className="text-[10px] text-gray-600">♠ Spades LLM Arena</span>
            </div>
        </div>
    );
};
