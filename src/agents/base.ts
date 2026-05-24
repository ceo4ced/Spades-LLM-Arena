import { Observation, BidAction, PlayAction, ChatAction, ChatMessage } from '../engine/types';

export interface Agent {
  name: string;
  bid(observation: Observation): Promise<BidAction>;
  play(observation: Observation): Promise<PlayAction>;
  chat?(observation: Observation, chatHistory: ChatMessage[]): Promise<ChatAction | null>;
  reset(): void;
}
