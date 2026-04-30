/**
 * AnthropicAgent — Spades agent backed by the Anthropic Claude API directly
 * (not via OpenRouter). Uses the official @anthropic-ai/sdk.
 *
 * Note: this runs in the browser with the user's key from localStorage, so
 * `dangerouslyAllowBrowser: true` is required. The Anthropic SDK handles the
 * CORS preflight via the `anthropic-dangerous-direct-browser-access` header
 * that flag enables.
 *
 * We intentionally do not enable adaptive thinking here — a Spades turn needs
 * a sub-second decision and the prompt is already structured. Sampling
 * parameters (temperature/top_p/top_k) are also omitted because Opus 4.7
 * 400s on them; older Claude models accept temperature but we keep behavior
 * uniform across versions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Agent } from './base';
import { Observation, BidAction, PlayAction } from '../engine/types';
import { getSystemPrompt, getObservationPrompt } from './prompts';

const JSON_OUTPUT_INSTRUCTION =
  '\n\nRespond with a single JSON object only. Do not wrap it in markdown code fences.';

export class AnthropicAgent implements Agent {
  name: string;
  private client: Anthropic;
  private model: string;
  private maxRetries: number;

  constructor(
    name: string,
    apiKey: string,
    model: string = 'claude-opus-4-7',
    maxRetries: number = 3,
  ) {
    this.name = name;
    this.model = model;
    this.maxRetries = maxRetries;
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<any> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt + JSON_OUTPUT_INSTRUCTION,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Anthropic response');
    }

    let raw = textBlock.text.trim();
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    return JSON.parse(raw);
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
          `Anthropic Agent ${this.name} bid attempt ${attempt + 1} failed:`,
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
          `Anthropic Agent ${this.name} play attempt ${attempt + 1} failed:`,
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
