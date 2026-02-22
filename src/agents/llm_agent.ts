import { Agent } from './base';
import { Observation, BidAction, PlayAction } from '../engine/types';
import { getSystemPrompt, getObservationPrompt } from './prompts';
import { GoogleGenAI, Type } from '@google/genai';

export class LLMAgent implements Agent {
  name: string;
  private ai: GoogleGenAI;
  private modelName: string;
  private temperature: number;
  private maxRetries: number;

  constructor(name: string, modelName: string = 'gemini-3-flash-preview', temperature: number = 0.3, maxRetries: number = 3) {
    this.name = name;
    this.modelName = modelName;
    this.temperature = temperature;
    this.maxRetries = maxRetries;
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: this.temperature,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING },
                value: { type: Type.INTEGER },
                reasoning: { type: Type.STRING },
              },
              required: ['action', 'value', 'reasoning'],
            },
          },
        });

        const text = response.text;
        if (!text) throw new Error('Empty response from LLM');
        
        const parsed = JSON.parse(text);
        if (parsed.action !== 'bid' || typeof parsed.value !== 'number' || parsed.value < 0 || parsed.value > 13) {
          throw new Error('Invalid bid format or value');
        }

        return parsed as BidAction;
      } catch (error) {
        console.error(`LLM Agent ${this.name} bid attempt ${attempt + 1} failed:`, error);
        if (attempt === this.maxRetries - 1) {
          // Default bid
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
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: this.temperature,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING },
                card: { type: Type.STRING },
                reasoning: { type: Type.STRING },
              },
              required: ['action', 'card', 'reasoning'],
            },
          },
        });

        const text = response.text;
        if (!text) throw new Error('Empty response from LLM');
        
        const parsed = JSON.parse(text);
        if (parsed.action !== 'play' || typeof parsed.card !== 'string') {
          throw new Error('Invalid play format');
        }

        const legalPlays = observation.playing_context?.legal_plays || [];
        if (!legalPlays.includes(parsed.card)) {
          throw new Error(`Illegal play: ${parsed.card}. Legal plays: ${legalPlays.join(', ')}`);
        }

        return parsed as PlayAction;
      } catch (error) {
        console.error(`LLM Agent ${this.name} play attempt ${attempt + 1} failed:`, error);
        if (attempt === this.maxRetries - 1) {
          // Default play
          const legalPlays = observation.playing_context?.legal_plays || [];
          return { action: 'play', card: legalPlays[0], reasoning: 'Fallback play due to errors' };
        }
      }
    }

    const legalPlays = observation.playing_context?.legal_plays || [];
    return { action: 'play', card: legalPlays[0], reasoning: 'Fallback play due to errors' };
  }

  reset(): void {
    // No state to reset
  }
}
