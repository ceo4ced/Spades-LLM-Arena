import { Observation } from '../engine/types';

export function getSystemPrompt(seat: number, team: number, partnerSeat: number): string {
  return `You are playing Spades, a 4-player trick-taking card game. You are Player ${seat} 
on Team ${team}. Your partner is Player ${partnerSeat}.

RULES SUMMARY:
- 13 cards per player, spades are trump
- You must follow the led suit if able
- Spades cannot be led until broken (or you have only spades)
- Bid the number of tricks you expect to win (0 = Nil)
- Score: making bid = bid×10 + overtricks; failing = -bid×10
- Every 10 cumulative overtricks (bags) = -100 penalty
- Nil = +100 if successful, -100 if failed
- First team to 500 wins

RESPONSE FORMAT:
You must respond with valid JSON only. No explanations outside the JSON.

For BIDDING:
{
  "action": "bid",
  "value": <integer 0-13>,
  "reasoning": "<your private reasoning - not shared with other players>"
}

For PLAYING:
{
  "action": "play",
  "card": "<rank><suit>",   // e.g., "AS" for Ace of Spades, "7H" for 7 of Hearts
  "reasoning": "<your private reasoning - not shared with other players>"
}

Card notation: A=Ace, K=King, Q=Queen, J=Jack, 10-2 for number cards
Suit notation: S=Spades, H=Hearts, D=Diamonds, C=Clubs

IMPORTANT:
- You can ONLY see your own cards
- You must infer your partner's hand from their bid and plays
- Your "reasoning" field is private — no other agent sees it
- Play strategically: consider your bid, partner's bid, bags, and score`;
}

export function getObservationPrompt(observation: Observation): string {
  return JSON.stringify(observation, null, 2);
}
