import { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine } from '../engine/game';
import { GameState, BidAction, PlayAction, GameConfig, ChatMessage } from '../engine/types';
import { ChatEnforcer } from '../engine/chat';
import { cardToIndex } from '../engine/deck';
import { Agent } from '../agents/base';
import { RandomAgent } from '../agents/random_agent';
import { HeuristicAgent } from '../agents/heuristic_agent';
import { LLMAgent } from '../agents/llm_agent';
import { OpenRouterAgent } from '../agents/openrouter_agent';
import { AnthropicAgent } from '../agents/anthropic_agent';
import { OpenAIAgent } from '../agents/openai_agent';
import { saveResult, type GameResult } from '../engine/resultsStore';
import { recordCompleteGame } from '../spacetime-results';

export function useGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isHumanTurn, setIsHumanTurn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const engineRef = useRef<GameEngine | null>(null);
  const agentsRef = useRef<(Agent | null)[]>([]);
  const chatEnforcerRef = useRef<ChatEnforcer | null>(null);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const isRunningRef = useRef(false);
  const loopIdRef = useRef(0);
  const modelConfigRef = useRef<{ team1Models: string[]; team2Models: string[] }>({ team1Models: [], team2Models: [] });

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-49), msg]);

  const SUIT_SYM: Record<string, string> = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };
  const formatCard = (cardId: string) => {
    const suit = cardId.slice(-1);
    const rank = cardId.slice(0, -1);
    return `${rank}${SUIT_SYM[suit] || suit}`;
  };

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

  const tryChat = async (engine: GameEngine, seat: number, agent: Agent) => {
    const enforcer = chatEnforcerRef.current;
    if (!enforcer || !agent.chat) return;
    const policy = engine.policy;
    if (policy.chatPolicy === 'None') return;

    try {
      const obs = engine.getObservationWithCheatingMode(seat, policy.promptCheatingMode);
      const visibleHistory = enforcer.filterForSeat(chatMessagesRef.current, seat);
      const chatAction = await agent.chat(obs, visibleHistory);
      if (!chatAction) return;

      const error = enforcer.validate(chatAction, seat);
      if (error) {
        addLog(`[Chat] ${engine.state.players[seat].name} blocked: ${error}`);
        return;
      }

      const hand = engine.state.players[seat].hand.map(c => c.id);
      const engineDetectedLie = enforcer.detectLie(chatAction, seat, hand);

      const msg: ChatMessage = {
        seat,
        text: chatAction.text,
        audience: chatAction.audience,
        targetSeat: chatAction.targetSeat,
        handNumber: engine.state.handNumber,
        phase: engine.state.phase as 'bidding' | 'playing',
        selfReportedCheat: chatAction.selfReportedCheat,
        engineDetectedLie,
      };

      chatMessagesRef.current = [...chatMessagesRef.current, msg];
      setChatMessages([...chatMessagesRef.current]);

      const label = chatAction.audience === 'public' ? '[ALL]'
        : chatAction.audience === 'partner' ? '[PARTNER]'
        : `[→P${chatAction.targetSeat}]`;
      addLog(`[Chat] ${engine.state.players[seat].name} ${label}: ${chatAction.text}${engineDetectedLie ? ' [LIE DETECTED]' : ''}`);
    } catch (e) {
      // Chat failures are non-fatal.
    }
  };

  const runLoop = useCallback(async (currentLoopId: number) => {
    if (!engineRef.current || !isRunningRef.current || loopIdRef.current !== currentLoopId) return;

    const engine = engineRef.current;
    const state = engine.state;

    if (state.phase === 'game_over') {
      const winner = state.teams.team1.score >= state.targetScore ? 1 : 2;
      addLog(`Game Over! Winner: ${winner === 1 ? 'Team 1' : 'Team 2'}`);

      const resultPayload: Omit<GameResult, 'id'> = {
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
      };
      try {
        const saved = saveResult(resultPayload);
        addLog('Result saved to leaderboard.');

        if (engine.cheatEvents.length > 0) {
          const summary = engine.cheatEvents
            .map((e) => `${e.kind}@seat${e.seat}/h${e.handNumber}t${e.trickNumber} → ${e.consequence}${e.penaltyApplied ? ` (-${e.penaltyApplied})` : ''}${e.endedGame ? ' [forfeit]' : ''}`)
            .join('; ');
          addLog(`Engine-detected cheats: ${engine.cheatEvents.length} — ${summary}`);
        }

        if (engine.decisions.length > 0) {
          addLog(`Recorded ${engine.decisions.length} decisions for SpacetimeDB.`);
        }

        recordCompleteGame(
          { ...saved },
          engine.variant,
          engine.policy,
          engine.rngSeed,
          engine.decisions,
          chatMessagesRef.current.length > 0 ? chatMessagesRef.current : undefined,
        ).catch((err) => {
          console.warn('SpacetimeDB record failed (non-fatal):', err);
        });
      } catch (e) {
        console.error('Failed to save result:', e);
      }

      isRunningRef.current = false;
      setGameState({ ...engine.state });
      setIsHumanTurn(false);
      return;
    }

    const currentSeat = state.currentTurn;
    const agent = agentsRef.current[currentSeat];

    if (!agent) {
      addLog(`Waiting for human player (Seat ${currentSeat})...`);
      setGameState({ ...engine.state });
      setIsHumanTurn(true);
      return;
    }

    setIsHumanTurn(false);

    const cardDelay = parseInt(localStorage.getItem('spades_card_delay') || '800');
    const trickDelay = parseInt(localStorage.getItem('spades_trick_delay') || '2000');
    const speed = parseInt(localStorage.getItem('spades_game_speed') || '500');

    await new Promise(resolve => setTimeout(resolve, speed));

    if (loopIdRef.current !== currentLoopId || !isRunningRef.current) return;

    try {
      const promptMode = engine.policy.promptCheatingMode;
      const observation = engine.getObservationWithCheatingMode(currentSeat, promptMode);
      const startTime = performance.now();

      if (state.phase === 'bidding') {
        const action = await agent.bid(observation);
        const latencyMs = Math.round(performance.now() - startTime);
        addLog(`Bot ${currentSeat} bids ${action.value}`);

        const cheatsBefore = engine.cheatEvents.length;
        const error = engine.processBid(currentSeat, action);
        if (error) {
          addLog(`Error processing bid for Seat ${currentSeat}: ${error}`);
          engine.processBid(currentSeat, { action: 'bid', value: 1, reasoning: 'Fallback' });
          engine.recordDecision(currentSeat, 0, 1, engine.getLegalBidMask(), latencyMs, 0);
        } else {
          const newCheat = engine.cheatEvents.length > cheatsBefore;
          const cheatCode = newCheat
            ? (await import('../engine/types')).engineCheatKindToCode(engine.cheatEvents[engine.cheatEvents.length - 1].kind)
            : 0;
          engine.recordDecision(currentSeat, 0, action.value, engine.getLegalBidMask(), latencyMs, cheatCode);
        }

        if (engine.state.phase === 'playing') {
          const t1Bid = (engine.state.players[0].bid || 0) + (engine.state.players[2].bid || 0);
          const t2Bid = (engine.state.players[1].bid || 0) + (engine.state.players[3].bid || 0);
          addLog(`Team 1 Bids ${t1Bid} | Team 2 Bids ${t2Bid}`);
        }

        // Chat opportunity after bidding.
        await tryChat(engine, currentSeat, agent);
      } else {
        const legalMask = engine.getLegalPlayMask(currentSeat);
        const action = await agent.play(observation);
        const latencyMs = Math.round(performance.now() - startTime);
        addLog(`Bot ${currentSeat} plays ${action.card}`);

        const cheatsBefore = engine.cheatEvents.length;
        const error = engine.processPlay(currentSeat, action);
        if (error) {
          addLog(`Error processing play for Seat ${currentSeat}: ${error}`);
          const legal = observation.playing_context?.legal_plays || [];
          if (legal.length > 0) {
            engine.processPlay(currentSeat, { action: 'play', card: legal[0], reasoning: 'Fallback' });
            engine.recordDecision(currentSeat, 1, cardToIndex(legal[0]), legalMask, latencyMs, 0);
          }
        } else {
          const newCheat = engine.cheatEvents.length > cheatsBefore;
          const cheatCode = newCheat
            ? (await import('../engine/types')).engineCheatKindToCode(engine.cheatEvents[engine.cheatEvents.length - 1].kind)
            : 0;
          engine.recordDecision(currentSeat, 1, cardToIndex(action.card), legalMask, latencyMs, cheatCode);
        }
      }

      setGameState({ ...engine.state });

      await new Promise(resolve => setTimeout(resolve, cardDelay));

      if (loopIdRef.current !== currentLoopId || !isRunningRef.current) return;

      if (engine.isTrickComplete()) {
        engine.resolveTrick();

        emitTrickSummary(engine);
        emitRoundSummary(engine);

        if (engine.state.phase === 'bidding' && engine.state.trickHistory.length === 0) {
          addLog(`═══ Round ${engine.state.handNumber} ═══`);
        }

        setGameState({ ...engine.state });

        await new Promise(resolve => setTimeout(resolve, trickDelay));
        if (loopIdRef.current !== currentLoopId || !isRunningRef.current) return;
      }

      runLoop(currentLoopId);

    } catch (e) {
      console.error(e);
      addLog(`Error in bot ${currentSeat}: ${e}`);
      isRunningRef.current = false;
    }
  }, []);

  const initGame = useCallback((config: GameConfig) => {
    isRunningRef.current = false;
    loopIdRef.current += 1;
    const currentLoopId = loopIdRef.current;

    const policy = config.cheatingPolicy;

    const engine = new GameEngine(
      config.targetScore,
      config.variant,
      undefined,
      policy,
      config.rngSeed,
    );
    engineRef.current = engine;

    chatEnforcerRef.current = new ChatEnforcer(policy?.chatPolicy ?? 'None');
    chatMessagesRef.current = [];
    setChatMessages([]);

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
        case 'openrouter': {
          const key = process.env.OPENROUTER_API_KEY;
          if (!key) {
            addLog(`Error: OPENROUTER_API_KEY missing in .env.local for ${name}. Defaulting to Random.`);
            return new RandomAgent(name);
          }
          return new OpenRouterAgent(name, key, player.openrouter_model);
        }
        case 'anthropic': {
          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) {
            addLog(`Error: ANTHROPIC_API_KEY missing in .env.local for ${name}. Defaulting to Random.`);
            return new RandomAgent(name);
          }
          return new AnthropicAgent(name, key, player.anthropic_model);
        }
        case 'openai': {
          const key = process.env.OPENAI_API_KEY;
          if (!key) {
            addLog(`Error: OPENAI_API_KEY missing in .env.local for ${name}. Defaulting to Random.`);
            return new RandomAgent(name);
          }
          return new OpenAIAgent(name, key, player.openai_model);
        }
        default: return new RandomAgent(name);
      }
    });
    agentsRef.current = agents;

    const getModelLabel = (p: GameConfig['players'][0]) => {
      if (p.type === 'human') return 'Human';
      if (p.model === 'openrouter' && p.openrouter_model) return p.openrouter_model.split('/').pop() || p.openrouter_model;
      if (p.model === 'anthropic' && p.anthropic_model) return p.anthropic_model;
      if (p.model === 'openai' && p.openai_model) return p.openai_model;
      return p.model;
    };
    modelConfigRef.current = {
      team1Models: [getModelLabel(config.players[0]), getModelLabel(config.players[2])],
      team2Models: [getModelLabel(config.players[1]), getModelLabel(config.players[3])],
    };

    setGameState({ ...engine.state });
    setLogs([
      'Game initialized. Starting...',
      `Seed: ${engine.rngSeed.toString()} (re-use for an identical deal)`,
      ...(policy?.chatPolicy !== 'None' ? [`Chat policy: ${policy.chatPolicy}`] : []),
      ...(policy?.promptCheatingMode !== 'Silent' ? [`Prompt cheating mode: ${policy.promptCheatingMode}`] : []),
    ]);
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
    loopIdRef.current += 1;
    engineRef.current = null;
    agentsRef.current = [];
    chatEnforcerRef.current = null;
    chatMessagesRef.current = [];
    setGameState(null);
    setLogs(['Game Session Ended']);
    setChatMessages([]);
    setIsPaused(false);
    setIsHumanTurn(false);
  }, []);

  useEffect(() => {
    if (isPaused) {
      isRunningRef.current = false;
    } else if (engineRef.current && !isRunningRef.current) {
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
        engine.recordDecision(currentSeat, 0, (action as BidAction).value, engine.getLegalBidMask(), 0, 0);
        if (engine.state.phase === 'playing') {
          const t1Bid = (engine.state.players[0].bid || 0) + (engine.state.players[2].bid || 0);
          const t2Bid = (engine.state.players[1].bid || 0) + (engine.state.players[3].bid || 0);
          addLog(`Team 1 Bids ${t1Bid} | Team 2 Bids ${t2Bid}`);
        }
      }
    } else {
      const legalMask = engine.getLegalPlayMask(currentSeat);
      error = engine.processPlay(currentSeat, action as PlayAction);
      if (!error) {
        addLog(`You played ${(action as PlayAction).card}`);
        engine.recordDecision(currentSeat, 1, cardToIndex((action as PlayAction).card), legalMask, 0, 0);
      }
    }

    if (error) {
      addLog(`Invalid move: ${error}`);
      return;
    }

    setGameState({ ...engine.state });
    setIsHumanTurn(false);

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
        if (isRunningRef.current) {
          runLoop(loopIdRef.current);
        }
      }, trickDelay);
    } else {
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
    chatMessages,
    isHumanTurn,
    isPaused,
    initGame,
    humanAction,
    togglePause,
    quitGame
  };
}
