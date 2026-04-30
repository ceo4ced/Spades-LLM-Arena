/**
 * OpenAIAgent — Spades agent backed by the OpenAI API directly (not via
 * OpenRouter). Uses the official `openai` SDK.
 *
 * Browser key handling matches AnthropicAgent — `dangerouslyAllowBrowser: true`
 * is required because the user's key lives in localStorage and we call from
 * the browser. Uses `response_format: { type: 'json_object' }` for native
 * JSON-mode output, mirroring the OpenRouter pattern.
 */

import OpenAI from 'openai';
import { Agent } from './base';
import { Observation, BidAction, PlayAction } from '../engine/types';
import { getSystemPrompt, getObservationPrompt } from './prompts';

export class OpenAIAgent implements Agent {
  name: string;
  private client: OpenAI;
  private model: string;
  private maxRetries: number;

  constructor(
    name: string,
    apiKey: string,
    model: string = 'gpt-4o',
    maxRetries: number = 3,
  ) {
    this.name = name;
    this.model = model;
    this.maxRetries = maxRetries;
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<any> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty OpenAI response');
    return JSON.parse(content);
  }

  async bid(observation: Observation): Promise<BidAction> {
    const systemPrompt = getSystemPrompt(
      observation.seat,
      observation.seat % 2 === 0 ? 1 : 2,
      observation.partner_seat,
    );
    const userPrompt = getObservationPrompt(observation);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const parsed = await this.call(systemPrompt, userPrompt);
        if (
          parsed.action !== 'bid' ||
          typeof parsed.value !== 'number' ||
          parsed.value < 0 ||
          parsed.value > 13
        ) {
          throw new Error('Invalid bid format or value');
        }
        return parsed as BidAction;
      } catch (error) {
        console.error(
          `OpenAI Agent ${this.name} bid attempt ${attempt + 1} failed:`,
          error,
        );
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
      observation.partner_seat,
    );
    const userPrompt = getObservationPrompt(observation);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const parsed = await this.call(systemPrompt, userPrompt);
        if (parsed.action !== 'play' || typeof parsed.card !== 'string') {
          throw new Error('Invalid play format');
        }
        const legalPlays = observation.playing_context?.legal_plays || [];
        if (!legalPlays.includes(parsed.card)) {
          throw new Error(
            `Illegal play: ${parsed.card}. Legal plays: ${legalPlays.join(', ')}`,
          );
        }
        return parsed as PlayAction;
      } catch (error) {
        console.error(
          `OpenAI Agent ${this.name} play attempt ${attempt + 1} failed:`,
          error,
        );
        if (attempt === this.maxRetries - 1) {
          const legalPlays = observation.playing_context?.legal_plays || [];
          return {
            action: 'play',
            card: legalPlays[0],
            reasoning: 'Fallback play due to errors',
          };
        }
      }
    }
    const legalPlays = observation.playing_context?.legal_plays || [];
    return {
      action: 'play',
      card: legalPlays[0],
      reasoning: 'Fallback play due to errors',
    };
  }

  reset(): void {}
}
