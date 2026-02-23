/**
 * Results Store — persists game results to localStorage
 * Powers the leaderboard, matchup grid, and tournament tracking
 */

export interface GameResult {
    id: string;
    date: string;                    // ISO string
    tournamentId?: string;           // links to a daily tournament
    team1Models: string[];           // model names for seats 0, 2
    team2Models: string[];           // model names for seats 1, 3
    team1Score: number;
    team2Score: number;
    team1Bags: number;
    team2Bags: number;
    winner: 1 | 2;
    targetScore: number;
    handsPlayed: number;
}

export interface ModelStats {
    model: string;
    wins: number;
    losses: number;
    totalPoints: number;
    totalBags: number;
    gamesPlayed: number;
}

export interface MatchupRecord {
    model1: string;
    model2: string;
    model1Wins: number;
    model2Wins: number;
}

export interface TournamentResult {
    id: string;
    date: string;
    champion: string;
    participants: string[];
    matches: GameResult[];
}

const STORAGE_KEY = 'spades_arena_results';
const TOURNAMENT_KEY = 'spades_arena_tournaments';

// ─── Read / Write ───────────────────────────────────────

function getResults(): GameResult[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function writeResults(results: GameResult[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
}

function getTournaments(): TournamentResult[] {
    try {
        const raw = localStorage.getItem(TOURNAMENT_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function writeTournaments(tournaments: TournamentResult[]) {
    localStorage.setItem(TOURNAMENT_KEY, JSON.stringify(tournaments));
}

// ─── Public API ─────────────────────────────────────────

export function saveResult(result: Omit<GameResult, 'id'>): GameResult {
    const results = getResults();
    const newResult: GameResult = { ...result, id: crypto.randomUUID() };
    results.push(newResult);
    writeResults(results);
    return newResult;
}

export function saveTournament(tournament: TournamentResult) {
    const tournaments = getTournaments();
    tournaments.push(tournament);
    writeTournaments(tournaments);
}

export function getAllResults(): GameResult[] {
    return getResults();
}

export function getAllTournaments(): TournamentResult[] {
    return getTournaments();
}

export function getTotalGamesPlayed(): number {
    return getResults().length;
}

/**
 * Build leaderboard sorted by win rate desc, tiebreak by total points desc.
 * Each model that appears in any team is tracked individually.
 */
export function getLeaderboard(): ModelStats[] {
    const results = getResults();
    const statsMap = new Map<string, ModelStats>();

    const ensure = (model: string) => {
        if (!statsMap.has(model)) {
            statsMap.set(model, { model, wins: 0, losses: 0, totalPoints: 0, totalBags: 0, gamesPlayed: 0 });
        }
        return statsMap.get(model)!;
    };

    for (const r of results) {
        // Each model on the winning team gets a win; losing team gets a loss
        const t1Models = r.team1Models;
        const t2Models = r.team2Models;

        for (const m of t1Models) {
            const s = ensure(m);
            s.gamesPlayed++;
            s.totalPoints += r.team1Score;
            s.totalBags += r.team1Bags;
            if (r.winner === 1) s.wins++; else s.losses++;
        }
        for (const m of t2Models) {
            const s = ensure(m);
            s.gamesPlayed++;
            s.totalPoints += r.team2Score;
            s.totalBags += r.team2Bags;
            if (r.winner === 2) s.wins++; else s.losses++;
        }
    }

    return Array.from(statsMap.values()).sort((a, b) => {
        const aRate = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0;
        const bRate = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0;
        if (bRate !== aRate) return bRate - aRate;
        return b.totalPoints - a.totalPoints;
    });
}

/**
 * Get head-to-head records between all model pairs.
 */
export function getMatchups(): MatchupRecord[] {
    const results = getResults();
    const key = (a: string, b: string) => [a, b].sort().join('|||');
    const map = new Map<string, MatchupRecord>();

    for (const r of results) {
        for (const m1 of r.team1Models) {
            for (const m2 of r.team2Models) {
                const k = key(m1, m2);
                if (!map.has(k)) {
                    const [sorted1, sorted2] = [m1, m2].sort();
                    map.set(k, { model1: sorted1, model2: sorted2, model1Wins: 0, model2Wins: 0 });
                }
                const rec = map.get(k)!;
                // Determine which sorted model won
                const winnerModels = r.winner === 1 ? r.team1Models : r.team2Models;
                if (winnerModels.includes(rec.model1)) rec.model1Wins++;
                else rec.model2Wins++;
            }
        }
    }

    return Array.from(map.values());
}

/**
 * Get detailed results for a specific model.
 */
export function getModelResults(modelName: string): GameResult[] {
    return getResults().filter(
        r => r.team1Models.includes(modelName) || r.team2Models.includes(modelName)
    );
}

/**
 * Clear all stored data (for dev/testing).
 */
export function clearAllData() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOURNAMENT_KEY);
}
