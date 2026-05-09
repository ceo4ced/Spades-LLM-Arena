import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterAgent } from './openrouter_agent';
import type { Observation } from '../engine/types';

const baseObservation = (): Observation => ({
  seat: 0,
  partner_seat: 2,
  hand: [],
  variant: 'standard',
  hand_number: 1,
  trick_history: [],
  scores: { team1: 0, team2: 0 },
  bags: { team1: 0, team2: 0 },
  bids: { 0: null, 1: null, 2: null, 3: null },
  tricks_won: { 0: 0, 1: 0, 2: 0, 3: 0 },
  current_turn: 0,
  spades_broken: false,
  target_score: 500,
  playing_context: { legal_plays: ['AS', 'KS'], current_trick: [], leader_seat: 0 },
} as unknown as Observation);

describe('OpenRouterAgent rate-limit fallback', () => {
  beforeEach(() => {
    // jsdom doesn't define `window.location.origin` consistently — stub it.
    vi.stubGlobal('window', { location: { origin: 'http://test' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to RandomAgent on first 429 and stops calling fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const agent = new OpenRouterAgent('test', 'fake-key', 'openai/gpt-oss-120b:free');

    const bid = await agent.bid(baseObservation());
    expect(bid.action).toBe('bid');
    // RandomAgent bids 1-5; the LLM-error fallback bids exactly 1 with reasoning "Fallback bid due to errors".
    expect(bid.reasoning).not.toMatch(/Fallback bid due to errors/);

    // Exactly one fetch call: the one that triggered the 429. Retry loop must NOT fire again.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Subsequent calls must skip fetch entirely.
    const play = await agent.play(baseObservation());
    expect(play.action).toBe('play');
    expect(['AS', 'KS']).toContain(play.card);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still 1 — never called again
  });

  it('reset() clears the rate-limited flag so the agent retries the LLM', async () => {
    const fetchMock = vi
      .fn()
      // first call: 429 → trips the fallback flag
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      // after reset(): a clean response
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ action: 'bid', value: 3, reasoning: 'live' }) } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const agent = new OpenRouterAgent('test', 'fake-key', 'openai/gpt-oss-120b:free');
    await agent.bid(baseObservation()); // trips 429
    agent.reset();

    const bid = await agent.bid(baseObservation());
    expect(bid.value).toBe(3);
    expect(bid.reasoning).toBe('live');
  });
});
