import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { getModelResults, getLeaderboard, getMatchups } from '../engine/resultsStore';

interface ModelDetailProps {
    modelName: string;
    onBack: () => void;
    onPlay?: () => void;
}

export const ModelDetail: React.FC<ModelDetailProps> = ({ modelName, onBack, onPlay }) => {
    const results = useMemo(() => getModelResults(modelName), [modelName]);
    const leaderboard = useMemo(() => getLeaderboard(), []);
    const matchups = useMemo(() => getMatchups(), []);

    const stats = leaderboard.find(s => s.model === modelName);
    const winRate = stats && stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
    const avgPoints = stats && stats.gamesPlayed > 0 ? Math.round(stats.totalPoints / stats.gamesPlayed) : 0;

    // Head-to-head vs each opponent
    const h2h = useMemo(() => {
        const records: { opponent: string; wins: number; losses: number }[] = [];
        for (const m of matchups) {
            if (m.model1 === modelName) {
                records.push({ opponent: m.model2, wins: m.model1Wins, losses: m.model2Wins });
            } else if (m.model2 === modelName) {
                records.push({ opponent: m.model1, wins: m.model2Wins, losses: m.model1Wins });
            }
        }
        return records.sort((a, b) => b.wins - a.wins);
    }, [matchups, modelName]);

    // Recent games (last 10)
    const recentGames = results.slice(-10).reverse();

    return (
        <div className="h-screen flex flex-col bg-[#0f1923] text-white overflow-hidden">
            {/* ── Top Nav ──────────────────────────────────── */}
            <nav className="flex items-center justify-between px-6 py-3 bg-[#0a1219] border-b border-white/10 shrink-0">
                <button onClick={onPlay || onBack} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <span className="text-2xl">♠</span>
                    <span className="text-lg font-bold tracking-tight">Spades <span className="text-green-400">LLM Arena</span></span>
                </button>
                <div className="flex gap-2">
                    {onPlay && (
                        <button
                            onClick={onPlay}
                            className="px-4 py-1.5 text-sm rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10"
                        >
                            Play
                        </button>
                    )}
                    <button
                        onClick={onBack}
                        className="px-4 py-1.5 text-sm rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10"
                    >
                        ← Back to Leaderboard
                    </button>
                </div>
            </nav>

            {/* ── Scrollable Content ───────────────────────── */}
            <div className="flex-1 overflow-y-auto subtle-scroll p-6 space-y-4">
                {/* Model Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#162029] border border-white/10 rounded-xl p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">{modelName}</h1>
                            <p className="text-sm text-gray-400 mt-1">Model Performance Overview</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-green-400">{winRate}%</div>
                            <div className="text-xs text-gray-500">Win Rate</div>
                        </div>
                    </div>
                </motion.div>

                {/* Stat Cards */}
                <div className="grid grid-cols-4 gap-3">
                    {[
                        { label: 'Games Played', value: stats?.gamesPlayed ?? 0, icon: '🎮' },
                        { label: 'Wins', value: stats?.wins ?? 0, icon: '✅', color: 'text-green-400' },
                        { label: 'Losses', value: stats?.losses ?? 0, icon: '❌', color: 'text-red-400' },
                        { label: 'Avg Points/Game', value: avgPoints, icon: '📊', color: 'text-yellow-300' },
                    ].map((card, i) => (
                        <motion.div
                            key={card.label}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-[#162029] border border-white/10 rounded-lg p-3"
                        >
                            <div className="text-xs text-gray-500">{card.label}</div>
                            <div className={`text-2xl font-bold mt-1 ${card.color || 'text-white'}`}>
                                {card.icon} {card.value}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Two Columns: H2H + Recent Games */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Head-to-Head Records */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#162029] border border-white/10 rounded-xl p-4"
                    >
                        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                            <span>⚔️</span> Head-to-Head Records
                        </h2>
                        {h2h.length === 0 ? (
                            <div className="text-sm text-gray-600 text-center py-4">No matchup data</div>
                        ) : (
                            <div className="space-y-1">
                                {h2h.map(r => (
                                    <div key={r.opponent} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
                                        <span className="text-sm truncate flex-1">{r.opponent}</span>
                                        <span className={`text-sm font-bold font-mono ${r.wins > r.losses ? 'text-green-400' : r.wins < r.losses ? 'text-red-400' : 'text-yellow-400'}`}>
                                            {r.wins}-{r.losses}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Recent Games */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="bg-[#162029] border border-white/10 rounded-xl p-4"
                    >
                        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                            <span>📋</span> Recent Games
                        </h2>
                        {recentGames.length === 0 ? (
                            <div className="text-sm text-gray-600 text-center py-4">No games yet</div>
                        ) : (
                            <div className="space-y-1">
                                {recentGames.map((g, i) => {
                                    const onTeam1 = g.team1Models.includes(modelName);
                                    const won = (onTeam1 && g.winner === 1) || (!onTeam1 && g.winner === 2);
                                    const myScore = onTeam1 ? g.team1Score : g.team2Score;
                                    const oppScore = onTeam1 ? g.team2Score : g.team1Score;
                                    const opponents = onTeam1 ? g.team2Models : g.team1Models;
                                    return (
                                        <div key={i} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {won ? 'W' : 'L'}
                                            </span>
                                            <span className="text-xs text-gray-400 flex-1 mx-2 truncate">vs {opponents.join(', ')}</span>
                                            <span className="text-xs font-mono text-gray-300">{myScore}-{oppScore}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* ── Premium Section (Paywall) ──────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-[#162029] border border-yellow-500/20 rounded-xl p-6 relative overflow-hidden"
                >
                    {/* Blur overlay */}
                    <div className="absolute inset-0 bg-[#162029]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                        <span className="text-4xl mb-2">🔒</span>
                        <h3 className="text-lg font-bold text-yellow-300">Advanced Analytics</h3>
                        <p className="text-sm text-gray-400 mt-1 text-center max-w-sm">
                            Unlock bid accuracy, nil success rates, partner synergy scores, and more.
                        </p>
                        <button className="mt-4 px-6 py-2 bg-yellow-500 text-black font-bold rounded-lg text-sm hover:bg-yellow-400 transition-colors">
                            Subscribe for Premium
                        </button>
                    </div>

                    {/* Blurred content behind */}
                    <div className="opacity-30">
                        <h2 className="text-sm font-bold mb-3">Advanced Metrics</h2>
                        <div className="grid grid-cols-3 gap-3">
                            {['Bid Accuracy', 'Nil Success Rate', 'Overtrick Tendency', 'Partner Synergy', 'Avg Tricks/Hand', 'Bag Rate'].map(metric => (
                                <div key={metric} className="bg-white/5 rounded-lg p-3">
                                    <div className="text-xs text-gray-500">{metric}</div>
                                    <div className="text-xl font-bold text-gray-400 mt-1">--</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};
