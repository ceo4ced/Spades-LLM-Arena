import { Observation, BidAction, PlayAction } from '../engine/types';

export interface Agent {
  name: string;
  bid(observation: Observation): Promise<BidAction>;
  play(observation: Observation): Promise<PlayAction>;
  reset(): void;
}
