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

- **LLM chat implementations.** The chat enforcement layer is built and
  working (ChatEnforcer validates policy, detects lies, filters by audience),
  but no LLM agent actually generates chat yet — the `chat()` method is
  optional on Agent and only called if the agent implements it. Heuristic
  and Random agents don't chat.
- **Per-hand SpacetimeDB writes.** Decision writes use a synthetic hand_id
  derived from game_id. Full per-hand records (deal encoding, bid packing,
  score deltas) aren't written yet — the Hand table schema exists but
  `record_hand` isn't called from the game loop.

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

## Thagard's imperfect-information gap (key positioning angle)

Thagard (2024) proposes benchmarks for *explanatory inference* — the
creation and evaluation of hypotheses that explain puzzling observations. His
framework evaluates LLMs across three axes: **domains** (20+ fields from
physics to poetry), **modalities** (verbal, visual), and **inference type**
(creative hypothesis formation vs. evaluative hypothesis selection). He finds
ChatGPT 4 performs at the level of "a sophisticated graduate student" across
all tested domains.

### What Thagard tests

- Verbal Q&A: "Evaluate competing hypotheses about X" / "Generate a novel
  hypothesis about X." Scored by the human researcher.
- One-shot prompts — no sequential interaction, no follow-up conditioned on
  the model's earlier actions.
- Full information in every prompt — the model receives all relevant facts
  and reasons about them. Nothing is hidden.

### What Thagard does NOT test

- **Partial observability / hidden information.** Every Thagard prompt gives
  the model the complete evidence set. No benchmark requires the model to
  *infer what it cannot see* from what it *can* see — the core challenge of
  imperfect-information games.
- **Sequential, interactive reasoning.** Thagard's benchmarks are single-turn.
  The model never has to update beliefs across a series of rounds where new
  evidence arrives and earlier actions constrain future options.
- **Adversarial counter-play.** Thagard's evidence is static. No opponent is
  actively trying to mislead or exploit the model's inferences.
- **Behavioral measurement.** Thagard scores verbal answers by hand. There is
  no quantitative, action-level metric — no win rate, no trick accuracy, no
  bid calibration.
- **Partnership / theory of mind under action.** Thagard mentions
  "interpersonal relations" as a domain (p. 7) but only tests whether the
  model can *talk about* other people's mental states, not whether it can
  *coordinate actions* with a partner whose hand it cannot see.

### Why Spades fills the gap

In Thagard's own taxonomy, every trick of Spades exercises explanatory
inference:

| Thagard category              | Spades analogue                                                                                         |
|-------------------------------|---------------------------------------------------------------------------------------------------------|
| **Causal reasoning**          | "Why did West play that card?" → infer motive from action (void in suit? setting up a later trick?)     |
| **Existential abduction**     | "What cards *must* be in the unseen hands?" → postulate hidden state from observed plays                |
| **Evaluative coherence**      | "Which distribution of remaining cards best explains the play history?" → rank competing hypotheses     |
| **Augmentative abduction**    | "My partner bid 4 but has only taken 1 — what does that update about their remaining strength?"         |
| **Distributed cognition**     | Partner-seat coordination: two models must co-infer without communication, using only shared play state |

But Spades goes *beyond* Thagard's framework in three ways Thagard never
addresses:

1. **Act-on-inference.** The model must *commit to a card* based on its
   explanatory inferences — not just answer a question. Bad inference →
   measurable loss (tricks, bags, set hands).
2. **Sequential belief update.** Over 13 tricks per hand and multiple hands
   per game, the model must revise its hypotheses as new evidence arrives.
   Thagard's one-shot prompts don't test this.
3. **Adversarial information environments.** Opponents may play deceptively
   (e.g., breaking suit early to mislead count). The evidence itself is
   strategically polluted — unlike Thagard's curated prompts.

### Consulting pitch (Thagard angle)

*"Thagard (2024) showed that LLMs can do explanatory inference — generate
and evaluate hypotheses — at graduate-student level across 20+ domains. But
his benchmarks are verbal, one-shot, and full-information. He never tested
whether models can do explanatory inference where it matters most:
sequentially, under hidden information, against adversaries. Spades Arena
is that test. Same model families, same capability (abductive reasoning),
but measured behaviorally at scale — thousands of games, per-trick
resolution, quantitative win/loss metrics."*

This positions Spades as the *behavioral complement* to Thagard's verbal
benchmarks. Thagard asks "can the model reason explanatorily?" (yes).
Spades asks "can the model *act* on explanatory reasoning under imperfect
information?" — a harder, more operationally relevant question for
enterprise buyers who care about agentic decision quality.

### Citation note

Thagard mentions "game playing" exactly once (p. 6, listing traditional AI
domains) and never returns to it. He does not cite any game-based LLM
evaluation. The entire paper's reference list contains no game-theory,
poker, or card-game benchmarks. This is an uncontested lane.

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
