import { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine } from '../engine/game';
import { GameState, BidAction, PlayAction, GameConfig } from '../engine/types';
import { Agent } from '../agents/base';
import { RandomAgent } from '../agents/random_agent';
import { HeuristicAgent } from '../agents/heuristic_agent';
import { LLMAgent } from '../agents/llm_agent';
import { OpenRouterAgent } from '../agents/openrouter_agent';

export function useGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isHumanTurn, setIsHumanTurn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const engineRef = useRef<GameEngine | null>(null);
  const agentsRef = useRef<(Agent | null)[]>([]);
  const isRunningRef = useRef(false);
  const loopIdRef = useRef(0);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-49), msg]); // Keep last 50 logs

  const runLoop = useCallback(async (currentLoopId: number) => {
    if (!engineRef.current || !isRunningRef.current || loopIdRef.current !== currentLoopId) return;

    const engine = engineRef.current;
    const state = engine.state;

    // Check for game over
    if (state.phase === 'game_over') {
      addLog(`Game Over! Winner: ${state.teams.team1.score >= state.targetScore ? 'Team 1' : 'Team 2'}`);
      isRunningRef.current = false;
      setGameState({ ...engine.state });
      setIsHumanTurn(false);
      return;
    }

    const currentSeat = state.currentTurn;
    const agent = agentsRef.current[currentSeat];

    // If human's turn, stop and wait
    if (!agent) {
      addLog(`Waiting for human player (Seat ${currentSeat})...`);
      setGameState({ ...engine.state });
      setIsHumanTurn(true);
      return;
    }

    setIsHumanTurn(false);

    // Bot's turn
    // addLog(`Bot ${currentSeat} thinking...`);

    // Get speed from settings
    const speed = parseInt(localStorage.getItem('spades_game_speed') || '500');

    // Artificial delay for UI
    await new Promise(resolve => setTimeout(resolve, speed));

    // Check if loop was cancelled during delay
    if (loopIdRef.current !== currentLoopId || !isRunningRef.current) return;

    try {
      const observation = engine.getObservation(currentSeat);

      if (state.phase === 'bidding') {
        const action = await agent.bid(observation);
        addLog(`Bot ${currentSeat} bids ${action.value}`);
        const error = engine.processBid(currentSeat, action);
        if (error) {
          addLog(`Error processing bid for Seat ${currentSeat}: ${error}`);
          // Fallback
          engine.processBid(currentSeat, { action: 'bid', value: 1, reasoning: 'Fallback' });
        }
      } else {
        const action = await agent.play(observation);
        addLog(`Bot ${currentSeat} plays ${action.card}`);
        const error = engine.processPlay(currentSeat, action);
        if (error) {
          addLog(`Error processing play for Seat ${currentSeat}: ${error}`);
          // Fallback
          const legal = observation.playing_context?.legal_plays || [];
          if (legal.length > 0) {
            engine.processPlay(currentSeat, { action: 'play', card: legal[0], reasoning: 'Fallback' });
          }
        }
      }

      setGameState({ ...engine.state });

      // Check if trick is complete
      if (engine.isTrickComplete()) {
        // Wait to see the last card
        await new Promise(resolve => setTimeout(resolve, speed + 500)); // Extra delay
        engine.resolveTrick();
        setGameState({ ...engine.state });
      }

      // Continue loop
      runLoop(currentLoopId);

    } catch (e) {
      console.error(e);
      addLog(`Error in bot ${currentSeat}: ${e}`);
      isRunningRef.current = false;
    }
  }, []);

  const initGame = useCallback((config: GameConfig) => {
    // Stop existing loop
    isRunningRef.current = false;
    loopIdRef.current += 1;
    const currentLoopId = loopIdRef.current;

    const engine = new GameEngine(config.targetScore, config.variant);
    engineRef.current = engine;

    // Update player names and types in engine state
    engine.state.players.forEach((p, i) => {
      p.name = config.players[i].name;
      p.type = config.players[i].type;
    });

    const agents = config.players.map((player, index) => {
      if (player.type === 'human') return null;

      const name = player.name || `Bot ${index}`;

      switch (player.model) {
        case 'random': return new RandomAgent(name);
        case 'heuristic': return new HeuristicAgent(name);
        case 'gemini-flash': return new LLMAgent(name, 'gemini-3-flash-preview');
        case 'gemini-pro': return new LLMAgent(name, 'gemini-3.1-pro-preview');
        case 'openrouter':
          if (!config.openrouter_api_key) {
            addLog(`Error: OpenRouter API Key missing for ${name}. Defaulting to Random.`);
            return new RandomAgent(name);
          }
          return new OpenRouterAgent(name, config.openrouter_api_key, player.openrouter_model);
        default: return new RandomAgent(name);
      }
    });
    agentsRef.current = agents;

    setGameState({ ...engine.state });
    setLogs(['Game initialized. Starting...']);
    setIsPaused(false);

    isRunningRef.current = true;
    runLoop(currentLoopId);
  }, [runLoop]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      const isNowPaused = !prev;
      if (isNowPaused) {
        addLog('Game Paused');
      } else {
        addLog('Game Resumed');
      }
      return isNowPaused;
    });
  }, []);

  const quitGame = useCallback(() => {
    isRunningRef.current = false;
    loopIdRef.current += 1; // invalidate any pending timeouts
    engineRef.current = null;
    agentsRef.current = [];
    setGameState(null);
    setLogs(['Game Session Ended']);
    setIsPaused(false);
    setIsHumanTurn(false);
  }, []);

  useEffect(() => {
    if (isPaused) {
      isRunningRef.current = false;
    } else if (engineRef.current && !isRunningRef.current) {
      // Resume
      isRunningRef.current = true;
      runLoop(loopIdRef.current);
    }
  }, [isPaused, runLoop]);

  const humanAction = useCallback(async (action: BidAction | PlayAction) => {
    if (!engineRef.current) return;
    const engine = engineRef.current;
    const currentSeat = engine.state.currentTurn;

    let error: string | null = null;
    if (action.action === 'bid') {
      error = engine.processBid(currentSeat, action as BidAction);
      if (!error) addLog(`You bid ${(action as BidAction).value}`);
    } else {
      error = engine.processPlay(currentSeat, action as PlayAction);
      if (!error) addLog(`You played ${(action as PlayAction).card}`);
    }

    if (error) {
      addLog(`Invalid move: ${error}`);
      return;
    }

    setGameState({ ...engine.state });
    setIsHumanTurn(false);

    // If human completed the trick, we need to resolve it
    if (engine.isTrickComplete()) {
      const speed = parseInt(localStorage.getItem('spades_game_speed') || '500');
      setTimeout(() => {
        engine.resolveTrick();
        setGameState({ ...engine.state });
        // Resume loop after resolution
        if (isRunningRef.current) {
          runLoop(loopIdRef.current);
        }
      }, speed + 500);
    } else {
      // Resume loop for bots
      if (isRunningRef.current) {
        runLoop(loopIdRef.current);
      }
    }
  }, [runLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        togglePause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      isRunningRef.current = false;
    };
  }, [togglePause]);

  return {
    gameState,
    logs,
    isHumanTurn,
    isPaused,
    initGame,
    humanAction,
    togglePause,
    quitGame
  };
}
