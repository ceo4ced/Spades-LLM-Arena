import React, { useMemo, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
    getLeaderboard,
    getMatchups,
    getTotalGamesPlayed,
    getAllTournaments,
    ModelStats,
    MatchupRecord,
} from '../engine/resultsStore';
import { seedIfEmpty } from '../engine/seedData';

interface DashboardProps {
    onBack: () => void;
    onPlay: () => void;
    onModelClick: (modelName: string) => void;
}

// ─── Medal Icons ────────────────────────────────────────
const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };
const RANK_BG: Record<number, string> = {
    0: 'bg-yellow-900/30 border-yellow-500/40',
    1: 'bg-gray-500/20 border-gray-400/30',
    2: 'bg-amber-900/20 border-amber-600/30',
};

export const Dashboard: React.FC<DashboardProps> = ({ onBack, onPlay, onModelClick }) => {
    // Seed placeholder data if none exists
    const [ready, setReady] = useState(false);
    useEffect(() => { seedIfEmpty(); setReady(true); }, []);

    const leaderboard = useMemo(() => ready ? getLeaderboard() : [], [ready]);
    const matchups = useMemo(() => ready ? getMatchups() : [], [ready]);
    const totalGames = useMemo(() => ready ? getTotalGamesPlayed() : 0, [ready]);
    const tournaments = useMemo(() => ready ? getAllTournaments() : [], [ready]);

    // Derived stats
    const topWinner = leaderboard.length > 0 ? leaderboard[0] : null;
    const highestWinRate = leaderboard.length > 0
        ? leaderboard.reduce((best, s) => {
            const rate = s.gamesPlayed > 0 ? s.wins / s.gamesPlayed : 0;
            const bestRate = best.gamesPlayed > 0 ? best.wins / best.gamesPlayed : 0;
            return rate > bestRate ? s : best;
        })
        : null;
    const todaysChampion = tournaments.length > 0 ? tournaments[tournaments.length - 1].champion : null;

    // All unique model names for matchup grid
    const allModels = useMemo(() => leaderboard.map(s => s.model), [leaderboard]);

    // Build matchup lookup
    const matchupMap = useMemo(() => {
        const map = new Map<string, MatchupRecord>();
        for (const m of matchups) {
            map.set(`${m.model1}|||${m.model2}`, m);
            map.set(`${m.model2}|||${m.model1}`, { model1: m.model2, model2: m.model1, model1Wins: m.model2Wins, model2Wins: m.model1Wins });
        }
        return map;
    }, [matchups]);

    const getRecord = (m1: string, m2: string): string | null => {
        if (m1 === m2) return null;
        const rec = matchupMap.get(`${m1}|||${m2}`);
        if (!rec) return '0-0';
        return `${rec.model1Wins}-${rec.model2Wins}`;
    };

    const getRecordColor = (m1: string, m2: string): string => {
        const rec = matchupMap.get(`${m1}|||${m2}`);
        if (!rec) return 'text-gray-500';
        if (rec.model1Wins > rec.model2Wins) return 'text-green-400';
        if (rec.model1Wins < rec.model2Wins) return 'text-red-400';
        return 'text-yellow-400';
    };

    const winRate = (s: ModelStats) =>
        s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) : 0;

    // Short name helper for matchup grid headers
    const shortName = (name: string) => {
        if (name.length <= 12) return name;
        return name.slice(0, 10) + '…';
    };

    return (
        <div className="h-screen flex flex-col bg-[#0f1923] text-white overflow-hidden">
            {/* ── Top Nav ──────────────────────────────────── */}
            <nav className="flex items-center justify-between px-6 py-3 bg-[#0a1219] border-b border-white/10 shrink-0">
                <button onClick={onBack} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <span className="text-2xl">♠</span>
                    <span className="text-lg font-bold tracking-tight">Spades <span className="text-green-400">LLM Arena</span></span>
                </button>
                <div className="flex gap-1">
                    <button
                        onClick={onPlay}
                        className="px-4 py-1.5 text-sm rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10"
                    >
                        Play
                    </button>
                    <button
                        onClick={() => document.getElementById('leaderboard-section')?.scrollIntoView({ behavior: 'smooth' })}
                        className="px-4 py-1.5 text-sm rounded-lg transition-colors bg-white/10 text-white font-medium"
                    >
                        Leaderboard
                    </button>
                    <button
                        onClick={() => document.getElementById('tournament-section')?.scrollIntoView({ behavior: 'smooth' })}
                        className="px-4 py-1.5 text-sm rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10"
                    >
                        Tournaments
                    </button>
                </div>
            </nav>

            {/* ── Scrollable Content ───────────────────────── */}
            <div className="flex-1 overflow-y-auto subtle-scroll p-4 space-y-4">
                {/* ── Stat Cards Row ─────────────────────────── */}
                <div className="grid grid-cols-3 gap-4">
                    {/* Total Games */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#162029] border border-white/10 rounded-xl p-4"
                    >
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Total Games Played</div>
                        <div className="flex items-end gap-3 mt-1">
                            <span className="text-4xl font-bold text-white">{totalGames}</span>
                            <span className="text-2xl mb-1">♠</span>
                        </div>
                    </motion.div>

                    {/* Today's Champion */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="bg-[#162029] border border-yellow-500/30 rounded-xl p-4"
                    >
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Today's Champion</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-2xl">🏆</span>
                            <span className="text-xl font-bold text-yellow-300">{todaysChampion || 'TBD'}</span>
                        </div>
                        {topWinner && (
                            <div className="text-xs text-gray-500 mt-1">{topWinner.wins + topWinner.losses} games · {winRate(topWinner)}%</div>
                        )}
                    </motion.div>

                    {/* Highest Win Rate */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-[#162029] border border-white/10 rounded-xl p-4"
                    >
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Highest Win Rate</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-lg">📈</span>
                            <span className="text-xl font-bold text-green-400">
                                {highestWinRate ? `${highestWinRate.model} (${winRate(highestWinRate)}%)` : 'N/A'}
                            </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Current Season</div>
                    </motion.div>
                </div>

                {/* ── Middle Row: Leaderboard + Tournament ──── */}
                <div className="grid grid-cols-5 gap-4">
                    {/* Leaderboard (3 cols) */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="col-span-3 bg-[#162029] border border-white/10 rounded-xl p-4"
                        id="leaderboard-section"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">♠</span>
                                <h2 className="text-lg font-bold">Leaderboard</h2>
                            </div>
                            <span className="text-xs text-gray-500">Sort ▾</span>
                        </div>

                        {leaderboard.length === 0 ? (
                            <div className="text-center py-10 text-gray-600">
                                <div className="text-3xl mb-2">🃏</div>
                                <div className="text-sm">No games played yet</div>
                                <div className="text-xs mt-1">Play a match to see the leaderboard</div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {/* Header */}
                                <div className="grid grid-cols-[40px_1fr_50px_50px_60px_70px_50px] text-[10px] text-gray-500 uppercase tracking-wide px-3 py-1">
                                    <span>Rank</span><span>Model</span><span className="text-center">W</span><span className="text-center">L</span>
                                    <span className="text-center">Win%</span><span className="text-center">Total Pts</span><span className="text-center">Bags</span>
                                </div>

                                {leaderboard.map((s, i) => (
                                    <button
                                        key={s.model}
                                        onClick={() => onModelClick(s.model)}
                                        className={`w-full grid grid-cols-[40px_1fr_50px_50px_60px_70px_50px] items-center px-3 py-2.5 rounded-lg border transition-all hover:scale-[1.01] cursor-pointer text-left ${RANK_BG[i] || 'bg-white/5 border-white/5'
                                            }`}
                                    >
                                        <span className="text-sm font-bold">{MEDAL[i] || `${i + 1}.`}</span>
                                        <span className="text-sm font-semibold truncate pr-2">{s.model}</span>
                                        <span className="text-sm text-center font-mono">{s.wins}</span>
                                        <span className="text-sm text-center font-mono">{s.losses}</span>
                                        <span className={`text-sm text-center font-bold ${winRate(s) >= 60 ? 'text-green-400' : winRate(s) >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                            {winRate(s)}%
                                        </span>
                                        <span className="text-sm text-center font-mono text-yellow-300">{s.totalPoints}</span>
                                        <span className="text-sm text-center font-mono text-gray-400">{s.totalBags}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Daily Tournament (2 cols) */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="col-span-2 bg-[#162029] border border-white/10 rounded-xl p-4"
                        id="tournament-section"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">🏆</span>
                            <h2 className="text-lg font-bold">Daily Tournament</h2>
                        </div>

                        {tournaments.length === 0 ? (
                            <div className="text-center py-8 text-gray-600">
                                <div className="text-3xl mb-2">🏟️</div>
                                <div className="text-sm">No tournaments yet</div>
                                <div className="text-xs mt-1">Start a tournament from the Play screen</div>
                            </div>
                        ) : (
                            <div>
                                {/* Latest tournament champion */}
                                {(() => {
                                    const latest = tournaments[tournaments.length - 1];
                                    return (
                                        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-3 text-center">
                                            <div className="text-xs text-gray-400">Day {tournaments.length} Champion:</div>
                                            <div className="text-xl font-bold text-yellow-300 flex items-center justify-center gap-2 mt-1">
                                                <span>🏆</span> {latest.champion}
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1">Won in Final Match</div>
                                        </div>
                                    );
                                })()}

                                {/* Recent match results */}
                                <div className="text-xs text-gray-400 mb-2 font-medium">Recent Match Results</div>
                                <div className="space-y-1">
                                    {tournaments[tournaments.length - 1].matches.slice(-5).map((m, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white/5 rounded px-2 py-1.5 text-xs">
                                            <span className="truncate flex-1">{m.team1Models.join(', ')}</span>
                                            <span className={`font-bold mx-2 ${m.winner === 1 ? 'text-green-400' : 'text-red-400'}`}>
                                                {m.team1Score}
                                            </span>
                                            <span className="text-gray-500 mx-1">-</span>
                                            <span className={`font-bold mx-2 ${m.winner === 2 ? 'text-green-400' : 'text-red-400'}`}>
                                                {m.team2Score}
                                            </span>
                                            <span className="truncate flex-1 text-right">{m.team2Models.join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* ── Head-to-Head Matchups Grid ──────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-[#162029] border border-white/10 rounded-xl p-4"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">⚔️</span>
                        <h2 className="text-lg font-bold">Head-to-Head Matchups</h2>
                    </div>

                    {allModels.length === 0 ? (
                        <div className="text-center py-6 text-gray-600 text-sm">
                            Play games to see head-to-head records
                        </div>
                    ) : (
                        <div className="overflow-x-auto subtle-scroll">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr>
                                        <th className="text-left px-2 py-1.5 text-gray-500 font-medium sticky left-0 bg-[#162029] z-10 min-w-[100px]"></th>
                                        {allModels.map(m => (
                                            <th key={m} className="text-center px-2 py-1.5 text-gray-400 font-medium min-w-[70px]">
                                                {shortName(m)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {allModels.map(row => (
                                        <tr key={row}>
                                            <td className="px-2 py-1.5 font-medium text-gray-300 sticky left-0 bg-[#162029] z-10 border-r border-white/5">
                                                {shortName(row)}
                                            </td>
                                            {allModels.map(col => {
                                                const record = getRecord(row, col);
                                                return (
                                                    <td key={col} className="text-center px-2 py-1.5">
                                                        {record === null ? (
                                                            <span className="text-gray-700">—</span>
                                                        ) : (
                                                            <span className={`font-mono font-bold ${getRecordColor(row, col)}`}>
                                                                {record}
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};
