import { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine } from '../engine/game';
import { GameState, BidAction, PlayAction, GameConfig } from '../engine/types';
import { Agent } from '../agents/base';
import { RandomAgent } from '../agents/random_agent';
import { HeuristicAgent } from '../agents/heuristic_agent';
import { LLMAgent } from '../agents/llm_agent';
import { OpenRouterAgent } from '../agents/openrouter_agent';
import { saveResult } from '../engine/resultsStore';

export function useGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isHumanTurn, setIsHumanTurn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const engineRef = useRef<GameEngine | null>(null);
  const agentsRef = useRef<(Agent | null)[]>([]);
  const isRunningRef = useRef(false);
  const loopIdRef = useRef(0);
  const modelConfigRef = useRef<{ team1Models: string[]; team2Models: string[] }>({ team1Models: [], team2Models: [] });

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-49), msg]); // Keep last 50 logs

  // Format a card ID like "KH" into "K♥"
  const SUIT_SYM: Record<string, string> = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };
  const formatCard = (cardId: string) => {
    const suit = cardId.slice(-1);
    const rank = cardId.slice(0, -1);
    return `${rank}${SUIT_SYM[suit] || suit}`;
  };

  // Emit trick summary: two lines after every trick
  const emitTrickSummary = (engine: GameEngine) => {
    const history = engine.state.trickHistory;
    if (history.length === 0) return;
    const lastTrick = history[history.length - 1];
    if (lastTrick.winner === null) return;
    const winnerName = engine.state.players[lastTrick.winner].name;
    const winningPlay = lastTrick.plays.find(p => p.seat === lastTrick.winner);
    const winningCard = winningPlay ? winningPlay.card.id : '?';
    const allCards = lastTrick.plays.map(p => p.card.id).join(', ');
    addLog(`${winnerName} won with ${winningCard} → ${allCards}`);
    addLog(`── Trick ${lastTrick.number} Complete ──`);
  };

  // Emit round summary logs after a hand ends
  const emitRoundSummary = (engine: GameEngine) => {
    const r = engine.lastHandResult;
    if (!r) return;
    addLog(`--- Hand ${r.handNumber} Results ---`);
    addLog(`Team 1: bid ${r.team1.bid}, won ${r.team1.won} | ${r.team1.pointsEarned >= 0 ? '+' : ''}${r.team1.pointsEarned} pts, ${r.team1.bagsEarned} bags`);
    addLog(`Team 2: bid ${r.team2.bid}, won ${r.team2.won} | ${r.team2.pointsEarned >= 0 ? '+' : ''}${r.team2.pointsEarned} pts, ${r.team2.bagsEarned} bags`);
    addLog(`Totals — T1: ${r.team1.totalScore} pts / ${r.team1.totalBags} bags | T2: ${r.team2.totalScore} pts / ${r.team2.totalBags} bags`);
    addLog(`--------------------------`);
    engine.lastHandResult = null;
  };

  const runLoop = useCallback(async (currentLoopId: number) => {
    if (!engineRef.current || !isRunningRef.current || loopIdRef.current !== currentLoopId) return;

    const engine = engineRef.current;
    const state = engine.state;

    // Check for game over
    if (state.phase === 'game_over') {
      const winner = state.teams.team1.score >= state.targetScore ? 1 : 2;
      addLog(`Game Over! Winner: ${winner === 1 ? 'Team 1' : 'Team 2'}`);

      // Auto-save result to leaderboard
      try {
        saveResult({
          date: new Date().toISOString(),
          team1Models: modelConfigRef.current.team1Models,
          team2Models: modelConfigRef.current.team2Models,
          team1Score: state.teams.team1.score,
          team2Score: state.teams.team2.score,
          team1Bags: state.teams.team1.bags,
          team2Bags: state.teams.team2.bags,
          winner: winner as 1 | 2,
          targetScore: state.targetScore,
          handsPlayed: state.handNumber,
        });
        addLog('Result saved to leaderboard.');
      } catch (e) { console.error('Failed to save result:', e); }

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

    // Get timing settings from Settings modal
    const cardDelay = parseInt(localStorage.getItem('spades_card_delay') || '800');
    const trickDelay = parseInt(localStorage.getItem('spades_trick_delay') || '2000');
    const speed = parseInt(localStorage.getItem('spades_game_speed') || '500');

    // Artificial delay for UI (bot thinking time)
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
        // If bidding just completed, show team bid totals
        if (engine.state.phase === 'playing') {
          const t1Bid = (engine.state.players[0].bid || 0) + (engine.state.players[2].bid || 0);
          const t2Bid = (engine.state.players[1].bid || 0) + (engine.state.players[3].bid || 0);
          addLog(`Team 1 Bids ${t1Bid} | Team 2 Bids ${t2Bid}`);
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

      // Pause after each card is played so viewers can see it
      await new Promise(resolve => setTimeout(resolve, cardDelay));

      // Check if loop was cancelled during card delay
      if (loopIdRef.current !== currentLoopId || !isRunningRef.current) return;

      // Check if trick is complete
      if (engine.isTrickComplete()) {
        // Wait to see all 4 cards before resolving
        await new Promise(resolve => setTimeout(resolve, trickDelay));
        if (loopIdRef.current !== currentLoopId || !isRunningRef.current) return;
        engine.resolveTrick();

        // Two-line trick summary for every trick
        emitTrickSummary(engine);

        // Round summary if hand just ended
        emitRoundSummary(engine);

        // If a new hand just started (trickHistory was reset), announce new round
        if (engine.state.phase === 'bidding' && engine.state.trickHistory.length === 0) {
          addLog(`═══ Round ${engine.state.handNumber} ═══`);
        }

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

    // Store model names for result saving
    const getModelLabel = (p: GameConfig['players'][0]) => {
      if (p.type === 'human') return 'Human';
      if (p.model === 'openrouter' && p.openrouter_model) return p.openrouter_model.split('/').pop() || p.openrouter_model;
      return p.model;
    };
    modelConfigRef.current = {
      team1Models: [getModelLabel(config.players[0]), getModelLabel(config.players[2])],
      team2Models: [getModelLabel(config.players[1]), getModelLabel(config.players[3])],
    };

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
      if (!error) {
        addLog(`You bid ${(action as BidAction).value}`);
        if (engine.state.phase === 'playing') {
          const t1Bid = (engine.state.players[0].bid || 0) + (engine.state.players[2].bid || 0);
          const t2Bid = (engine.state.players[1].bid || 0) + (engine.state.players[3].bid || 0);
          addLog(`Team 1 Bids ${t1Bid} | Team 2 Bids ${t2Bid}`);
        }
      }
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
      const trickDelay = parseInt(localStorage.getItem('spades_trick_delay') || '2000');
      setTimeout(() => {
        engine.resolveTrick();

        emitTrickSummary(engine);
        emitRoundSummary(engine);

        if (engine.state.phase === 'bidding' && engine.state.trickHistory.length === 0) {
          addLog(`═══ Round ${engine.state.handNumber} ═══`);
        }

        setGameState({ ...engine.state });
        // Resume loop after resolution
        if (isRunningRef.current) {
          runLoop(loopIdRef.current);
        }
      }, trickDelay);
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
