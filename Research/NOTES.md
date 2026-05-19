# Research notes

Working notes mapping the papers in this folder to consulting / positioning
angles for the Spades LLM Arena. This file is *not* product documentation —
it's a sales/credibility scratchpad.

## Papers in this folder

### `Besanson-2026-SARC-Agentic-AI-Governance.pdf` (arXiv 2605.07728v1)

Governance-by-architecture framework for tool-using LLM agents. Treats
constraints as first-class spec objects compiled into four enforcement sites
in the agent loop: **Pre-Action Gate**, **Action-Time Monitor**, **Post-Action
Auditor**, **Escalation Router**. Multi-agent extension via constraint
propagation, authority intersection, attribution-preserving trace trees.

**Consulting wedge:** *Agentic AI governance / runtime enforcement.* EU AI
Act and NIST AI RMF have created enterprise budget for "how do we put
guardrails on agentic systems." Spades Arena now ships a working reference
implementation of every SARC enforcement site — see the mapping below.

### `Thagard-2024-ChatGPT-Abductive-Reasoning-Benchmarks.pdf` (arXiv 2404.18982)

Benchmarks for evaluating creative + evaluative explanatory inference in
LLMs (ChatGPT, Claude, Gemini, Llama). Verbal Q&A scored by a human
researcher.

**Consulting wedge:** *Behavioral decision-quality evals.* Spades is a
quantitative, behavioral test of the same capability — inference under
hidden information — across all the same model families. Off-the-shelf
benchmarks (MMLU, HumanEval) don't measure that.

## SARC → engine mapping (reference for the governance pitch)

Every site SARC names has a concrete implementation in `src/engine/`:

| SARC site               | Implementation                                                                                                                                    |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pre-Action Gate**     | `getLegalPlays` in `src/engine/rules.ts` — filters the action space *before* the agent picks (must-follow-suit, opening-card rule, lead policy).  |
| **Action-Time Monitor** | `processPlay` in `src/engine/game.ts` — re-validates the committed action against ground truth (hand contents, ledSuit, spadesBroken).            |
| **Post-Action Auditor** | `cheatEvents[]` on `GameEngine` — append-only trace of every detected violation with seat, hand, trick, attempted action, consequence applied.    |
| **Escalation Router**   | `recordAndApplyCheat` in `src/engine/game.ts` — routes to `LogOnly` / `HandPenalty` / `GameForfeit` per the `CheatConsequence` declared in `CheatingPolicy`. |

The full per-game policy is declared as data (`CheatingPolicy` in
`src/engine/types.ts`) and persisted with each game record in the SpacetimeDB
`Game` table (`spacetime/module/src/lib.rs`, fields `allow_renege`,
`spades_lead_policy`, `minimum_team_bid`, `cheat_consequence_*`). That gives
us SARC's "specification-trace correspondence" out of the box: every game
row contains the constraints in force, and every cheat event references the
seat/hand/trick that violated them.

## Multi-agent extension

SARC §multi-agent talks about constraint propagation, authority
intersection, attribution-preserving trace trees. The arena is intrinsically
4-agent (one model per seat), and the Decision table is already keyed by
(`game_id`, `hand_id`, `model_id`, `seat`) — attribution is preserved by
construction. Authority intersection isn't exercised yet because we have
one constraint authority (the game engine), but the schema's `chat_policy`
and `prompt_cheating_mode` fields are sketches of how a second authority
(chat moderation, prompt-side cheating) could be layered without
restructuring the data model.

## What's still hypothetical

Be honest with prospects about what isn't yet built:

- **Chat-layer enforcement.** `chat_policy` field exists in schema; no chat
  is wired into the engine, so the field is currently inert.
- **Prompt-side cheating-mode.** `prompt_cheating_mode` (Silent / Permissive /
  Encouraged) is meant to widen what gets shown to the LLM in the
  observation. Not yet implemented — the engine sees and gates everything.
- **Decision-row writes.** The `Decision` table includes `engine_cheat_kind`
  and `self_reported_cheat`; the engine surfaces `cheatEvents`, but they
  aren't yet written to that table per-decision. The game row carries the
  policy and the count.

## Talking points for prospects

1. *"We built a working reference for SARC-style runtime enforcement,
   end-to-end, in a public benchmark."* Open code, public leaderboard,
   audit-trace data model — credible artifact, not slideware.
2. *"Same model providers, same prompt patterns, same audit table — we'll
   adapt it to your domain."* Cards is a stand-in; the substrate is
   general (declare constraint → compile into four sites → log + escalate).
3. *"Your team gets a 1–2 week proof of enforcement against a single
   high-priority constraint in your stack."* Concrete trial size for first
   engagement.

## What to do next (to make the pitch real)

- Run a sizable batch (1k+ games per matchup) across providers with each
  cheating preset enabled. Report renege-rate by model under
  `Permissive (LogOnly)` — this is a credibility number we can cite.
- Write up the framework: *"Auditable Multi-Agent LLM Benchmark with
  Runtime Constraint Enforcement."* Cite Thagard (behavioral reasoning
  eval) and Besanson (SARC) explicitly.
- Build a one-pager consulting offering: (a) private LLM benchmark design,
  (b) agentic governance architecture review. Link to this repo as
  reference work.
