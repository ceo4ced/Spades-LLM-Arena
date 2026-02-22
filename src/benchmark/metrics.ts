export interface GameLog {
  gameId: string;
  winner: 'team1' | 'team2';
  score: { team1: number; team2: number };
  hands: HandLog[];
}

export interface HandLog {
  handNumber: number;
  bids: { seat: number; bid: number }[];
  tricksWon: { seat: number; won: number }[];
  scoreChange: { team1: number; team2: number };
  bagsChange: { team1: number; team2: number };
}

export class MetricsCalculator {
  logs: GameLog[];

  constructor(logs: GameLog[]) {
    this.logs = logs;
  }

  calculatePrimaryMetrics() {
    const totalGames = this.logs.length;
    let team1Wins = 0;
    let team2Wins = 0;
    let totalMargin = 0;

    let totalHands = 0;
    let totalBidDiff = 0; // For bid accuracy

    for (const log of this.logs) {
      if (log.winner === 'team1') team1Wins++;
      else team2Wins++;

      totalMargin += (log.score.team1 - log.score.team2);

      for (const hand of log.hands) {
        totalHands++;
        for (let i = 0; i < 4; i++) {
          const bid = hand.bids.find(b => b.seat === i)?.bid || 0;
          const won = hand.tricksWon.find(t => t.seat === i)?.won || 0;
          totalBidDiff += Math.abs(won - bid);
        }
      }
    }

    const winRateTeam1 = totalGames > 0 ? team1Wins / totalGames : 0;
    const avgScoreMargin = totalGames > 0 ? totalMargin / totalGames : 0;
    // Bid accuracy: 1 - mean(|tricks_won - bid| / 13) per hand per player
    // we have 4 players per hand, so total possible diff is 13 * 4 = 52 per hand?
    // Actually, max diff per player is 13.
    const avgBidDiffPerPlayer = totalHands > 0 ? totalBidDiff / (totalHands * 4) : 0;
    const bidAccuracy = 1 - (avgBidDiffPerPlayer / 13);

    return {
      winRateTeam1,
      winRateTeam2: 1 - winRateTeam1,
      avgScoreMargin,
      bidAccuracy,
    };
  }

  calculateAdvancedMetrics() {
    let team1Sets = 0;
    let team2Sets = 0;
    let totalHands = 0;

    let team1Bags = 0;
    let team1Overtricks = 0; // tricks won above bid
    let team2Bags = 0;
    let team2Overtricks = 0;

    for (const log of this.logs) {
      for (const hand of log.hands) {
        totalHands++;
        
        const t1Bid = (hand.bids.find(b => b.seat === 0)?.bid || 0) + (hand.bids.find(b => b.seat === 2)?.bid || 0);
        const t1Won = (hand.tricksWon.find(t => t.seat === 0)?.won || 0) + (hand.tricksWon.find(t => t.seat === 2)?.won || 0);
        
        const t2Bid = (hand.bids.find(b => b.seat === 1)?.bid || 0) + (hand.bids.find(b => b.seat === 3)?.bid || 0);
        const t2Won = (hand.tricksWon.find(t => t.seat === 1)?.won || 0) + (hand.tricksWon.find(t => t.seat === 3)?.won || 0);

        if (t1Bid > 0 && t1Won < t1Bid) team1Sets++;
        if (t2Bid > 0 && t2Won < t2Bid) team2Sets++;

        if (t1Bid > 0 && t1Won > t1Bid) {
          team1Overtricks += (t1Won - t1Bid);
          team1Bags += hand.bagsChange.team1;
        }
        if (t2Bid > 0 && t2Won > t2Bid) {
          team2Overtricks += (t2Won - t2Bid);
          team2Bags += hand.bagsChange.team2;
        }
      }
    }

    const setRateTeam1 = totalHands > 0 ? team1Sets / totalHands : 0;
    const setRateTeam2 = totalHands > 0 ? team2Sets / totalHands : 0;

    // Bag efficiency: 1 - (total_bags / total_tricks_won)
    // Actually, formula says: 1 - (total_bags / total_tricks_won)
    // Let's just use overtricks vs bags
    const bagEfficiencyTeam1 = team1Overtricks > 0 ? 1 - (team1Bags / team1Overtricks) : 1;
    const bagEfficiencyTeam2 = team2Overtricks > 0 ? 1 - (team2Bags / team2Overtricks) : 1;

    return {
      setRateTeam1,
      setRateTeam2,
      bagEfficiencyTeam1,
      bagEfficiencyTeam2,
    };
  }
}
