import { Agent } from './base';
import { Observation, BidAction, PlayAction } from '../engine/types';
import { getSystemPrompt, getObservationPrompt } from './prompts';

export class OpenRouterAgent implements Agent {
  name: string;
  private apiKey: string;
  private model: string;
  private maxRetries: number;

  constructor(name: string, apiKey: string, model: string = 'openai/gpt-4o', maxRetries: number = 3) {
    this.name = name;
    this.apiKey = apiKey;
    this.model = model;
    this.maxRetries = maxRetries;
  }

  async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<any> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin, // Optional, for including your app on openrouter.ai rankings.
        "X-Title": "Spades AI Benchmark", // Optional. Shows in rankings on openrouter.ai.
      },
      body: JSON.stringify({
        "model": this.model,
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": userPrompt },
        ],
        "temperature": 0.2,
        "response_format": { "type": "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  }

  async bid(observation: Observation): Promise<BidAction> {
    const systemPrompt = getSystemPrompt(
      observation.seat,
      observation.seat % 2 === 0 ? 1 : 2,
      observation.partner_seat
    );
    const userPrompt = getObservationPrompt(observation);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const parsed = await this.callOpenRouter(systemPrompt, userPrompt);
        
        if (parsed.action !== 'bid' || typeof parsed.value !== 'number' || parsed.value < 0 || parsed.value > 13) {
          throw new Error('Invalid bid format or value');
        }

        return parsed as BidAction;
      } catch (error) {
        console.error(`OpenRouter Agent ${this.name} bid attempt ${attempt + 1} failed:`, error);
        if (attempt === this.maxRetries - 1) {
          return { action: 'bid', value: 1, reasoning: 'Fallback bid due to errors' };
        }
      }
    }
    return { action: 'bid', value: 1, reasoning: 'Fallback bid due to errors' };
  }

  async play(observation: Observation): Promise<PlayAction> {
    const systemPrompt = getSystemPrompt(
      observation.seat,
      observation.seat % 2 === 0 ? 1 : 2,
      observation.partner_seat
    );
    const userPrompt = getObservationPrompt(observation);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const parsed = await this.callOpenRouter(systemPrompt, userPrompt);

        if (parsed.action !== 'play' || typeof parsed.card !== 'string') {
          throw new Error('Invalid play format');
        }

        const legalPlays = observation.playing_context?.legal_plays || [];
        if (!legalPlays.includes(parsed.card)) {
          // Retry logic could be added here to ask LLM to fix illegal move
          throw new Error(`Illegal play: ${parsed.card}. Legal plays: ${legalPlays.join(', ')}`);
        }

        return parsed as PlayAction;
      } catch (error) {
        console.error(`OpenRouter Agent ${this.name} play attempt ${attempt + 1} failed:`, error);
        if (attempt === this.maxRetries - 1) {
          const legalPlays = observation.playing_context?.legal_plays || [];
          return { action: 'play', card: legalPlays[0], reasoning: 'Fallback play due to errors' };
        }
      }
    }
    const legalPlays = observation.playing_context?.legal_plays || [];
    return { action: 'play', card: legalPlays[0], reasoning: 'Fallback play due to errors' };
  }

  reset(): void {}
}
