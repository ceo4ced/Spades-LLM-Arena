import { GameEngine } from './game';
import { Agent } from '../agents/base';
import { GameState, Observation } from './types';

export class GameRunner {
  engine: GameEngine;
  agents: Agent[];
  onStateChange: (state: GameState) => void;
  isRunning: boolean = false;
  delay: number = 1000; // Delay between bot moves in ms

  constructor(engine: GameEngine, agents: Agent[], onStateChange: (state: GameState) => void) {
    this.engine = engine;
    this.agents = agents;
    this.onStateChange = onStateChange;
  }

  async start() {
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  async loop() {
    while (this.isRunning) {
      const state = this.engine.state;
      this.onStateChange({ ...state }); // Notify UI

      if (state.phase === 'game_over') {
        this.isRunning = false;
        break;
      }

      const currentSeat = state.currentTurn;
      const currentAgent = this.agents[currentSeat];

      // If it's a human player (we'll use a special "HumanAgent" or just check if agent is null/special)
      // For now, let's assume if agent is null, we wait for UI interaction.
      if (!currentAgent) {
        // Wait for UI to call step() or processAction()
        return; 
      }

      // It's a bot, so we get their action
      const observation = this.engine.getObservation(currentSeat);
      
      // Add artificial delay for visual pacing
      await new Promise(resolve => setTimeout(resolve, this.delay));

      try {
        if (state.phase === 'bidding') {
          const action = await currentAgent.bid(observation);
          const error = this.engine.processBid(currentSeat, action);
          if (error) {
            console.error(`Agent ${currentSeat} error: ${error}`);
            // Simple fallback: bid 1
            this.engine.processBid(currentSeat, { action: 'bid', value: 1, reasoning: 'Fallback' });
          }
        } else if (state.phase === 'playing') {
          const action = await currentAgent.play(observation);
          const error = this.engine.processPlay(currentSeat, action);
          if (error) {
            console.error(`Agent ${currentSeat} error: ${error}`);
            // Simple fallback: play first legal card
            const legal = observation.playing_context?.legal_plays || [];
            if (legal.length > 0) {
              this.engine.processPlay(currentSeat, { action: 'play', card: legal[0], reasoning: 'Fallback' });
            }
          }
        }
      } catch (e) {
        console.error(`Agent ${currentSeat} crashed:`, e);
        this.isRunning = false;
        return;
      }
    }
  }

  // Called by UI for human moves
  humanAction(action: any) {
    const state = this.engine.state;
    const currentSeat = state.currentTurn;
    
    let error: string | null = null;
    if (state.phase === 'bidding') {
      error = this.engine.processBid(currentSeat, action);
    } else {
      error = this.engine.processPlay(currentSeat, action);
    }

    if (error) {
      console.error("Human action error:", error);
      return false;
    }

    this.onStateChange({ ...this.engine.state });
    
    // Resume loop if it was paused waiting for human
    if (this.isRunning) {
      this.loop();
    }
    return true;
  }
}
