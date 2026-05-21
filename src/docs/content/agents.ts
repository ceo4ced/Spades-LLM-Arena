import type { DocCategory } from './types';

export const agents: DocCategory = {
  id: 'agents',
  title: 'Agents',
  intro:
    'Every seat is filled by an Agent. They are stateless from the engine\'s perspective — the engine sends an ' +
    'Observation, the agent returns an Action. Provider-specific files (anthropic, openai, openrouter, gemini) ' +
    'all implement the same Agent interface. Random and Heuristic are baselines.',
  topics: [
    {
      id: 'agent-base',
      title: 'Agent interface',
      summary: 'The 3-method contract every seat must implement.',
      status: 'shipped',
      files: ['src/agents/base.ts'],
      layers: {
        abstract:
          'Three methods: bid, play, reset. bid and play are async because real agents call HTTP APIs; the engine ' +
          'awaits them per turn. reset is used when retrying mid-game (e.g., the OpenRouter rate-limit fallback ' +
          'cleared via reset()).',
        iface:
          'public interface Agent {\n' +
          '    String                  name();\n' +
          '    Future<BidAction>       bid(Observation o);\n' +
          '    Future<PlayAction>      play(Observation o);\n' +
          '    void                    reset();\n' +
          '}',
        pseudocode:
          '// All agents follow the same shape:\n' +
          'class XxxAgent implements Agent:\n' +
          '    constructor(name, …provider-config):\n' +
          '        store config; store any sticky state (e.g., rate-limited flag)\n' +
          '    bid(obs):\n' +
          '        decision = computeDecision(obs)        // provider-specific\n' +
          '        return {action: "bid", value, reasoning}\n' +
          '    play(obs):\n' +
          '        decision = computeDecision(obs)\n' +
          '        return {action: "play", card, reasoning}\n' +
          '    reset():\n' +
          '        clear sticky state (rate-limited flag etc.)\n',
      },
    },

    {
      id: 'random-agent',
      title: 'RandomAgent',
      summary: 'Bids 1–5 uniformly, plays a uniformly random legal card. The baseline.',
      status: 'shipped',
      files: ['src/agents/random_agent.ts'],
      layers: {
        abstract:
          'The control condition. Every benchmark needs one: if a model can\'t beat random, you have a problem. ' +
          'Also the fallback when an LLM 429s or errors out, and the engine\'s last-ditch recovery if it ever has ' +
          'to apply a fallback action mid-loop.',
        iface:
          'public class RandomAgent implements Agent {\n' +
          '    public RandomAgent(String name);\n' +
          '    // bid:  returns {action:"bid", value: floor(rand()*5)+1, reasoning:"random"}\n' +
          '    // play: picks uniformly from obs.playing_context.legal_plays\n' +
          '}',
        pseudocode:
          'bid(obs):\n' +
          '    return {action: "bid", value: 1 + floor(Math.random() * 5), reasoning: "random"}\n' +
          '\n' +
          'play(obs):\n' +
          '    legal = obs.playing_context.legal_plays\n' +
          '    return {action: "play", card: legal[floor(Math.random() * legal.length)], reasoning: "random"}\n',
      },
    },

    {
      id: 'heuristic-agent',
      title: 'HeuristicAgent',
      summary: 'Rule-of-thumb bidder + card chooser. Fast, deterministic-ish baseline.',
      status: 'shipped',
      files: ['src/agents/heuristic_agent.ts'],
      layers: {
        abstract:
          'A simple hand-evaluator: counts aces, kings, and long-spade structures for the bid; for plays, follows ' +
          'a fixed priority (try to win cheaply when partner is losing the trick, dump low otherwise). Not strong, ' +
          'but consistent — useful as a sanity check that the engine is feeding sensible observations.',
        iface:
          'public class HeuristicAgent implements Agent {\n' +
          '    public HeuristicAgent(String name);\n' +
          '    // bid:  derives a value from hand strength heuristics\n' +
          '    // play: picks per a small decision tree over the legal set\n' +
          '}',
        pseudocode:
          'bid(obs):\n' +
          '    hand = obs.hand.map(parseCard)\n' +
          '    strength = #aces*1.0 + #kings*0.5 + #spades_over_3*0.5 + voidSuitBonus\n' +
          '    return {action: "bid", value: clamp(round(strength), 1, 6), reasoning: "heuristic"}\n' +
          '\n' +
          'play(obs):\n' +
          '    legal = obs.playing_context.legal_plays\n' +
          '    if we lead:                       return lowest non-spade if spades unbroken else lowest legal\n' +
          '    if partner is winning current trick:  dump lowest legal\n' +
          '    if we can beat the current winner cheaply: do so with smallest winning card\n' +
          '    else dump lowest legal\n',
      },
    },

    {
      id: 'llm-agent',
      title: 'LLMAgent (Gemini)',
      summary: 'Uses @google/genai for Gemini Flash/Pro. JSON-mode prompts.',
      status: 'shipped',
      files: ['src/agents/llm_agent.ts'],
      layers: {
        abstract:
          'Calls Google\'s generative AI SDK directly. Two model handles: gemini-3-flash-preview and ' +
          'gemini-3.1-pro-preview. Prompt structure comes from src/agents/prompts.ts and is shared across providers. ' +
          'On error or invalid JSON, falls back to RandomAgent for that decision.',
        iface:
          'public class LLMAgent implements Agent {\n' +
          '    public LLMAgent(String name, String geminiModelId);\n' +
          '}',
        pseudocode:
          'bid(obs):\n' +
          '    prompt = buildBidPrompt(obs)\n' +
          '    try:\n' +
          '        resp = await genai.models.generateContent({\n' +
          '            model: this.modelId, contents: [prompt],\n' +
          '            generationConfig: {responseMimeType: "application/json"}\n' +
          '        })\n' +
          '        return parseJson(resp.text)               // {action:"bid", value, reasoning}\n' +
          '    catch:\n' +
          '        return RandomAgent.bid(obs)               // fallback\n' +
          'play similar.\n',
      },
    },

    {
      id: 'openrouter-agent',
      title: 'OpenRouterAgent',
      summary: 'Default LLM provider. Multi-model gateway with one-way 429 → Random fallback.',
      status: 'shipped',
      files: ['src/agents/openrouter_agent.ts', 'src/agents/openrouter_agent.test.ts'],
      layers: {
        abstract:
          'The default and most-used agent. Hits OpenRouter\'s OpenAI-compatible chat-completions endpoint. ' +
          'Includes a one-way rate-limit flag: the first 429 trips the flag and every subsequent decision delegates ' +
          'to a private RandomAgent — prevents retry-storming. reset() clears the flag, used when an operator ' +
          'wants to retry the live API.',
        iface:
          'public class OpenRouterAgent implements Agent {\n' +
          '    public OpenRouterAgent(String name, String apiKey, String? modelId);\n' +
          '    public void reset();                              // clears rate-limited flag\n' +
          '}',
        pseudocode:
          'private rateLimited = false\n' +
          'private fallback    = new RandomAgent(name)\n' +
          '\n' +
          'bid(obs) / play(obs):\n' +
          '    if rateLimited: return fallback.bid|play(obs)\n' +
          '    body = chatCompletionPayload(modelId, buildPrompt(obs), responseFormat="json_object")\n' +
          '    resp = await fetch("https://openrouter.ai/api/v1/chat/completions", body)\n' +
          '    if resp.status == 429:\n' +
          '        rateLimited = true\n' +
          '        return fallback.bid|play(obs)\n' +
          '    json = await resp.json()\n' +
          '    return parseJson(json.choices[0].message.content)\n',
      },
    },

    {
      id: 'anthropic-agent',
      title: 'AnthropicAgent',
      summary: 'Direct Claude API via @anthropic-ai/sdk. Opus/Sonnet/Haiku model IDs.',
      status: 'shipped',
      files: ['src/agents/anthropic_agent.ts'],
      layers: {
        abstract:
          'Direct Claude calls (no OpenRouter middleman). Useful when measuring Claude in isolation or when the ' +
          'caller has an ANTHROPIC_API_KEY but no OpenRouter account.',
        iface:
          'public class AnthropicAgent implements Agent {\n' +
          '    public AnthropicAgent(String name, String apiKey, String? modelId);\n' +
          '}',
        pseudocode:
          'bid(obs):\n' +
          '    prompt   = buildBidPrompt(obs)\n' +
          '    response = await anthropic.messages.create({\n' +
          '        model: modelId, max_tokens: 512,\n' +
          '        messages: [{role: "user", content: prompt}]\n' +
          '    })\n' +
          '    text = response.content[0].text\n' +
          '    return parseJsonStrictOrFallback(text)\n',
      },
    },

    {
      id: 'openai-agent',
      title: 'OpenAIAgent',
      summary: 'Direct GPT-4o / GPT-4o-mini via the official openai SDK.',
      status: 'shipped',
      files: ['src/agents/openai_agent.ts'],
      layers: {
        abstract:
          'Mirror of AnthropicAgent for GPT models. Same JSON-mode prompt path; same fallback semantics.',
        iface:
          'public class OpenAIAgent implements Agent {\n' +
          '    public OpenAIAgent(String name, String apiKey, String? modelId);\n' +
          '}',
        pseudocode:
          'bid(obs):\n' +
          '    resp = await openai.chat.completions.create({\n' +
          '        model: modelId,\n' +
          '        response_format: {type: "json_object"},\n' +
          '        messages: [{role: "user", content: buildPrompt(obs)}]\n' +
          '    })\n' +
          '    return parseJson(resp.choices[0].message.content)\n',
      },
    },

    {
      id: 'prompts',
      title: 'prompts.ts — shared prompt builders',
      summary: 'Single source of truth for the LLM prompt structure.',
      status: 'shipped',
      files: ['src/agents/prompts.ts'],
      layers: {
        abstract:
          'Every LLM-backed agent calls one of two helpers: buildBidPrompt(obs) or buildPlayPrompt(obs). Centralising ' +
          'the prompt keeps all four LLM agents comparable — a change here affects everyone consistently. The prompt ' +
          'currently shows only the strict legal-plays list, regardless of CheatingPolicy.allowRenege (see "honest ' +
          'gaps" in Research/NOTES.md).',
        iface:
          'public final class Prompts {\n' +
          '    public static String buildBidPrompt(Observation o);\n' +
          '    public static String buildPlayPrompt(Observation o);\n' +
          '}',
        pseudocode:
          'buildPlayPrompt(obs):\n' +
          '    return [\n' +
          '        "You are playing Spades. You are seat ${obs.seat} (team ${teamOf(obs.seat)}).",\n' +
          '        "Your partner is seat ${obs.partner_seat}.",\n' +
          '        "Your hand: ${obs.hand.join(\\", \\")}",\n' +
          '        "Bids:   ${formatBids(obs)}",\n' +
          '        "Score:  T1=${obs.score.team1.points} T2=${obs.score.team2.points}",\n' +
          '        "Trick history: ${formatTrickHistory(obs)}",\n' +
          '        "Current trick so far: ${obs.playing_context.current_trick}",\n' +
          '        "Legal plays: ${obs.playing_context.legal_plays.join(\\", \\")}",\n' +
          '        "Return JSON: {\\"action\\":\\"play\\",\\"card\\":\\"<id>\\",\\"reasoning\\":\\"<short>\\"}"\n' +
          '    ].join(\\"\\\\n\\")\n',
      },
    },
  ],
};
