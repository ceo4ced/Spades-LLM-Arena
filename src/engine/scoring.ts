import { PlayerState, TeamState } from './types';

export function calculateTeamScore(
  player1: PlayerState,
  player2: PlayerState,
  currentTeamState: TeamState
): TeamState {
  let newScore = currentTeamState.score;
  let newBags = currentTeamState.bags;

  const bid1 = player1.bid || 0;
  const bid2 = player2.bid || 0;
  const won1 = player1.tricksWon;
  const won2 = player2.tricksWon;

  // Handle Nil bids
  if (bid1 === 0) {
    if (won1 === 0) newScore += 100;
    else newScore -= 100;
  }
  if (bid2 === 0) {
    if (won2 === 0) newScore += 100;
    else newScore -= 100;
  }

  // Handle non-Nil bids
  const teamBid = (bid1 > 0 ? bid1 : 0) + (bid2 > 0 ? bid2 : 0);
  const teamWon = (bid1 > 0 ? won1 : 0) + (bid2 > 0 ? won2 : 0);

  if (teamBid > 0) {
    if (teamWon >= teamBid) {
      newScore += teamBid * 10;
      const overtricks = teamWon - teamBid;
      newScore += overtricks;
      newBags += overtricks;
    } else {
      newScore -= teamBid * 10;
    }
  }

  // Handle bag penalty
  while (newBags >= 10) {
    newScore -= 100;
    newBags -= 10;
  }

  return { score: newScore, bags: newBags };
}
