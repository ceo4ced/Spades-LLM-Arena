/**
 * Seed data — populates the dashboard with sample results so it's never empty.
 * Called once on first load if no data exists.
 */
import { saveResult, saveTournament, getAllResults, GameResult } from './resultsStore';

const MODELS = ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini Pro', 'Llama 405B', 'Heuristic', 'Random'];

function randBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function seedIfEmpty() {
    if (getAllResults().length > 0) return; // Already has data

    // Generate 60 sample game results across various matchups
    const matchups: [string, string, string, string][] = [
        ['GPT-4o', 'Gemini Pro', 'Claude 3.5 Sonnet', 'Llama 405B'],
        ['GPT-4o', 'Heuristic', 'Claude 3.5 Sonnet', 'Random'],
        ['Gemini Pro', 'GPT-4o', 'Heuristic', 'Claude 3.5 Sonnet'],
        ['Llama 405B', 'Heuristic', 'GPT-4o', 'Random'],
        ['Claude 3.5 Sonnet', 'Random', 'Gemini Pro', 'Heuristic'],
        ['GPT-4o', 'Llama 405B', 'Heuristic', 'Gemini Pro'],
        ['Claude 3.5 Sonnet', 'Gemini Pro', 'GPT-4o', 'Heuristic'],
        ['Heuristic', 'Random', 'Llama 405B', 'GPT-4o'],
        ['Gemini Pro', 'Claude 3.5 Sonnet', 'Random', 'Llama 405B'],
        ['GPT-4o', 'Claude 3.5 Sonnet', 'Llama 405B', 'Heuristic'],
        ['Gemini Pro', 'Random', 'Claude 3.5 Sonnet', 'GPT-4o'],
        ['Llama 405B', 'Claude 3.5 Sonnet', 'Heuristic', 'Gemini Pro'],
    ];

    // Win probabilities (higher = more likely team1 wins based on models)
    const strength: Record<string, number> = {
        'GPT-4o': 0.76,
        'Claude 3.5 Sonnet': 0.70,
        'Gemini Pro': 0.61,
        'Llama 405B': 0.63,
        'Heuristic': 0.43,
        'Random': 0.36,
    };

    const results: GameResult[] = [];

    for (let i = 0; i < matchups.length; i++) {
        const [t1a, t2a, t1b, t2b] = matchups[i];
        const gamesPerMatchup = randBetween(4, 7);

        for (let g = 0; g < gamesPerMatchup; g++) {
            const t1Strength = (strength[t1a] + strength[t1b]) / 2;
            const t2Strength = (strength[t2a] + strength[t2b]) / 2;
            const t1WinChance = t1Strength / (t1Strength + t2Strength);
            const t1Wins = Math.random() < t1WinChance;

            const winnerScore = 500 + randBetween(0, 80);
            const loserScore = randBetween(180, 450);

            const daysAgo = randBetween(0, 22);
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);

            const r = saveResult({
                date: date.toISOString(),
                team1Models: [t1a, t1b],
                team2Models: [t2a, t2b],
                team1Score: t1Wins ? winnerScore : loserScore,
                team2Score: t1Wins ? loserScore : winnerScore,
                team1Bags: randBetween(1, 8),
                team2Bags: randBetween(1, 8),
                winner: t1Wins ? 1 : 2,
                targetScore: 500,
                handsPlayed: randBetween(8, 18),
            });
            results.push(r);
        }
    }

    // Create a sample daily tournament
    const tournamentMatches = results.slice(-6);
    saveTournament({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        champion: 'GPT-4o',
        participants: MODELS,
        matches: tournamentMatches,
    });
}
