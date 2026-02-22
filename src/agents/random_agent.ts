import { Agent } from './base';
import { Observation, BidAction, PlayAction } from '../engine/types';

export class RandomAgent implements Agent {
  name: string;

  constructor(name: string = 'RandomBot') {
    this.name = name;
  }

  async bid(observation: Observation): Promise<BidAction> {
    // Bids uniformly random 1-5
    const value = Math.floor(Math.random() * 5) + 1;
    return {
      action: 'bid',
      value,
      reasoning: 'I am a random bot, bidding randomly between 1 and 5.',
    };
  }

  async play(observation: Observation): Promise<PlayAction> {
    const legalPlays = observation.playing_context?.legal_plays || [];
    if (legalPlays.length === 0) {
      throw new Error('No legal plays available');
    }
    const randomIndex = Math.floor(Math.random() * legalPlays.length);
    const card = legalPlays[randomIndex];
    
    return {
      action: 'play',
      card,
      reasoning: 'I am a random bot, playing a random legal card.',
    };
  }

  reset(): void {
    // No state to reset
  }
}
